const https = require("https");
const { getCompanyName } = require("./companyMap");

// Positive and negative word lists for sentiment scoring
const POSITIVE_WORDS = [
  "surge", "soar", "jump", "gain", "rise", "rally", "bull", "boost",
  "record", "high", "profit", "growth", "beat", "exceed", "upgrade",
  "strong", "positive", "optimistic", "opportunity", "breakout",
  "outperform", "buy", "upside", "recover", "boom", "accelerate",
  "milestone", "innovation", "dividend", "earnings beat", "up",
];

const NEGATIVE_WORDS = [
  "crash", "plunge", "drop", "fall", "decline", "bear", "loss",
  "miss", "cut", "downgrade", "weak", "negative", "risk", "warning",
  "sell", "bankruptcy", "layoff", "lawsuit", "investigation", "fraud",
  "debt", "recession", "underperform", "overvalued", "down", "slump",
  "tank", "dump", "fear", "concern", "trouble", "worst",
];

function analyzeSentiment(text) {
  const lower = text.toLowerCase();
  let score = 0;
  let posCount = 0;
  let negCount = 0;

  for (const word of POSITIVE_WORDS) {
    if (lower.includes(word)) {
      score += 1;
      posCount++;
    }
  }
  for (const word of NEGATIVE_WORDS) {
    if (lower.includes(word)) {
      score -= 1;
      negCount++;
    }
  }

  let label;
  if (score >= 2) label = "Very Positive 🟢";
  else if (score === 1) label = "Positive 🟢";
  else if (score === 0) label = "Neutral ⚪";
  else if (score === -1) label = "Negative 🔴";
  else label = "Very Negative 🔴";

  return { score, label, posCount, negCount };
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "StockAlarm/1.0" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve(body));
    });
    req.on("error", reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

async function getNewsAndSentiment(ticker) {
  const companyName = getCompanyName(ticker);
  const query = encodeURIComponent(`${ticker} ${companyName} stock`);
  const url = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;

  try {
    const xml = await fetchUrl(url);

    // Simple XML parsing for RSS items
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null && items.length < 5) {
      const titleMatch = match[1].match(/<title>([\s\S]*?)<\/title>/);
      const linkMatch = match[1].match(/<link>([\s\S]*?)<\/link>/);
      const pubDateMatch = match[1].match(/<pubDate>([\s\S]*?)<\/pubDate>/);
      const sourceMatch = match[1].match(/<source[^>]*>([\s\S]*?)<\/source>/);
      if (titleMatch) {
        items.push({
          title: titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim(),
          link: linkMatch ? linkMatch[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "",
          date: pubDateMatch ? pubDateMatch[1].trim() : "",
          source: sourceMatch ? sourceMatch[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "",
        });
      }
    }

    // Combine headlines for sentiment
    const allText = items.map((i) => i.title).join(" ");
    const sentiment = analyzeSentiment(allText);

    return { news: items, sentiment };
  } catch (err) {
    console.error(`[News] Error fetching news for ${ticker}: ${err.message}`);
    return {
      news: [],
      sentiment: { score: 0, label: "Unknown ⚪", posCount: 0, negCount: 0 },
    };
  }
}

module.exports = { getNewsAndSentiment, analyzeSentiment };
