require("dotenv").config();
const path = require("path");
const fs = require("fs");
const { readStocksExcel } = require("./excelReader");
const { getStockData } = require("./stockData");
const { getNewsAndSentiment } = require("./newsAndSentiment");
const { generateSignal } = require("./signalGenerator");
const { buildFullReport, buildSmsReport } = require("./reportBuilder");
const { createTransporter, sendSms, sendEmailReport } = require("./notifier");

// Check OneDrive first, then fall back to local copy
const ONEDRIVE_PATH = path.join(
  process.env.USERPROFILE || process.env.HOME || "",
  "OneDrive",
  "StockAlarm",
  "STOCKS.xlsx"
);
const LOCAL_PATH = path.join(__dirname, "STOCKS.xlsx");
const EXCEL_PATH = fs.existsSync(ONEDRIVE_PATH) ? ONEDRIVE_PATH : LOCAL_PATH;

async function analyzeStock(stock) {
  console.log(`[Analyze] Processing ${stock.ticker}...`);

  const [stockData, newsData] = await Promise.all([
    getStockData(stock.ticker),
    getNewsAndSentiment(stock.ticker),
  ]);

  const signal = stockData
    ? generateSignal(stock, stockData, newsData.sentiment)
    : { signal: "NO DATA", emoji: "❌", score: 0, reasons: ["Could not fetch data"] };

  return { stock, stockData, newsData, signal };
}

async function run() {
  const startTime = Date.now();
  console.log("═══════════════════════════════════");
  console.log("  Stock Alarm — Starting analysis");
  console.log(`  ${new Date().toLocaleString()}`);
  console.log("═══════════════════════════════════\n");

  // 1. Read Excel
  console.log("[Excel] Reading stocks from", EXCEL_PATH);
  const stocks = await readStocksExcel(EXCEL_PATH, process.env.EXCEL_PASSWORD);
  console.log(`[Excel] Found ${stocks.length} stocks: ${stocks.map((s) => s.ticker).join(", ")}\n`);

  if (stocks.length === 0) {
    console.error("[Error] No stocks found in Excel file!");
    process.exit(1);
  }

  // 2. Analyze each stock (sequentially to avoid rate limits)
  const results = [];
  for (const stock of stocks) {
    try {
      const result = await analyzeStock(stock);
      results.push(result);
    } catch (err) {
      console.error(`[Error] Failed to analyze ${stock.ticker}: ${err.message}`);
      results.push({
        stock,
        stockData: null,
        newsData: { news: [], sentiment: { score: 0, label: "Unknown", posCount: 0, negCount: 0 } },
        signal: { signal: "ERROR", emoji: "❌", score: 0, reasons: [err.message] },
      });
    }
    // Small delay between requests
    await new Promise((r) => setTimeout(r, 1000));
  }

  // 3. Build reports
  const fullReport = buildFullReport(results);
  const smsReport = buildSmsReport(results);

  console.log("\n" + fullReport);

  // Save report to file
  const reportsDir = path.join(__dirname, "reports");
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir);
  const dateStr = new Date().toISOString().split("T")[0];
  fs.writeFileSync(path.join(reportsDir, `report_${dateStr}.txt`), fullReport);
  console.log(`[File] Report saved to reports/report_${dateStr}.txt`);

  // 4. Send notifications
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;

  if (gmailUser && gmailPass && gmailUser !== "your_email@gmail.com") {
    try {
      const transporter = createTransporter(gmailUser, gmailPass);

      // Send SMS (short version)
      if (process.env.PHONE_NUMBER && process.env.SMS_GATEWAY) {
        await sendSms(
          transporter,
          gmailUser,
          process.env.PHONE_NUMBER,
          process.env.SMS_GATEWAY,
          smsReport
        );
      }

      // Send full email report
      if (process.env.REPORT_EMAIL) {
        await sendEmailReport(transporter, gmailUser, process.env.REPORT_EMAIL, fullReport);
      }
    } catch (err) {
      console.error(`[Notify] Error sending notifications: ${err.message}`);
    }
  } else {
    console.log("\n[Notify] Gmail not configured — skipping SMS/email. Update .env to enable.");
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ Done in ${elapsed}s`);
}

run().catch((err) => {
  console.error("[Fatal]", err);
  process.exit(1);
});
