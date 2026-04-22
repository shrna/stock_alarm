// Ticker to company name mapping for better news search
const COMPANY_MAP = {
  PYPL: "PayPal Holdings",
  SNDK: "SanDisk",
  BP: "BP plc",
  REPX: "Riley Exploration Permian",
  MU: "Micron Technology",
  AAPL: "Apple",
  MSFT: "Microsoft",
  GOOGL: "Alphabet Google",
  AMZN: "Amazon",
  TSLA: "Tesla",
  META: "Meta Platforms",
  NVDA: "NVIDIA",
  AMD: "Advanced Micro Devices",
  INTC: "Intel",
  NFLX: "Netflix",
  DIS: "Walt Disney",
  BA: "Boeing",
  JPM: "JPMorgan Chase",
  V: "Visa",
  WMT: "Walmart",
  COST: "Costco",
  HD: "Home Depot",
  CRM: "Salesforce",
  ORCL: "Oracle",
  CSCO: "Cisco Systems",
};

function getCompanyName(ticker) {
  return COMPANY_MAP[ticker.toUpperCase()] || ticker;
}

module.exports = { COMPANY_MAP, getCompanyName };
