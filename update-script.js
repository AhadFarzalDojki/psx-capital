const admin = require('firebase-admin');
const fetch = require('node-fetch');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchLivePrice(symbol, apiKey) {
  // EOD uses .KSE for Pakistan stocks, but their real-time API might not need it for all symbols.
  // We will try both formats for robustness.
  const tickerKSE = `${symbol}.KSE`;
  const urlKSE = `https://eodhistoricaldata.com/api/real-time/${tickerKSE}?api_token=${apiKey}&fmt=json`;
  
  try {
    let res = await fetch(urlKSE);
    if (res.ok) {
        const data = await res.json();
        if (data.close && data.close > 0) return data.close;
    }
    // If .KSE fails, try the plain symbol (for indexes like KSE100.INDX)
    const urlPlain = `https://eodhistoricaldata.com/api/real-time/${symbol}?api_token=${apiKey}&fmt=json`;
    res = await fetch(urlPlain);
    if (res.ok) {
        const data = await res.json();
        return data.close || 0;
    }
    console.error(`EOD API error for ${symbol}: ${res.status}`);
    return 0;
  } catch (e) {
    console.error(`Failed to fetch ${symbol}`, e);
    return 0;
  }
}

async function main() {
  try {
    const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.DATABASE_URL
    });
    const db = admin.database();

    const investments = (await db.ref('investments').once('value')).val();
    if (!investments) {
      console.log("No investments found.");
      return admin.app().delete();
    }

    const eodApiKey = process.env.EOD_API_KEY;
    const symbols = [...new Set(Object.values(investments).map(inv => inv.symbol))];
    
    const priceCache = {};
    for (const symbol of symbols) {
        priceCache[symbol] = await fetchLivePrice(symbol, eodApiKey);
        await sleep(500); // Delay to respect API limits
    }
    await db.ref('priceCache').set(priceCache);
    console.log("Updated price cache:", priceCache);

    await db.ref('benchmarkCache').set({ ourReturn: 0, benchmarkReturn: 0 }); // Placeholder for now

    return admin.app().delete();

  } catch (e) {
    console.error("FATAL ERROR:", e);
    if (admin.apps.length) admin.app().delete();
    process.exit(1);
  }
}

main();
