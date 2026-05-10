function formatCurrency(num) {
  if (num === 0 || num == null) return "N/A";
  return "$" + num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPercent(num) {
  if (num == null) return "N/A";
  const sign = num >= 0 ? "+" : "";
  return sign + num.toFixed(2) + "%";
}

function formatMarketCap(num) {
  if (!num) return "N/A";
  if (num >= 1e12) return "$" + (num / 1e12).toFixed(2) + "T";
  if (num >= 1e9) return "$" + (num / 1e9).toFixed(2) + "B";
  if (num >= 1e6) return "$" + (num / 1e6).toFixed(2) + "M";
  return "$" + num.toLocaleString();
}

function buildFullReport(results, discovery) {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  let totalInvested = 0;
  let totalCurrentValue = 0;

  // Calculate portfolio totals
  for (const r of results) {
    if (r.stockData) {
      totalInvested += r.stock.avgPrice * r.stock.quantity;
      totalCurrentValue += r.stockData.currentPrice * r.stock.quantity;
    }
  }

  const totalPnL = totalCurrentValue - totalInvested;
  const totalPnLPct = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;

  let report = "";
  report += "═══════════════════════════════════\n";
  report += "    📊 DAILY STOCK REPORT\n";
  report += `    ${dateStr}\n`;
  report += "═══════════════════════════════════\n\n";

  // Portfolio summary
  report += "💼 PORTFOLIO SUMMARY\n";
  report += "───────────────────────────────────\n";
  report += `Invested:    ${formatCurrency(totalInvested)}\n`;
  report += `Current:     ${formatCurrency(totalCurrentValue)}\n`;
  report += `P&L:         ${formatCurrency(totalPnL)} (${formatPercent(totalPnLPct)})\n\n`;

  // Individual stocks
  for (const r of results) {
    const { stock, stockData, newsData, signal, zacks } = r;

    if (!stockData) {
      report += `\n❌ ${stock.ticker} — Data unavailable\n`;
      continue;
    }

    const pnl = (stockData.currentPrice - stock.avgPrice) * stock.quantity;
    const pnlPct = stock.avgPrice > 0 ? ((stockData.currentPrice - stock.avgPrice) / stock.avgPrice) * 100 : 0;
    const value = stockData.currentPrice * stock.quantity;

    report += `\n${signal.emoji} ${stock.ticker} — ${stockData.shortName}\n`;
    report += "───────────────────────────────────\n";
    report += `Signal:      ${signal.signal} (score: ${signal.score})\n`;
    report += `Price:       ${formatCurrency(stockData.currentPrice)} (${formatPercent(stockData.dayChangePercent)} today)\n`;
    report += `Your Cost:   ${formatCurrency(stock.avgPrice)} × ${stock.quantity} shares\n`;
    report += `Value:       ${formatCurrency(value)} | P&L: ${formatCurrency(pnl)} (${formatPercent(pnlPct)})\n`;
    report += `52wk Range:  ${formatCurrency(stockData.fiftyTwoWeekLow)} - ${formatCurrency(stockData.fiftyTwoWeekHigh)}\n`;
    report += `50d / 200d:  ${formatCurrency(stockData.fiftyDayAvg)} / ${formatCurrency(stockData.twoHundredDayAvg)}\n`;
    report += `Market Cap:  ${formatMarketCap(stockData.marketCap)} | P/E: ${stockData.pe ? stockData.pe.toFixed(1) : "N/A"}\n`;

    // Analyst ratings
    if (stockData.numberOfAnalysts > 0) {
      report += `Analysts:    ${stockData.numberOfAnalysts} ratings — `;
      report += `${stockData.strongBuy}⬆️ ${stockData.buy}🟢 ${stockData.hold}🟡 ${stockData.sell}🔴 ${stockData.strongSell}⬇️\n`;
      report += `Target:      ${formatCurrency(stockData.targetLowPrice)} - ${formatCurrency(stockData.targetHighPrice)} (mean: ${formatCurrency(stockData.targetMeanPrice)})\n`;
    }

    // Zacks Rating
    if (zacks && zacks.available) {
      report += `Zacks:       #${zacks.rank} ${zacks.label}`;
      if (zacks.vgmScore) {
        report += ` | VGM: ${zacks.vgmScore} (V:${zacks.valueScore || "?"} G:${zacks.growthScore || "?"} M:${zacks.momentumScore || "?"})`;
      }
      report += "\n";
    }

    // Signal reasons
    if (signal.reasons.length > 0) {
      report += "Reasons:\n";
      for (const reason of signal.reasons) {
        report += `  • ${reason}\n`;
      }
    }

    // Sentiment
    report += `Sentiment:   ${newsData.sentiment.label}\n`;

    // Top news
    if (newsData.news.length > 0) {
      report += "Headlines:\n";
      for (const n of newsData.news.slice(0, 3)) {
        report += `  📰 ${n.title}\n`;
        if (n.source) report += `     — ${n.source}\n`;
      }
    }
  }

  // === DISCOVERY SECTION ===
  if (discovery && (discovery.stocks?.length > 0 || discovery.etfs?.length > 0)) {
    report += "\n\n═══════════════════════════════════\n";
    report += "    🔍 STOCKS TO WATCH\n";
    report += "═══════════════════════════════════\n";

    if (discovery.stocks?.length > 0) {
      report += "\n📈 TOP STOCK PICKS (Strong Buy)\n";
      report += "───────────────────────────────────\n";
      for (const pick of discovery.stocks) {
        report += `\n🟢 ${pick.symbol} — ${pick.name} @ ${formatCurrency(pick.price)}\n`;
        if (pick.zacks) report += `   Zacks: #${pick.zacks.rank} ${pick.zacks.label}\n`;
        report += `   ${pick.analysis}\n`;
      }
    }

    if (discovery.etfs?.length > 0) {
      report += "\n📊 TOP ETF PICKS\n";
      report += "───────────────────────────────────\n";
      for (const pick of discovery.etfs) {
        report += `\n🔵 ${pick.symbol} — ${pick.name} @ ${formatCurrency(pick.price)}\n`;
        report += `   ${pick.analysis}\n`;
      }
    }
  }

  report += "\n═══════════════════════════════════\n";
  report += "⚠️  Not financial advice. Do your own research.\n";
  report += `Report generated at ${now.toLocaleTimeString("en-US")}\n`;

  return report;
}

function buildSmsReport(results, discovery) {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  let totalPnL = 0;
  let totalInvested = 0;
  for (const r of results) {
    if (r.stockData) {
      totalInvested += r.stock.avgPrice * r.stock.quantity;
      totalPnL += (r.stockData.currentPrice - r.stock.avgPrice) * r.stock.quantity;
    }
  }
  const totalPnLPct = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;

  let sms = `📊 Stock Report ${dateStr}\n`;
  sms += `Portfolio P&L: ${formatCurrency(totalPnL)} (${formatPercent(totalPnLPct)})\n\n`;

  for (const r of results) {
    if (!r.stockData) {
      sms += `${r.stock.ticker}: ❌ No data\n`;
      continue;
    }
    const pnlPct = r.stock.avgPrice > 0
      ? ((r.stockData.currentPrice - r.stock.avgPrice) / r.stock.avgPrice) * 100
      : 0;
    sms += `${r.signal.emoji} ${r.stock.ticker}: ${formatCurrency(r.stockData.currentPrice)} (${formatPercent(r.stockData.dayChangePercent)}) → ${r.signal.signal}\n`;
    sms += `  P&L: ${formatPercent(pnlPct)} | Sent: ${r.newsData.sentiment.label.split(" ")[0]}\n`;
  }

  sms += `\n⚠️ Not financial advice`;
  return sms;
}

module.exports = { buildFullReport, buildSmsReport };
