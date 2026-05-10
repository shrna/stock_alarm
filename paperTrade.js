/**
 * Standalone paper trading entry point.
 * Runs at market open (8 AM ET) and close (4 PM ET).
 * Reads latest discovery data from docs/data/discovery.json.
 */
const fs = require("fs");
const path = require("path");
const { runPaperTrader } = require("./paperTrader");

const docsDir = path.join(__dirname, "docs");
const discoveryPath = path.join(docsDir, "data", "discovery.json");

async function main() {
  const session = process.env.PAPER_SESSION || "open";
  console.log(`[PaperTrade] Starting ${session.toUpperCase()} session at ${new Date().toISOString()}`);

  // Load discovery data from last nightly run
  let discovery = { stocks: [], etfs: [] };
  if (fs.existsSync(discoveryPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(discoveryPath, "utf8"));
      discovery = {
        stocks: (data.stocks || []).map((s) => ({ symbol: s.symbol || s.ticker })),
        etfs: (data.etfs || []).map((e) => ({ symbol: e.symbol || e.ticker })),
      };
      console.log(`[PaperTrade] Loaded discovery: ${discovery.stocks.length} stocks, ${discovery.etfs.length} ETFs`);
    } catch (e) {
      console.error("[PaperTrade] Failed to parse discovery.json:", e.message);
    }
  } else {
    console.warn("[PaperTrade] No discovery.json found — using existing positions only");
  }

  await runPaperTrader(discovery, docsDir, { session });
  console.log("[PaperTrade] Done.");
}

main().catch((e) => {
  console.error("[PaperTrade] Fatal error:", e);
  process.exit(1);
});
