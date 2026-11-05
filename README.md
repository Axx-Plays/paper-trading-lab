# Paper Trading Lab

Mobile-first dark dashboard and a **paper-only** trading experiment, maintained through GitHub Actions. No real orders, withdrawals or brokerage order endpoints are implemented.

## Your experiment

The user requested a fresh €1,000 run on 2026-11-05, with no startup before **22:00 Europe/Berlin** (`2026-11-05T21:00:00Z`). The previous pilot's complete ledger is retained in `archives/2026-11-05-engineering-pilot/portfolio.json`. This is an explicit new experiment, not erased performance. The start gate still requires an open US stock session and valid narrow-spread quotes for all ten selections; because 22:00 coincides with the regular US close, first purchases are expected during the next eligible session. The 14-day period begins at actual startup.

- Start: **€1,000 virtual cash**. Eight US stocks: four relatively lower-volatility and four relatively higher-volatility stocks. Two cryptocurrencies from up to 40 liquid Kraken USD pairs.
- Initial target allocation: 55% lower-volatility stocks, 25% higher-volatility stocks, 10% crypto, 10% cash. No leverage or shorts. Fractional quantities are simulated.
- Cloud checks at minutes 07, 22, 37 and 52 each hour. GitHub may delay or skip schedules. This is not continuous exchange-side stop execution.
- The 14-day clock starts only after all configured stocks have valid fresh IEX quotes during US market hours and at least two crypto candidates and a recent EUR/USD rate are available.
- After 14 days, no further paper trades occur. Open positions are frozen at their last observed valuation; the final snapshot does not pretend they were liquidated. The workflow disables itself after publishing the closing snapshot.
- The public website and repository expose **simulated**, not real, portfolio information. Never store keys in files.

## Website

Dashboard address: https://axx-paper-trading-lab.wiggly-maple-3307.chatgpt.site/

On a phone, use the browser's **Add to Home Screen** option. This is a responsive web application, not a native app or guaranteed offline app. It loads saved snapshots every minute while open; the underlying cloud job checks approximately every 15 minutes.

The hosted app reads its public data snapshots from this repository's raw GitHub endpoint. Scheduled jobs commit new observations but do not redeploy the website. Sites hosts the static shell independently of the paper workflow. The local HTTP preview reads local JSON; hosted HTTPS versions read GitHub snapshots. Request failures are visible and retain the last loaded snapshot with its original timestamp.

GitHub Pages was replaced after its deployment service kept reporting an already-cancelled deployment as in progress, including after a Pages reset. Pages is set to workflow mode without an active deployment job, preventing repeated failed automatic publications. The paper workflow remains enabled. Sites project: `appgprj_6aece79ee4788191b06713fe499fa23a`. Its source mirror contains the small export from `node scripts/build.mjs` as `dist/`, plus the Sites hosting manifest. Future interface changes require publishing a new Sites version; data updates do not. Reuse this project rather than creating another Site.

## Setup

1. In GitHub Settings → Secrets and variables → Actions, create `ALPACA_API_KEY` and `ALPACA_SECRET_KEY` from an **Alpaca Paper Trading** account. Keys stay in the Actions runtime. We read prices and the paper market clock; no Alpaca order is placed. The separate $100,000 Alpaca balance is not this application's €1,000 ledger.
2. The existing Sites dashboard is independent of the bot. To host another copy, export `docs/` with `node scripts/build.mjs` and serve the resulting static files over HTTPS; retain the public GitHub data URLs in `app.js`.
3. Run **Paper Trading Lab** under Actions. Verify the log and the dashboard's data timestamp. The first valid US-session run starts the experiment automatically.
4. To pause: Actions → Paper Trading Lab → Disable workflow. To resume the same unexpired test, re-enable it. The 14-day end time does not move.
5. To start an entirely new experiment, export the old ledger first, reset `docs/data/portfolio.json` to the waiting state, and explicitly enable/run the workflow. Do not reset during the test merely because performance is poor.

## Selection and stops

`config.json` contains the explicit 30-stock universe. “Best” always means **highest rank in this limited universe**, not a prediction about the entire market. Stocks are split in half by daily volatility over 20 returns. The top four momentum scores in each half are selected. Crypto candidates are the top 40 eligible Kraken USD pairs by 24-hour dollar volume, minimum $1m, excluding identified fiat, stablecoins and gold pegs; only assets with at least 180 daily bars are eligible. This is a limited heuristic filter, not a full token risk audit.

Score: `(0.4 × 20-day return + 0.6 × 60-day return) / max(20-day daily volatility, 0.005)`. Ranking updates once per UTC day on a valid stock-market observation. Existing positions are held if still selected; exited names are replaced. Position sizes are capped at the target allocation at purchase, but winners can drift above it. The cash reserve is a purchase-time constraint, not a guaranteed constant allocation.

New entries require a bid/ask spread no greater than 0.5% for stocks or 1% for crypto. Wider spreads still affect held-position valuation and exits. The initial setup run on 2026-11-05 preceded this additional guard and bought some wide-spread IEX quotes; its trades and losses are deliberately retained in the journal. Treat this first test as an engineering pilot, not a clean strategy comparison.

Initial stop distance is `2 × ATR14 / latest close`, clamped to 4–8% for the lower-volatility stock group, 7–12% for the higher-volatility group, and 8–15% for crypto. Stops follow the highest **observed bid** and never decrease. Intermediate price peaks/dips between jobs are not observed. A sell executes at the next observed bid minus costs, not magically at the stop. No same-day repurchase after a stop. Crypto portfolio rotation currently also waits for the daily stock-session rebalance; crypto stops are checked 24/7 while the experiment is active.

An 8% peak-to-trough portfolio drawdown prevents new buys and attempts to exit available positions. Stale or unavailable assets remain marked at their last value and their exits are retried. Drawdown limits do not guarantee bounded realized loss. US quotes must be under 15 minutes old; FX reference may be up to four days old for weekends/holidays. Closed stock markets pause new portfolio purchases, not crypto stop checks.

## Accounting assumptions

Positions are denominated in USD and reported in EUR using the ECB reference rate. Buys use ask plus 0.05% slippage for stocks / 0.10% for crypto; sells use bid minus the same slippage. Additional fees per side are 0.05% stocks / 0.10% crypto. These are explicit test assumptions, not broker fee quotes. Portfolio marks estimate liquidation value after these costs. The simulator does not model taxes, dividends, full market depth, or all corporate actions. Splits in existing positions are not automatically adjusted; inspect affected positions before interpreting a test spanning a corporate action.

## Research, not automatic learning claims

The app includes a small, dependency-free logistic-regression study. It trains on the first roughly 70% of each series, purges two boundary observations, and evaluates on the later 30%. Features use only information available at the signal's close; returns begin at the next open. Scaling is fit on training only. Fixed 55% entry threshold, long/cash only, 0.20% costs per side, benchmark with entry/exit costs. Each study is frozen on first creation. No parameter search is performed on the test data. Repeated use of the same test period can still overfit human choices.

The running paper strategy is **not** driven by this experimental model and does not improve automatically after each trade. The database stores observations, decisions, positions and trades for later analysis. Two weeks mainly test execution and data handling; they do not establish profitability or cover all market regimes.

External CSV import stays entirely in the browser and requires at least 180 rows, at most 10,000 rows / 5 MB:

```csv
date,open,high,low,close,volume
2025-01-02,100,103,99,102,100000
```

Only import data you may use. Historical results are separately labelled and never added to paper cash.

## Free sources evaluated

| Source | What it provides | Integration |
|---|---|---|
| [Kraken public API](https://docs.kraken.com/api-reference/market-data/get-ohlc-data) | Public crypto OHLC and bid/ask; up to 720 candles | Used; unfinished daily candle excluded |
| [Alpaca](https://docs.alpaca.markets/us/docs/about-market-data-api) | Free IEX stocks with account; partial-market coverage | Used with GitHub Secrets; latest quotes may be unavailable or stale |
| [ECB reference rates](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html) | Reference exchange rates | Used to convert USD to EUR; not an execution-rate promise |
| [Microsoft Qlib](https://github.com/microsoft/qlib) | MIT-licensed research framework and data tooling | Evaluated and linked; not installed, no pretrained weights copied |
| [FinRL](https://github.com/AI4Finance-Foundation/FinRL) | MIT-licensed reinforcement-learning code and examples | Evaluated and linked; not installed, no pretrained weights copied |
| [Binance Vision](https://github.com/binance/binance-public-data/blob/master/TERMS_AND_CONDITIONS.md) | Historical archive with separate dataset terms | Not imported; current terms restrict live trading use |
| [TradingView widgets](https://www.tradingview.com/widget-docs/widgets/charts/advanced-chart/) | External charts | User loads separately; original attribution retained |

Software licenses do not automatically license third-party market data. Provider terms govern their data. This is a personal, non-commercial paper research experiment. Review data display/redistribution permissions before repurposing the public site, selling it or using it for real trading. Do not add real account balances or access keys to the public snapshots.

## Local development

Node.js 22+ (24 used in CI), no npm packages required:

```sh
npm test
npm start
```

Open http://127.0.0.1:4173. `npm run update` fetches public crypto and FX data. It does not start the paper experiment locally unless `START_PAPER_RUN=true` and all required stock data are available. Run with environment variables for Alpaca; never commit them. `node scripts/build.mjs` optionally prepares a smaller `.local/site` export. `docs/data/history-cache.json` persists daily series publicly in the repository and Pages source; the app only fetches small quote snapshots and research summaries.

## Reliability and limits

GitHub Actions is a scheduled batch service with no punctuality SLA. Public repositories have free standard runners under current GitHub terms; quotas/policies can change. The workflow has a ten-minute timeout, one concurrent writer, durable commits, visible data errors, and an automatic disable on completion. Failures retain previous marks; there is no synthetic-price fallback. An unavailable source can delay the start or a trade.

GitHub Secrets are never rendered in HTML, written to JSON, printed, or sent to any host except the designated Alpaca market-data and paper-clock endpoints. The credential helper used during setup is ignored and is not part of this repository.
