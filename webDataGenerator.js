const fs = require("fs");
const path = require("path");

function generateWebData(results, discovery, outputDir) {
  const now = new Date();

  // Portfolio data
  let totalInvested = 0, totalCurrentValue = 0;
  for (const r of results) {
    if (r.stockData) {
      totalInvested += r.stock.avgPrice * r.stock.quantity;
      totalCurrentValue += r.stockData.currentPrice * r.stock.quantity;
    }
  }

  const portfolio = {
    date: now.toISOString(),
    dateStr: now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
    totalInvested,
    totalCurrentValue,
    totalPnL: totalCurrentValue - totalInvested,
    totalPnLPct: totalInvested > 0 ? ((totalCurrentValue - totalInvested) / totalInvested) * 100 : 0,
    stocks: results.map((r) => {
      if (!r.stockData) return { ticker: r.stock.ticker, error: true };
      const pnl = (r.stockData.currentPrice - r.stock.avgPrice) * r.stock.quantity;
      const pnlPct = r.stock.avgPrice > 0 ? ((r.stockData.currentPrice - r.stock.avgPrice) / r.stock.avgPrice) * 100 : 0;
      return {
        ticker: r.stock.ticker,
        name: r.stockData.shortName,
        price: r.stockData.currentPrice,
        dayChangePct: r.stockData.dayChangePercent,
        avgCost: r.stock.avgPrice,
        quantity: r.stock.quantity,
        value: r.stockData.currentPrice * r.stock.quantity,
        pnl,
        pnlPct,
        fiftyTwoWeekHigh: r.stockData.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: r.stockData.fiftyTwoWeekLow,
        fiftyTwoWeekChangePct: r.stockData.fiftyTwoWeekChangePercent,
        fiftyDayAvg: r.stockData.fiftyDayAvg,
        twoHundredDayAvg: r.stockData.twoHundredDayAvg,
        marketCap: r.stockData.marketCap,
        pe: r.stockData.pe,
        forwardPE: r.stockData.forwardPE,
        volume: r.stockData.volume,
        signal: r.signal.signal,
        signalScore: r.signal.score,
        reasons: r.signal.reasons,
        zacks: r.zacks?.available ? { rank: r.zacks.rank, label: r.zacks.label } : null,
        sentiment: r.newsData.sentiment.label.replace(/[\uD83D\uDD34\uD83D\uDFE2\u26AA\uFE0F]/gu, "").trim(),
        earningsDate: r.stockData.earningsDate || null,
        news: r.newsData.news.slice(0, 3).map((n) => ({
          title: n.title.replace(/&amp;/g, "&"),
          source: n.source,
          link: n.link || "",
        })),
        analysts: {
          strongBuy: r.stockData.strongBuy,
          buy: r.stockData.buy,
          hold: r.stockData.hold,
          sell: r.stockData.sell,
          strongSell: r.stockData.strongSell,
          total: r.stockData.numberOfAnalysts,
          targetLow: r.stockData.targetLowPrice,
          targetMean: r.stockData.targetMeanPrice,
          targetHigh: r.stockData.targetHighPrice,
        },
      };
    }),
  };

  // Discovery data
  const discoveryData = {
    date: now.toISOString(),
    stocks: (discovery?.stocks || []).map((p) => ({
      symbol: p.symbol, name: p.name, price: p.price,
      dayChangePct: p.dayChangePct, marketCap: p.marketCap,
      sector: p.sector, industry: p.industry,
      pe: p.pe, forwardPE: p.forwardPE, eps: p.eps, forwardEps: p.forwardEps,
      pegRatio: p.pegRatio, beta: p.beta, priceToBook: p.priceToBook,
      dividendYield: p.dividendYield,
      revenueGrowth: p.revenueGrowth, earningsGrowth: p.earningsGrowth,
      profitMargins: p.profitMargins, grossMargins: p.grossMargins,
      operatingMargins: p.operatingMargins,
      debtToEquity: p.debtToEquity, returnOnEquity: p.returnOnEquity,
      freeCashflow: p.freeCashflow, totalRevenue: p.totalRevenue, ebitda: p.ebitda,
      zacks: p.zacks ? { rank: p.zacks.rank, label: p.zacks.label } : null,
      targetMean: p.targetMeanPrice, targetHigh: p.targetHighPrice, targetLow: p.targetLowPrice,
      strongBuy: p.strongBuy, buy: p.buy, hold: p.hold, sell: p.sell, strongSell: p.strongSell,
      earningsDate: p.earningsDate, analysis: p.analysis, source: p.source,
    })),
    etfs: (discovery?.etfs || []).map((p) => ({
      symbol: p.symbol, name: p.name, price: p.price,
      dayChangePct: p.dayChangePct, fiftyTwoWeekChangePct: p.fiftyTwoWeekChangePercent,
      category: p.category, fundFamily: p.fundFamily, legalType: p.legalType,
      expenseRatio: p.expenseRatio, yield: p.yield, totalAssets: p.totalAssets, beta: p.beta,
      holdings: p.holdings || [], topHoldings: p.topHoldings,
      sectorWeightings: p.sectorWeightings || [],
      returns: p.returns || {},
      risk: p.risk || {},
      zacks: p.zacks ? { rank: p.zacks.rank, label: p.zacks.label } : null,
      analysis: p.analysis,
    })),
  };

  // Write JSON files
  const dataDir = path.join(outputDir, "data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, "portfolio.json"), JSON.stringify(portfolio, null, 2));
  fs.writeFileSync(path.join(dataDir, "discovery.json"), JSON.stringify(discoveryData, null, 2));

  // Append to history
  const historyPath = path.join(dataDir, "history.json");
  let history = [];
  if (fs.existsSync(historyPath)) {
    try { history = JSON.parse(fs.readFileSync(historyPath, "utf8")); } catch { history = []; }
  }
  history.push({
    date: now.toISOString().split("T")[0],
    totalInvested,
    totalCurrentValue,
    totalPnL: totalCurrentValue - totalInvested,
    stocks: portfolio.stocks.filter((s) => !s.error).map((s) => ({
      ticker: s.ticker, price: s.price, pnlPct: s.pnlPct,
    })),
  });
  // Keep last 90 days
  if (history.length > 90) history = history.slice(-90);
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));

  console.log("[Web] Data files written to docs/data/");
}

module.exports = { generateWebData };
