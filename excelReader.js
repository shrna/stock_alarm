const fs = require("fs");
const officeCrypto = require("officecrypto-tool");
const XLSX = require("xlsx");

async function readStocksExcel(filePath, password) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Excel file not found: ${filePath}`);
  }

  const input = fs.readFileSync(filePath);
  let data;

  if (password) {
    const decrypted = await officeCrypto.decrypt(input, { password });
    data = XLSX.read(decrypted);
  } else {
    data = XLSX.read(input);
  }

  const sheet = data.Sheets[data.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  // Normalize column names
  return rows.map((row) => {
    const ticker =
      row["Ticker"] || row["ticker"] || row["Symbol"] || row["symbol"];
    const avgPrice =
      row["Avg Price at Buying"] ||
      row["avg_price"] ||
      row["Average Price"] ||
      row["Cost Basis"];
    const quantity =
      row["Quantity"] || row["quantity"] || row["Qty"] || row["Shares"];

    if (!ticker) return null;

    return {
      ticker: String(ticker).toUpperCase().trim(),
      avgPrice: parseFloat(avgPrice) || 0,
      quantity: parseInt(quantity) || 0,
    };
  }).filter(Boolean);
}

module.exports = { readStocksExcel };
