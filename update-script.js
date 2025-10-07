const admin = require('firebase-admin');
const fetch = require('node-fetch');

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
      console.log("No investments found. Exiting cleanly.");
      process.exit(0); // Exit successfully
    }

    const eodApiKey = process.env.EOD_API_KEY;
    const symbols = [...new Set(Object.values(investments).map(inv => inv.symbol))];
    
    const priceCache = {};
    for (const symbol of symbols) {
      try {
        const ticker = `${symbol}.KSE`;
        const url = `https://eodhistoricaldata.com/api/real-time/${ticker}?api_token=${eodApiKey}&fmt=json`;
        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            if (data.close && data.close > 0) {
              priceCache[symbol] = data.close;
              console.log(`Fetched ${symbol}: ${data.close}`);
            }
        }
      } catch(e) { console.error(`Error fetching ${symbol}`, e); }
      await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay
    }

    await db.ref('priceCache').set(priceCache);
    console.log("Successfully updated price cache.");

    // We will skip the benchmark for now to ensure this works
    await db.ref('benchmarkCache').set({ ourReturn: 0, benchmarkReturn: 0 });

    process.exit(0); // Exit successfully at the end

  } catch (e) {
    console.error("FATAL ERROR:", e);
    process.exit(1); // Exit with an error code
  }
}

main();
