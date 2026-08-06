# Day 22 — Marketing Mix Modeling & Budget Optimization Engine

Day 22 of a daily AI-app series (BI focus). Every marketing org eventually asks
the same question finance loves to ask back: "if channel X gets another
$10k/week, how much extra revenue does that actually buy — and is there a
channel where that same $10k would buy more?" Answering that well requires
two things most spreadsheets don't do: modeling *diminishing returns* per
channel (the tenth ad dollar rarely buys as much as the first), and modeling
*carryover* (a TV ad seen this week still nudges behavior two weeks later).
This app builds that model from weekly spend/revenue history, then uses it to
recommend how to reallocate a fixed budget across channels — not just report
what happened, but prescribe what to do next.

## Why this matters for BI work

Two failure modes are common in ad-hoc marketing ROI analysis: treating every
channel's response as linear (which always recommends dumping 100% of budget
into whichever channel currently looks best, ignoring that it would saturate
long before absorbing the whole budget), and ignoring adstock carryover
(which under-credits channels like TV or out-of-home whose effect lingers).
This engine fits **two competing response specifications** — a linear model
and a saturating (diminishing-returns) model, each on adstock-transformed
spend — backtests both on held-out weeks, and blends them by inverse-error
weight. That blended model then feeds a **greedy marginal-return budget
optimizer**: instead of a single "best channel" answer, it walks the fixed
budget dollar-by-dollar to wherever the model says the next dollar currently
buys the most incremental revenue, which naturally spreads budget across
channels as each one saturates.

This is a step up from Day 21's forecasting/reconciliation engine in one
specific way: Day 21 was **predictive and descriptive** (forecast the
numbers, reconcile them, flag drift). Day 22 is **prescriptive** — it doesn't
stop at a prediction, it optimizes a decision (how to split a budget) subject
to the model's own diminishing-returns curves, and lets you simulate
arbitrary "what if I moved $X from channel A to channel B" scenarios against
that same model.

## Complexity tier

Multi-technique modeling pipeline (adstock + saturation transforms, dual-model
backtest-blended ensemble) feeding a constrained budget optimizer and
scenario simulator, behind a REST API + dashboard, with SQLite persistence
and a from-scratch linear algebra layer (no numpy/sklearn equivalent — this
app is Node.js, a deliberate stack change from the recent run of Python days
in this series).

## Architecture

```
day22-marketing-mix-optimizer/
├── server.js                    # Express REST API + serves the dashboard
├── cli.js                       # command-line interface
├── src/
│   ├── matrix.js                 # from-scratch matrix multiply/transpose/inverse (Gauss-Jordan)
│   ├── adstock.js                 # geometric adstock (carryover) transform
│   ├── saturation.js              # exponential saturation (diminishing returns) curve + derivative
│   ├── ridge.js                   # ridge regression via normal equations, MAPE/RMSE scoring
│   ├── mmm.js                     # fits linear vs. saturated models, backtests, inverse-error blend
│   ├── optimizer.js               # greedy marginal-return budget allocator
│   ├── scenario.js                # scores named what-if allocations against the fitted model
│   ├── narrative.js               # rule-based NLG summary (no external LLM API, fully offline)
│   ├── data.js                    # CSV ingest + validation
│   ├── db.js                      # SQLite persistence (node:sqlite, zero native dependencies)
│   └── engine.js                  # orchestrates ingest -> fit -> optimize -> simulate -> persist
├── scripts/
│   └── generate_sample_data.js    # regenerates sample_data/marketing_spend.csv (fixed seed)
├── sample_data/
│   └── marketing_spend.csv        # 104 weeks x 5 channels, synthetic, fixed seed
├── public/
│   └── dashboard.html             # Chart.js dashboard: allocation comparison, scenario table
├── tests/
│   ├── test_matrix.js             # matrix inversion correctness
│   ├── test_adstock_saturation.js # transform properties (bounds, monotonicity, decay behavior)
│   ├── test_ridge.js              # ridge regression recovers known coefficients on synthetic data
│   ├── test_mmm.js                # blend weights sum to 1, backtest MAPE is reasonable
│   ├── test_optimizer.js          # budget constraint respected, beats even-split allocation
│   └── test_engine.js             # end-to-end pipeline + SQLite round trip
├── package.json
└── Dockerfile
```

## The techniques, briefly

**Adstock (`src/adstock.js`)** — `adstocked[t] = spend[t] + decay * adstocked[t-1]`.
Models carryover: a channel with `decay=0.6` still has ~60% of last week's
"effective spend" felt this week, decaying further each week after.

**Saturation (`src/saturation.js`)** — `sat(x, k) = 1 - exp(-x/k)`. Bounded in
`[0, 1)`, monotonically increasing, concave — each extra dollar buys less
incremental response than the last. `k` (the scale at which a channel is
already meaningfully saturated) is set per-channel from its historical mean
spend, so channels with very different budget sizes are on comparable
footing.

**Ridge regression (`src/ridge.js`)** — closed-form normal equations
`beta = (XᵀX + λI)⁻¹ Xᵀy`, solved with a from-scratch Gauss-Jordan matrix
inverse (`src/matrix.js`). Ridge rather than plain OLS because channel spend
series are often correlated (campaigns tend to run together), which makes
`XᵀX` poorly conditioned; the `λI` term keeps it invertible and shrinks
coefficients toward zero. The intercept column is not penalized.

**Dual-model ensemble (`src/mmm.js`)** — a **linear** spec (adstocked spend
enters the regression directly) and a **saturated** spec (adstocked spend is
passed through the saturation curve first) are each fit and backtested on the
same trailing 12-week holdout. They're blended by inverse-RMSE weighting with
a floor so neither model is ever fully zeroed out — the same "let backtest
error decide the mix" idea used for hierarchy reconciliation in the previous
day's forecasting engine, applied here to model selection instead.

**Budget optimizer (`src/optimizer.js`)** — a greedy / water-filling
allocator: start every channel at a small floor, then repeatedly hand the
next small increment of the total budget to whichever channel currently has
the highest marginal return (accounting for how saturated it already is).
Because each channel's response is concave, this greedy approach converges to
the (near-)optimal allocation without needing a general nonlinear solver.

**Scenario simulator (`src/scenario.js`)** — scores arbitrary named
allocations (current budget, optimizer's recommendation, or a custom
"move $20k from display to search" hypothesis) against the same fitted model
so you can compare concrete options side by side, not just see one global
optimum.

## Running it

```bash
cd day22-marketing-mix-optimizer
npm install

# (optional) regenerate sample data -- already checked in with a fixed seed
node scripts/generate_sample_data.js

# CLI
node cli.js fit                              # run the full pipeline once
node cli.js list-runs
node cli.js show-run 1
node cli.js optimize --budget=25000           # re-optimize latest run for a specific budget
node cli.js simulate --allocation='{"tv":10000,"search":8000,"social":4000,"display":2000,"email":1000}'

# Dashboard + API
node server.js                                # http://localhost:5000
```

### REST API

```
POST /api/run                       Run the full pipeline (fit + optimize + persist)
GET  /api/runs                      List all persisted runs
GET  /api/runs/latest               Latest run + its optimizations
GET  /api/runs/:id                  Full detail for a run
POST /api/runs/:id/optimize         { "totalBudget": 30000 } -> re-optimize
POST /api/runs/:id/simulate         { "scenarios": { "name": { "tv": 8000, ... } } }
GET  /api/health
```

## Tests

```bash
npm test
```

Covers: matrix inversion correctness, adstock/saturation transform properties
(bounds, monotonicity, decay=0 identity behavior), ridge regression recovering
known coefficients on a synthetic noiseless system, blend weights summing to 1
with neither model zeroed out, backtest MAPE staying reasonable on the
synthetic dataset, the optimizer respecting the budget constraint and
matching or beating an even-split baseline, and an end-to-end pipeline run
with a full SQLite persistence round trip.

## Docker

```bash
docker build -t marketing-mix-optimizer .
docker run -p 5000:5000 marketing-mix-optimizer
```

## Sample data

`scripts/generate_sample_data.js` simulates 104 weeks (2 years) of weekly
spend across 5 channels (TV, Search, Social, Display, Email), each with its
own known adstock decay, saturation scale, and true revenue coefficient, plus
a baseline trend, yearly seasonality, and noise — so the fitted model has a
genuine, checkable ground truth to recover. Checked in with a fixed random
seed for reproducibility.

## Notes / limitations

- Adstock decay per channel is fixed/assumed rather than fit from data (a
  fuller MMM would grid-search or gradient-fit decay jointly with the
  regression coefficients — this app fixes it at a documented constant per
  channel to keep the regression linear-in-parameters and closed-form).
- The saturation scale `k` is derived heuristically from historical mean
  spend rather than fit; a production system would treat it as a model
  hyperparameter tuned via cross-validated grid search.
- `node:sqlite` is still an experimental Node API (stable behavior, but
  Node itself flags it as such); chosen here specifically to avoid a native
  compiled dependency (e.g. `better-sqlite3`) so `npm install` stays fast and
  reliable across machines.
- The greedy marginal-return optimizer is a hill-climbing heuristic, not a
  certified global optimum from a general-purpose nonlinear solver — correct
  for this class of concave, separable objective, but would need a different
  approach if channel interactions (e.g. cross-channel synergy) were modeled.
- Predictions get unreliable when scenarios extrapolate far outside a
  channel's historical spend range (e.g. asking what 10x a channel's typical
  weekly spend would do) -- like any regression-based model, this one is
  only trustworthy for interpolating within roughly the range of spend
  levels it was fit on. The scenario simulator does not currently warn when
  a request falls outside that range.
- This is a demo/portfolio project over synthetic data with a fixed seed, not
  a production MMM system — a real deployment would need actual spend/revenue
  history, geo or holdout experiments to validate causal lift (MMM alone
  can't distinguish correlation from causation), and revalidation as channel
  mix and market conditions change.
