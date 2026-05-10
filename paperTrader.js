const fs = require("fs");
const path = require("path");
const YahooFinance = require("yahoo-finance2").default;

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });

const STARTING_CAPITAL = 10000;
const MAX_STOCK_POSITIONS = 5;
const MAX_ETF_POSITIONS = 3;
const STOCK_ALLOC = 0.60; // 60% to stocks
const ETF_ALLOC = 0.40;   // 40% to ETFs
// Hysteresis: enter if in top N, exit if dropped below exit threshold
const STOCK_EXIT_RANK = 8;
const ETF_EXIT_RANK = 5;
const REBALANCE_DRIFT = 0.08; // rebalance if >8% drift from target

function getMarketDate() {
  const now = new Date();
  const day = now.getDay();
  // If weekend, use last Friday
  if (day === 0) now.setDate(now.getDate() - 2);
  if (day === 6) now.setDate(now.getDate() - 1);
  return now.toISOString().split("T")[0];
}

function isWeekend() {
  const day = new Date().getDay();
  return day === 0 || day === 6;
}

function loadState(filePath) {
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch { /* corrupt file, start fresh */ }
  }
  return {
    startingCapital: STARTING_CAPITAL,
    startDate: new Date().toISOString().split("T")[0],
    cash: STARTING_CAPITAL,
    positions: [],
    trades: [],
    history: [],
  };
}

function saveState(filePath, state) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
}

async function getPrice(symbol) {
  try {
    const q = await yahooFinance.quote(symbol);
    return q?.regularMarketPrice || null;
  } catch {
    return null;
  }
}

async function executeTrades(state, discovery, marketDate) {
  const topStocks = (discovery.stocks || []).slice(0, 10);
  const topEtfs = (discovery.etfs || []).slice(0, 10);

  const entryStocks = topStocks.slice(0, MAX_STOCK_POSITIONS).map((s) => s.symbol);
  const entryEtfs = topEtfs.slice(0, MAX_ETF_POSITIONS).map((e) => e.symbol);
  const keepStocks = new Set(topStocks.slice(0, STOCK_EXIT_RANK).map((s) => s.symbol));
  const keepEtfs = new Set(topEtfs.slice(0, ETF_EXIT_RANK).map((e) => e.symbol));

  const todayTrades = [];

  // Step 1: Mark all positions to market
  for (const pos of state.positions) {
    const price = await getPrice(pos.symbol);
    if (price) pos.currentPrice = price;
  }

  // Step 2: SELL positions that dropped out of keep range
  const toSell = state.positions.filter((p) => {
    const keepSet = p.type === "etf" ? keepEtfs : keepStocks;
    return !keepSet.has(p.symbol);
  });

  for (const pos of toSell) {
    const price = pos.currentPrice || pos.avgCost;
    const total = pos.shares * price;
    const realizedPnL = (price - pos.avgCost) * pos.shares;
    state.cash += total;
    todayTrades.push({
      date: marketDate, symbol: pos.symbol, action: "SELL",
      shares: +pos.shares.toFixed(4), price, total: +total.toFixed(2),
      realizedPnL: +realizedPnL.toFixed(2),
      reason: `Dropped out of top ${pos.type === "etf" ? ETF_EXIT_RANK : STOCK_EXIT_RANK} picks`,
    });
    console.log(`[Paper] SELL ${pos.shares.toFixed(2)} ${pos.symbol} @ $${price.toFixed(2)} | P&L: $${realizedPnL.toFixed(2)}`);
  }
  state.positions = state.positions.filter((p) => {
    const keepSet = p.type === "etf" ? keepEtfs : keepStocks;
    return keepSet.has(p.symbol);
  });

  // Step 3: Calculate total portfolio value and target allocations
  const positionsValue = state.positions.reduce((s, p) => s + p.shares * (p.currentPrice || p.avgCost), 0);
  const totalValue = state.cash + positionsValue;
  const stockTarget = totalValue * STOCK_ALLOC;
  const etfTarget = totalValue * ETF_ALLOC;

  // Step 4: BUY new positions
  const currentStockSymbols = new Set(state.positions.filter((p) => p.type === "stock").map((p) => p.symbol));
  const currentEtfSymbols = new Set(state.positions.filter((p) => p.type === "etf").map((p) => p.symbol));

  const newStocks = entryStocks.filter((s) => !currentStockSymbols.has(s));
  const newEtfs = entryEtfs.filter((e) => !currentEtfSymbols.has(e));

  const stockSlots = MAX_STOCK_POSITIONS - currentStockSymbols.size;
  const etfSlots = MAX_ETF_POSITIONS - currentEtfSymbols.size;

  // Per-position target allocation
  const stockPerPos = stockTarget / MAX_STOCK_POSITIONS;
  const etfPerPos = etfTarget / MAX_ETF_POSITIONS;

  for (const sym of newStocks.slice(0, stockSlots)) {
    const price = await getPrice(sym);
    if (!price || price <= 0) continue;
    const targetAmount = Math.min(stockPerPos, state.cash * 0.95);
    if (targetAmount < 10) continue;
    const shares = targetAmount / price; // fractional shares
    const total = shares * price;
    state.cash -= total;
    state.positions.push({
      symbol: sym, shares, avgCost: price, currentPrice: price,
      type: "stock", boughtAt: marketDate,
    });
    todayTrades.push({
      date: marketDate, symbol: sym, action: "BUY",
      shares: +shares.toFixed(4), price, total: +total.toFixed(2),
      reason: `Top ${MAX_STOCK_POSITIONS} stock pick`,
    });
    console.log(`[Paper] BUY ${shares.toFixed(2)} ${sym} @ $${price.toFixed(2)} ($${total.toFixed(2)})`);
  }

  for (const sym of newEtfs.slice(0, etfSlots)) {
    const price = await getPrice(sym);
    if (!price || price <= 0) continue;
    const targetAmount = Math.min(etfPerPos, state.cash * 0.95);
    if (targetAmount < 10) continue;
    const shares = targetAmount / price;
    const total = shares * price;
    state.cash -= total;
    state.positions.push({
      symbol: sym, shares, avgCost: price, currentPrice: price,
      type: "etf", boughtAt: marketDate,
    });
    todayTrades.push({
      date: marketDate, symbol: sym, action: "BUY",
      shares: +shares.toFixed(4), price, total: +total.toFixed(2),
      reason: `Top ${MAX_ETF_POSITIONS} ETF pick`,
    });
    console.log(`[Paper] BUY ${shares.toFixed(2)} ${sym} @ $${price.toFixed(2)} ($${total.toFixed(2)})`);
  }

  // Step 5: Rebalance existing positions if drifted
  const updatedTotal = state.cash + state.positions.reduce((s, p) => s + p.shares * (p.currentPrice || p.avgCost), 0);
  for (const pos of state.positions) {
    const posValue = pos.shares * (pos.currentPrice || pos.avgCost);
    const targetValue = pos.type === "stock" ? (updatedTotal * STOCK_ALLOC / MAX_STOCK_POSITIONS) : (updatedTotal * ETF_ALLOC / MAX_ETF_POSITIONS);
    const drift = Math.abs(posValue - targetValue) / targetValue;

    if (drift > REBALANCE_DRIFT && pos.currentPrice > 0) {
      if (posValue > targetValue) {
        // Trim
        const excessShares = (posValue - targetValue) / pos.currentPrice;
        const trimValue = excessShares * pos.currentPrice;
        const realizedPnL = (pos.currentPrice - pos.avgCost) * excessShares;
        pos.shares -= excessShares;
        state.cash += trimValue;
        todayTrades.push({
          date: marketDate, symbol: pos.symbol, action: "SELL",
          shares: +excessShares.toFixed(4), price: pos.currentPrice,
          total: +trimValue.toFixed(2), realizedPnL: +realizedPnL.toFixed(2),
          reason: `Rebalance: ${(drift * 100).toFixed(1)}% drift`,
        });
      } else {
        // Add
        const deficit = targetValue - posValue;
        const addAmount = Math.min(deficit, state.cash * 0.95);
        if (addAmount > 10) {
          const addShares = addAmount / pos.currentPrice;
          const newTotal = pos.shares * pos.avgCost + addAmount;
          pos.shares += addShares;
          pos.avgCost = newTotal / pos.shares;
          state.cash -= addAmount;
          todayTrades.push({
            date: marketDate, symbol: pos.symbol, action: "BUY",
            shares: +addShares.toFixed(4), price: pos.currentPrice,
            total: +addAmount.toFixed(2), reason: `Rebalance: ${(drift * 100).toFixed(1)}% drift`,
          });
        }
      }
    }
  }

  // Append today's trades (deduplicate by date)
  state.trades = state.trades.filter((t) => t.date !== marketDate);
  state.trades.push(...todayTrades);
  // Keep last 90 days of trades
  if (state.trades.length > 200) state.trades = state.trades.slice(-200);

  // Step 6: Record daily snapshot (idempotent by date)
  const finalPosValue = state.positions.reduce((s, p) => s + p.shares * (p.currentPrice || p.avgCost), 0);
  const finalTotal = state.cash + finalPosValue;
  state.history = state.history.filter((h) => h.date !== marketDate);
  state.history.push({
    date: marketDate,
    totalValue: +finalTotal.toFixed(2),
    cash: +state.cash.toFixed(2),
    positionsValue: +finalPosValue.toFixed(2),
    positionCount: state.positions.length,
    tradesExecuted: todayTrades.length,
  });
  if (state.history.length > 365) state.history = state.history.slice(-365);

  return todayTrades;
}

async function runPaperTrader(discovery, docsDir) {
  console.log("\n[Paper] Running paper trading simulator...");

  if (isWeekend()) {
    console.log("[Paper] Market closed (weekend) — skipping trades");
    return;
  }

  const marketDate = getMarketDate();
  const statePath = path.join(docsDir, "data", "paper-portfolio.json");
  const state = loadState(statePath);

  console.log(`[Paper] Portfolio: $${(state.cash + state.positions.reduce((s, p) => s + p.shares * (p.currentPrice || p.avgCost), 0)).toFixed(2)} (${state.positions.length} positions, $${state.cash.toFixed(2)} cash)`);

  const trades = await executeTrades(state, discovery, marketDate);

  const totalValue = state.cash + state.positions.reduce((s, p) => s + p.shares * (p.currentPrice || p.avgCost), 0);
  const totalReturn = ((totalValue - state.startingCapital) / state.startingCapital) * 100;

  console.log(`[Paper] End of day: $${totalValue.toFixed(2)} (${totalReturn >= 0 ? "+" : ""}${totalReturn.toFixed(2)}%) | ${trades.length} trades | ${state.positions.length} positions`);

  saveState(statePath, state);
  console.log("[Paper] State saved to docs/data/paper-portfolio.json");
}

module.exports = { runPaperTrader };
