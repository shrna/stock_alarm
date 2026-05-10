const https = require("https");

const ZACKS_RANK_LABELS = {
  1: "Strong Buy",
  2: "Buy",
  3: "Hold",
  4: "Sell",
  5: "Strong Sell",
};

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error("Invalid JSON from Zacks"));
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

async function getZacksRating(ticker) {
  try {
    const url = `https://quote-feed.zacks.com/index?t=${ticker}`;
    const data = await fetchJson(url);
    const info = data[ticker];

    if (!info || !info.zacks_rank) {
      return { rank: null, label: "N/A", available: false };
    }

    const rank = parseInt(info.zacks_rank);
    const label = info.zacks_rank_text || ZACKS_RANK_LABELS[rank] || "Unknown";

    return {
      rank,
      label,
      vgmScore: null,
      valueScore: null,
      growthScore: null,
      momentumScore: null,
      available: rank >= 1 && rank <= 5,
    };
  } catch (err) {
    console.error(`[Zacks] Error fetching ${ticker}: ${err.message}`);
    return { rank: null, label: "N/A", available: false };
  }
}

module.exports = { getZacksRating, ZACKS_RANK_LABELS };
