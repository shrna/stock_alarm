const https = require("https");

function fetchRaw(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36" },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = res.headers.location.startsWith("http") ? res.headers.location : new URL(res.headers.location, url).href;
        return fetchRaw(next).then(resolve).catch(reject);
      }
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", reject);
    req.setTimeout(12000, () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

// --- Finviz: fundamentals, technicals, analyst recommendation ---
async function getFinvizRating(ticker) {
  const result = { source: "Finviz", available: false };
  try {
    const { status, body } = await fetchRaw(`https://finviz.com/quote.ashx?t=${ticker}`);
    if (status !== 200 || body.length < 1000) return result;

    const getValue = (label) => {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(escaped + "[\\s\\S]{0,300}?<b[^>]*>([\\s\\S]*?)<\\/b>");
      const match = body.match(re);
      return match ? match[1].replace(/<[^>]+>/g, "").trim() : null;
    };

    const recom = getValue("Recom");
    const target = getValue("Target Price");

    result.available = true;
    result.recommendation = recom ? parseFloat(recom) : null; // 1.0 = Strong Buy, 5.0 = Strong Sell
    result.recommendationLabel = recom ? recomLabel(parseFloat(recom)) : null;
    result.targetPrice = target ? parseFloat(target) : null;
    result.pe = parseFloat(getValue("P\\/E")) || null;
    result.forwardPE = parseFloat(getValue("Forward P\\/E")) || null;
    result.sma20 = getValue("SMA20");
    result.sma50 = getValue("SMA50");
    result.sma200 = getValue("SMA200");
    result.rsi = parseFloat(getValue("RSI \\(14\\)")) || null;
    result.shortFloat = getValue("Short Float");
    result.perfWeek = getValue("Perf Week");
    result.perfMonth = getValue("Perf Month");
    result.perfQuarter = getValue("Perf Quarter");
    result.perfYear = getValue("Perf Year");
    result.insiderOwn = getValue("Insider Own");
    result.instOwn = getValue("Inst Own");
  } catch (e) {
    console.log(`[Finviz] ${ticker}: ${e.message}`);
  }
  return result;
}

function recomLabel(score) {
  if (score <= 1.5) return "Strong Buy";
  if (score <= 2.5) return "Buy";
  if (score <= 3.5) return "Hold";
  if (score <= 4.5) return "Sell";
  return "Strong Sell";
}

// --- StockAnalysis.com: analyst consensus + price target ---
async function getStockAnalysisRating(ticker) {
  const result = { source: "StockAnalysis", available: false };
  try {
    const { status, body } = await fetchRaw(`https://stockanalysis.com/stocks/${ticker.toLowerCase()}/ratings/`);
    if (status !== 200 || body.length < 1000) return result;

    const consensus = body.match(/text-2xl">(Strong Buy|Buy|Hold|Sell|Strong Sell)/);
    const target = body.match(/price target[^$]*\$([\d,.]+)/i);
    const analystCount = body.match(/(\d+)\s+(?:analyst|Wall Street)/i);

    if (consensus) {
      result.available = true;
      result.consensus = consensus[1];
      result.targetPrice = target ? parseFloat(target[1].replace(/,/g, "")) : null;
      result.analystCount = analystCount ? parseInt(analystCount[1]) : null;
    }
  } catch (e) {
    console.log(`[StockAnalysis] ${ticker}: ${e.message}`);
  }
  return result;
}

// --- MarketBeat: consensus price target ---
async function getMarketBeatRating(ticker) {
  const result = { source: "MarketBeat", available: false };
  try {
    // Determine exchange (try NASDAQ first, then NYSE)
    let { status, body } = await fetchRaw(`https://www.marketbeat.com/stocks/NASDAQ/${ticker}/price-target/`);
    if (status !== 200 || body.length < 5000) {
      ({ status, body } = await fetchRaw(`https://www.marketbeat.com/stocks/NYSE/${ticker}/price-target/`));
    }
    if (status !== 200 || body.length < 5000) return result;

    const avgTarget = body.match(/(?:average|consensus)[^$]{0,200}\$([\d,.]+)/i);
    const numRatings = body.match(/(\d+)\s+(?:Wall Street )?(?:analyst|research)/i);

    // Extract consensus label
    let consensusLabel = null;
    if (body.indexOf("Strong Buy") > 0) consensusLabel = "Strong Buy";
    else if (body.indexOf("Moderate Buy") > 0) consensusLabel = "Moderate Buy";
    else if (body.indexOf("Buy") > 0) consensusLabel = "Buy";
    else if (body.indexOf("Hold") > 0) consensusLabel = "Hold";
    else if (body.indexOf("Sell") > 0) consensusLabel = "Sell";

    result.available = true;
    result.consensus = consensusLabel;
    result.targetPrice = avgTarget ? parseFloat(avgTarget[1].replace(/,/g, "")) : null;
    result.analystCount = numRatings ? parseInt(numRatings[1]) : null;
  } catch (e) {
    console.log(`[MarketBeat] ${ticker}: ${e.message}`);
  }
  return result;
}

// --- Aggregate all ratings for a ticker ---
async function getAggregatedRatings(ticker) {
  const [finviz, stockAnalysis, marketBeat] = await Promise.all([
    getFinvizRating(ticker),
    getStockAnalysisRating(ticker),
    getMarketBeatRating(ticker),
  ]);

  const ratings = {};
  if (finviz.available) ratings.finviz = finviz;
  if (stockAnalysis.available) ratings.stockAnalysis = stockAnalysis;
  if (marketBeat.available) ratings.marketBeat = marketBeat;

  // Build overall consensus from all sources
  const labels = [];
  if (finviz.available && finviz.recommendationLabel) labels.push(finviz.recommendationLabel);
  if (stockAnalysis.available && stockAnalysis.consensus) labels.push(stockAnalysis.consensus);
  if (marketBeat.available && marketBeat.consensus) labels.push(marketBeat.consensus);

  // Aggregate target prices
  const targets = [finviz.targetPrice, stockAnalysis.targetPrice, marketBeat.targetPrice].filter(Boolean);
  const avgTarget = targets.length > 0 ? targets.reduce((a, b) => a + b, 0) / targets.length : null;

  return {
    ratings,
    sourceCount: Object.keys(ratings).length,
    consensusLabels: labels,
    avgTargetPrice: avgTarget,
  };
}

module.exports = { getAggregatedRatings, getFinvizRating, getStockAnalysisRating, getMarketBeatRating };
