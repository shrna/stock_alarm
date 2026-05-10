const https = require("https");
const YahooFinance = require("yahoo-finance2").default;
const { getZacksRating } = require("./zacksRating");

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });

function fetchRaw(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchRaw(res.headers.location).then(resolve).catch(reject);
      }
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve(body));
    });
    req.on("error", reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

function fetchJson(url) {
  return fetchRaw(url).then((b) => JSON.parse(b));
}

// Scrape stock tickers mentioned in YouTube finance video titles
async function getYouTubeTickers() {
  const tickers = new Set();
  const queries = ["stocks+to+buy+now+2026", "best+ETF+to+buy+2026", "strong+buy+stocks+this+week"];
  const stopWords = new Set([
    "THE", "AND", "FOR", "TOP", "BUY", "NOW", "BEST", "THIS", "THAT", "STOCK", "STOCKS",
    "ETF", "ETFS", "HOW", "WHY", "ARE", "NOT", "WITH", "HAS", "ALL", "WHAT", "WILL",
    "CAN", "GET", "MAY", "NEW", "YOU", "MY", "UP", "DO", "SO", "AI", "VS", "OR", "AT",
    "IN", "TO", "OF", "IS", "IT", "ON", "BE", "IF", "NO", "GO", "BIG", "CEO", "CFO",
    "IPO", "GDP", "SEC", "FED", "USD", "EUR", "GBP", "RSI", "PE", "EPS", "ROE",
  ]);

  for (const q of queries) {
    try {
      // Use Google News RSS to find finance YouTube and article tickers
      const rss = await fetchRaw(`https://news.google.com/rss/search?q=${q}+stock+market&hl=en-US&gl=US&ceid=US:en`);
      const titles = [];
      const itemRe = /<title>([\s\S]*?)<\/title>/g;
      let m;
      while ((m = itemRe.exec(rss)) !== null) {
        titles.push(m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim());
      }
      // Extract potential tickers (2-5 uppercase letters)
      const allText = titles.join(" ");
      const matches = allText.match(/\b[A-Z]{2,5}\b/g) || [];
      for (const t of matches) {
        if (!stopWords.has(t) && t.length >= 2) tickers.add(t);
      }
    } catch {
      // continue
    }
  }
  return [...tickers];
}

// Stage 1: Build candidate universe from multiple sources
async function getCandidates(ownedTickers) {
  const owned = new Set(ownedTickers.map((t) => t.toUpperCase()));
  const seen = new Set();
  const stockCandidates = [];
  const etfCandidates = [];

  // Source 1: Yahoo screeners
  const screeners = [
    "day_gainers", "most_actives", "undervalued_large_caps",
    "growth_technology_stocks", "undervalued_growth_stocks",
    "aggressive_small_caps", "small_cap_gainers",
  ];

  for (const scrId of screeners) {
    try {
      const url = `https://query2.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=false&scrIds=${scrId}&count=20`;
      const data = await fetchJson(url);
      const quotes = data.finance?.result?.[0]?.quotes || [];
      for (const q of quotes) {
        if (!q.symbol || seen.has(q.symbol) || owned.has(q.symbol)) continue;
        if (q.quoteType !== "EQUITY") continue;
        if ((q.averageDailyVolume3Month || 0) < 500000) continue;
        if ((q.regularMarketPrice || 0) < 2) continue;
        seen.add(q.symbol);
        stockCandidates.push({
          symbol: q.symbol, name: q.shortName || q.symbol, quoteType: "EQUITY",
          price: q.regularMarketPrice || 0, dayChangePct: q.regularMarketChangePercent || 0,
          marketCap: q.marketCap || 0, volume: q.averageDailyVolume3Month || 0,
          pe: q.trailingPE || 0, source: scrId,
        });
      }
    } catch (err) {
      console.log(`[Discovery] Screener ${scrId}: ${err.message}`);
    }
  }

  // Source 2: YouTube/News ticker mentions
  try {
    const ytTickers = await getYouTubeTickers();
    console.log(`[Discovery] News/YT tickers found: ${ytTickers.slice(0, 15).join(", ")}`);
    for (const t of ytTickers.slice(0, 20)) {
      if (seen.has(t) || owned.has(t)) continue;
      try {
        const q = await yahooFinance.quote(t);
        if (!q || !q.regularMarketPrice) continue;
        if (q.quoteType !== "EQUITY" && q.quoteType !== "ETF") continue;
        if ((q.averageDailyVolume3Month || 0) < 300000) continue;
        seen.add(t);
        const target = q.quoteType === "ETF" ? etfCandidates : stockCandidates;
        target.push({
          symbol: t, name: q.shortName || t, quoteType: q.quoteType,
          price: q.regularMarketPrice || 0, dayChangePct: q.regularMarketChangePercent || 0,
          marketCap: q.marketCap || 0, volume: q.averageDailyVolume3Month || 0,
          pe: q.trailingPE || 0, fiftyTwoWeekChangePercent: q.fiftyTwoWeekChangePercent || 0,
          source: "news",
        });
      } catch { /* skip invalid */ }
    }
  } catch (err) {
    console.log(`[Discovery] YouTube/News scan: ${err.message}`);
  }

  // Source 3: ETF universe
  const etfUniverse = [
    "SPY", "QQQ", "IWM", "VTI", "VOO", "ARKK", "ARKG", "XLF", "XLE", "XLK",
    "XLV", "XBI", "SMH", "SOXX", "TAN", "ICLN", "KWEB", "EEM", "VWO", "GLD",
    "SLV", "TLT", "HYG", "LQD", "SCHD", "VIG", "JEPI", "JEPQ", "VGT", "IBIT",
    "DIA", "IVV", "TQQQ", "SOXL", "XLP", "XLI", "XLU", "XLRE", "VNQ", "BND",
  ];
  for (let i = 0; i < etfUniverse.length; i += 10) {
    const batch = etfUniverse.slice(i, i + 10);
    const quotes = await Promise.all(batch.map((t) => yahooFinance.quote(t).catch(() => null)));
    for (const q of quotes) {
      if (!q || seen.has(q.symbol)) continue;
      seen.add(q.symbol);
      etfCandidates.push({
        symbol: q.symbol, name: q.shortName || q.symbol, quoteType: "ETF",
        price: q.regularMarketPrice || 0, dayChangePct: q.regularMarketChangePercent || 0,
        marketCap: q.marketCap || 0, volume: q.averageDailyVolume3Month || 0,
        fiftyTwoWeekChangePercent: q.fiftyTwoWeekChangePercent || 0, source: "universe",
      });
    }
  }

  return { stockCandidates, etfCandidates };
}

// Stage 2: Score stocks via Zacks — get top 10
async function scoreStockCandidates(candidates) {
  const scored = [];
  const toCheck = candidates.slice(0, 30);

  for (const c of toCheck) {
    try {
      const zacks = await getZacksRating(c.symbol);
      if (zacks.available && zacks.rank <= 2) {
        scored.push({ ...c, zacks });
      }
    } catch { /* skip */ }
    await new Promise((r) => setTimeout(r, 200));
  }

  scored.sort((a, b) => {
    if (a.zacks.rank !== b.zacks.rank) return a.zacks.rank - b.zacks.rank;
    return b.marketCap - a.marketCap;
  });

  return scored.slice(0, 10);
}

// Stage 2b: Score ETFs — get top 10
function scoreEtfCandidates(etfs) {
  const scored = etfs.map((e) => {
    let score = 0;
    if (e.fiftyTwoWeekChangePercent > 30) score += 4;
    else if (e.fiftyTwoWeekChangePercent > 15) score += 3;
    else if (e.fiftyTwoWeekChangePercent > 5) score += 2;
    else if (e.fiftyTwoWeekChangePercent > 0) score += 1;
    if (e.dayChangePct > 2) score += 3;
    else if (e.dayChangePct > 0.5) score += 2;
    else if (e.dayChangePct > 0) score += 1;
    if (e.volume > 20000000) score += 3;
    else if (e.volume > 5000000) score += 2;
    else if (e.volume > 1000000) score += 1;
    return { ...e, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 10);
}

// Stage 3: Full enrichment with deep financial data
async function enrichPick(pick) {
  try {
    const modules = pick.quoteType === "ETF"
      ? ["price", "summaryDetail", "topHoldings", "fundProfile"]
      : ["assetProfile", "calendarEvents", "financialData", "recommendationTrend", "price", "summaryDetail", "defaultKeyStatistics"];

    const summary = await yahooFinance.quoteSummary(pick.symbol, { modules });

    if (pick.quoteType === "ETF") {
      const fund = summary.fundProfile || {};
      const top = summary.topHoldings || {};
      const det = summary.summaryDetail || {};
      pick.category = fund.categoryName || "N/A";
      pick.expenseRatio = det.totalExpenseRatio || fund.feesExpensesInvestment?.annualReportExpenseRatio || null;
      pick.yield = det.yield || null;
      pick.topHoldings = (top.holdings || []).slice(0, 5).map((h) => h.holdingName || h.symbol);
      pick.totalAssets = det.totalAssets || 0;
      pick.beta = det.beta || null;
    } else {
      const profile = summary.assetProfile || {};
      const cal = summary.calendarEvents || {};
      const fin = summary.financialData || {};
      const rec = summary.recommendationTrend?.trend?.[0] || {};
      const ks = summary.defaultKeyStatistics || {};
      const det = summary.summaryDetail || {};

      pick.industry = profile.industry || "N/A";
      pick.sector = profile.sector || "N/A";
      pick.description = profile.longBusinessSummary || "";
      pick.earningsDate = cal.earnings?.earningsDate?.[0] || null;
      pick.targetMeanPrice = fin.targetMeanPrice || 0;
      pick.targetHighPrice = fin.targetHighPrice || 0;
      pick.targetLowPrice = fin.targetLowPrice || 0;
      pick.revenueGrowth = fin.revenueGrowth || 0;
      pick.earningsGrowth = fin.earningsGrowth || 0;
      pick.profitMargins = fin.profitMargins || 0;
      pick.grossMargins = fin.grossMargins || 0;
      pick.operatingMargins = fin.operatingMargins || 0;
      pick.debtToEquity = fin.debtToEquity || 0;
      pick.returnOnEquity = fin.returnOnEquity || 0;
      pick.returnOnAssets = fin.returnOnAssets || 0;
      pick.freeCashflow = fin.freeCashflow || 0;
      pick.totalRevenue = fin.totalRevenue || 0;
      pick.ebitda = fin.ebitda || 0;
      pick.recommendationKey = fin.recommendationKey || "N/A";
      pick.strongBuy = rec.strongBuy || 0;
      pick.buy = rec.buy || 0;
      pick.hold = rec.hold || 0;
      pick.sell = rec.sell || 0;
      pick.strongSell = rec.strongSell || 0;
      // Key statistics
      pick.eps = ks.trailingEps || 0;
      pick.forwardEps = ks.forwardEps || 0;
      pick.pegRatio = ks.pegRatio || 0;
      pick.beta = ks.beta || 0;
      pick.bookValue = ks.bookValue || 0;
      pick.priceToBook = ks.priceToBook || 0;
      pick.forwardPE = ks.forwardPE || det.forwardPE || 0;
      pick.dividendYield = det.dividendYield || 0;
    }
  } catch (err) {
    console.log(`[Discovery] Enrich failed for ${pick.symbol}: ${err.message}`);
  }
  return pick;
}

// Build ~100 word analysis
function buildStockAnalysis(pick) {
  const desc = pick.description || "";
  const firstSentence = desc.split(/\.\s/)[0]?.substring(0, 130) || pick.name;
  const upside = pick.targetMeanPrice > 0
    ? (((pick.targetMeanPrice - pick.price) / pick.price) * 100).toFixed(1) : null;
  const bullish = (pick.strongBuy || 0) + (pick.buy || 0);
  const bearish = (pick.sell || 0) + (pick.strongSell || 0);

  let a = `${firstSentence}. `;
  a += `Sector: ${pick.sector}. `;
  if (pick.zacks) a += `Zacks #${pick.zacks.rank} (${pick.zacks.label}). `;
  if (bullish > 0) a += `Analysts: ${bullish} Buy vs ${bearish} Sell. `;
  if (upside) a += `Target: $${pick.targetMeanPrice.toFixed(0)} (${upside > 0 ? "+" : ""}${upside}%). `;
  if (pick.revenueGrowth) a += `Revenue: ${(pick.revenueGrowth * 100).toFixed(0)}% YoY. `;
  if (pick.eps) a += `EPS: $${pick.eps.toFixed(2)}. `;
  if (pick.pe) a += `P/E: ${pick.pe.toFixed(1)}. `;
  if (pick.earningsDate) {
    a += `Earnings: ${new Date(pick.earningsDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}. `;
  }
  return a.trim();
}

function buildEtfAnalysis(pick) {
  let a = `${pick.name}`;
  if (pick.category && pick.category !== "N/A") a += ` (${pick.category})`;
  a += ". ";
  if (pick.fiftyTwoWeekChangePercent) a += `52wk: ${pick.fiftyTwoWeekChangePercent > 0 ? "+" : ""}${pick.fiftyTwoWeekChangePercent.toFixed(1)}%. `;
  if (pick.yield) a += `Yield: ${(pick.yield * 100).toFixed(2)}%. `;
  if (pick.expenseRatio) a += `ER: ${(pick.expenseRatio * 100).toFixed(2)}%. `;
  if (pick.totalAssets) {
    const v = pick.totalAssets >= 1e9 ? `$${(pick.totalAssets / 1e9).toFixed(1)}B` : `$${(pick.totalAssets / 1e6).toFixed(0)}M`;
    a += `AUM: ${v}. `;
  }
  if (pick.topHoldings?.length > 0) a += `Top: ${pick.topHoldings.slice(0, 3).join(", ")}. `;
  a += `$${pick.price.toFixed(2)} (${pick.dayChangePct >= 0 ? "+" : ""}${pick.dayChangePct.toFixed(1)}% today).`;
  return a.trim();
}

// Main entry
async function discoverStocks(ownedTickers) {
  console.log("\n[Discovery] Searching for stock & ETF picks...");

  const { stockCandidates, etfCandidates } = await getCandidates(ownedTickers);
  console.log(`[Discovery] ${stockCandidates.length} stock candidates, ${etfCandidates.length} ETF candidates`);

  const topStocks = await scoreStockCandidates(stockCandidates);
  console.log(`[Discovery] ${topStocks.length} stocks passed Zacks filter`);

  const topEtfs = scoreEtfCandidates(etfCandidates);
  console.log(`[Discovery] Top ${topEtfs.length} ETFs selected`);

  console.log("[Discovery] Enriching stock picks...");
  for (let i = 0; i < topStocks.length; i++) {
    topStocks[i] = await enrichPick(topStocks[i]);
    topStocks[i].analysis = buildStockAnalysis(topStocks[i]);
    await new Promise((r) => setTimeout(r, 400));
  }

  console.log("[Discovery] Enriching ETF picks...");
  for (let i = 0; i < topEtfs.length; i++) {
    topEtfs[i] = await enrichPick(topEtfs[i]);
    topEtfs[i].analysis = buildEtfAnalysis(topEtfs[i]);
    await new Promise((r) => setTimeout(r, 400));
  }

  console.log(`[Discovery] Done: ${topStocks.length} stocks, ${topEtfs.length} ETFs`);
  return { stocks: topStocks, etfs: topEtfs };
}

module.exports = { discoverStocks };
