function generateSignal(stock, stockData, sentiment, zacks) {
  // Weighted scoring system for buy/sell/hold
  let score = 0;
  const reasons = [];

  // 1. Analyst consensus (weight: 25%)
  const totalRatings =
    stockData.strongBuy + stockData.buy + stockData.hold + stockData.sell + stockData.strongSell;
  if (totalRatings > 0) {
    const bullish = stockData.strongBuy + stockData.buy;
    const bearish = stockData.sell + stockData.strongSell;
    const analystScore = ((bullish - bearish) / totalRatings) * 25;
    score += analystScore;
    if (bullish > bearish) reasons.push(`Analysts: ${bullish} buy vs ${bearish} sell`);
    else if (bearish > bullish) reasons.push(`Analysts: ${bearish} sell vs ${bullish} buy`);
  }

  // 2. Price target vs current (weight: 20%)
  if (stockData.targetMeanPrice > 0 && stockData.currentPrice > 0) {
    const upside =
      ((stockData.targetMeanPrice - stockData.currentPrice) / stockData.currentPrice) * 100;
    if (upside > 15) {
      score += 20;
      reasons.push(`Target upside: +${upside.toFixed(1)}%`);
    } else if (upside > 5) {
      score += 10;
      reasons.push(`Target upside: +${upside.toFixed(1)}%`);
    } else if (upside < -10) {
      score -= 15;
      reasons.push(`Target downside: ${upside.toFixed(1)}%`);
    }
  }

  // 3. Moving average trend (weight: 15%)
  if (stockData.fiftyDayAvg > 0 && stockData.twoHundredDayAvg > 0) {
    if (stockData.currentPrice > stockData.fiftyDayAvg && stockData.fiftyDayAvg > stockData.twoHundredDayAvg) {
      score += 15;
      reasons.push("Above 50 & 200 day avg (bullish trend)");
    } else if (stockData.currentPrice < stockData.fiftyDayAvg && stockData.fiftyDayAvg < stockData.twoHundredDayAvg) {
      score -= 15;
      reasons.push("Below 50 & 200 day avg (bearish trend)");
    } else if (stockData.currentPrice > stockData.fiftyDayAvg) {
      score += 8;
      reasons.push("Above 50-day avg");
    }
  }

  // 4. News sentiment (weight: 10%)
  score += sentiment.score * 3.5;
  if (sentiment.score !== 0) {
    reasons.push(`Sentiment: ${sentiment.label}`);
  }

  // 5. Zacks Rank (weight: 20%)
  if (zacks && zacks.available && zacks.rank) {
    const zacksScoreMap = { 1: 20, 2: 10, 3: 0, 4: -10, 5: -20 };
    score += zacksScoreMap[zacks.rank] || 0;
    reasons.push(`Zacks Rank: #${zacks.rank} ${zacks.label}`);
    if (zacks.vgmScore) {
      reasons.push(`Zacks VGM: ${zacks.vgmScore} (V:${zacks.valueScore || "?"} G:${zacks.growthScore || "?"} M:${zacks.momentumScore || "?"})`);
    }
  }

  // 6. P&L position (weight: 10%)
  if (stock.avgPrice > 0) {
    const pnlPct = ((stockData.currentPrice - stock.avgPrice) / stock.avgPrice) * 100;
    if (pnlPct < -20) {
      reasons.push(`Deep loss: ${pnlPct.toFixed(1)}% \u2014 consider averaging down or cutting`);
    } else if (pnlPct > 30) {
      reasons.push(`Good gains: +${pnlPct.toFixed(1)}% \u2014 consider taking profits`);
      score -= 5;
    }
  }

  // Final signal
  let signal, emoji;
  if (score >= 25) { signal = "STRONG BUY"; emoji = "\uD83D\uDFE2\uD83D\uDFE2"; }
  else if (score >= 10) { signal = "BUY"; emoji = "\uD83D\uDFE2"; }
  else if (score >= -10) { signal = "HOLD"; emoji = "\uD83D\uDFE1"; }
  else if (score >= -25) { signal = "SELL"; emoji = "\uD83D\uDD34"; }
  else { signal = "STRONG SELL"; emoji = "\uD83D\uDD34\uD83D\uDD34"; }

  return { signal, emoji, score, reasons };
}

module.exports = { generateSignal };
