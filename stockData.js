const YahooFinance = require("yahoo-finance2").default;
const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

async function getStockData(ticker) {
  try {
    const [quote, summary] = await Promise.all([
      yahooFinance.quote(ticker).catch(() => null),
      yahooFinance
        .quoteSummary(ticker, {
          modules: [
            "price",
            "summaryDetail",
            "recommendationTrend",
            "financialData",
          ],
        })
        .catch(() => null),
    ]);

    if (!quote) return null;

    const rec = summary?.recommendationTrend?.trend?.[0] || {};
    const fin = summary?.financialData || {};

    return {
      ticker,
      currentPrice: quote.regularMarketPrice || 0,
      previousClose: quote.regularMarketPreviousClose || 0,
      dayChange: quote.regularMarketChange || 0,
      dayChangePercent: quote.regularMarketChangePercent || 0,
      fiftyDayAvg: quote.fiftyDayAverage || 0,
      twoHundredDayAvg: quote.twoHundredDayAverage || 0,
      fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh || 0,
      fiftyTwoWeekLow: quote.fiftyTwoWeekLow || 0,
      marketCap: quote.marketCap || 0,
      volume: quote.regularMarketVolume || 0,
      avgVolume: quote.averageDailyVolume3Month || 0,
      pe: quote.trailingPE || 0,
      forwardPE: quote.forwardPE || 0,
      targetMeanPrice: fin.targetMeanPrice || 0,
      targetHighPrice: fin.targetHighPrice || 0,
      targetLowPrice: fin.targetLowPrice || 0,
      recommendationKey: fin.recommendationKey || "N/A",
      numberOfAnalysts: fin.numberOfAnalystOpinions || 0,
      strongBuy: rec.strongBuy || 0,
      buy: rec.buy || 0,
      hold: rec.hold || 0,
      sell: rec.sell || 0,
      strongSell: rec.strongSell || 0,
      shortName: quote.shortName || ticker,
    };
  } catch (err) {
    console.error(`[Yahoo] Error fetching ${ticker}: ${err.message}`);
    return null;
  }
}

module.exports = { getStockData };
