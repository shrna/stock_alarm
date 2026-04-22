function generateSignal(stock, stockData, sentiment) {
  // Weighted scoring system for buy/sell/hold
  let score = 0;
  const reasons = [];

  // 1. Analyst consensus (weight: 30%)
  const totalRatings =
    stockData.strongBuy + stockData.buy + stockData.hold + stockData.sell + stockData.strongSell;
  if (totalRatings > 0) {
    const bullish = stockData.strongBuy + stockData.buy;
    const bearish = stockData.sell + stockData.strongSell;
    const analystScore = ((bullish - bearish) / totalRatings) * 30;
    score += analystScore;
    if (bullish > bearish) reasons.push(`Analysts: ${bullish} buy vs ${bearish} sell`);
    else if (bearish > bullish) reasons.push(`Analysts: ${bearish} sell vs ${bullish} buy`);
  }

  // 2. Price target vs current (weight: 25%)
  if (stockData.targetMeanPrice > 0 && stockData.currentPrice > 0) {
    const upside =
      ((stockData.targetMeanPrice - stockData.currentPrice) / stockData.currentPrice) * 100;
    if (upside > 15) {
      score += 25;
      reasons.push(`Target upside: +${upside.toFixed(1)}%`);
    } else if (upside > 5) {
      score += 12;
      reasons.push(`Target upside: +${upside.toFixed(1)}%`);
    } else if (upside < -10) {
      score -= 20;
      reasons.push(`Target downside: ${upside.toFixed(1)}%`);
    }
  }

  // 3. Moving average trend (weight: 20%)
  if (stockData.fiftyDayAvg > 0 && stockData.twoHundredDayAvg > 0) {
    if (stockData.currentPrice > stockData.fiftyDayAvg && stockData.fiftyDayAvg > stockData.twoHundredDayAvg) {
      score += 20;
      reasons.push("Above 50 & 200 day avg (bullish trend)");
    } else if (stockData.currentPrice < stockData.fiftyDayAvg && stockData.fiftyDayAvg < stockData.twoHundredDayAvg) {
      score -= 20;
      reasons.push("Below 50 & 200 day avg (bearish trend)");
    } else if (stockData.currentPrice > stockData.fiftyDayAvg) {
      score += 10;
      reasons.push("Above 50-day avg");
    }
  }

  // 4. News sentiment (weight: 15%)
  score += sentiment.score * 5;
  if (sentiment.score !== 0) {
    reasons.push(`Sentiment: ${sentiment.label}`);
  }

  // 5. P&L position (weight: 10%)
  if (stock.avgPrice > 0) {
    const pnlPct = ((stockData.currentPrice - stock.avgPrice) / stock.avgPrice) * 100;
    if (pnlPct < -20) {
      reasons.push(`Deep loss: ${pnlPct.toFixed(1)}% — consider averaging down or cutting`);
    } else if (pnlPct > 30) {
      reasons.push(`Good gains: +${pnlPct.toFixed(1)}% — consider taking profits`);
      score -= 5; // slight sell pressure on big gains
    }
  }

  // Final signal
  let signal, emoji;
  if (score >= 25) { signal = "STRONG BUY"; emoji = "🟢🟢"; }
  else if (score >= 10) { signal = "BUY"; emoji = "🟢"; }
  else if (score >= -10) { signal = "HOLD"; emoji = "🟡"; }
  else if (score >= -25) { signal = "SELL"; emoji = "🔴"; }
  else { signal = "STRONG SELL"; emoji = "🔴🔴"; }

  return { signal, emoji, score, reasons };
}

module.exports = { generateSignal };
