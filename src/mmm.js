'use strict';

const { applyAdstock } = require('./adstock');
const { saturate, saturateDerivative } = require('./saturation');
const { fitRidge, predict, mape, rmse } = require('./ridge');

const RIDGE_LAMBDA = 1.0;
const HOLDOUT_WEEKS = 12;

/**
 * Builds per-channel saturation scale k (roughly, the spend level at
 * which a channel is already meaningfully saturated) from the
 * historical spend distribution: mean spend, floored so a channel with
 * near-zero historical spend still gets a sane curve.
 */
function computeSaturationScales(channels, weeks) {
  const scales = {};
  for (const ch of channels) {
    const vals = weeks.map((w) => w.spend[ch]);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    scales[ch] = Math.max(mean, 1);
  }
  return scales;
}

/**
 * Builds a design matrix for a given transform of channel spend.
 * transformFn(adstockedSeries, channel) -> transformed series
 */
function buildDesignMatrix(channels, weeks, adstockedByChannel, transformFn) {
  const n = weeks.length;
  const X = [];
  for (let t = 0; t < n; t++) {
    const row = [1]; // intercept
    for (const ch of channels) {
      row.push(transformFn(adstockedByChannel[ch][t], ch));
    }
    row.push(t / n); // linear trend term, normalized
    X.push(row);
  }
  return X;
}

function trainTestSplit(X, y, holdout) {
  const n = X.length;
  const splitAt = Math.max(1, n - holdout);
  return {
    Xtrain: X.slice(0, splitAt),
    ytrain: y.slice(0, splitAt),
    Xtest: X.slice(splitAt),
    ytest: y.slice(splitAt),
  };
}

/**
 * Fits two competing MMM specifications and blends them:
 *
 *  - "linear": adstocked spend enters the model directly (no
 *    diminishing returns) -- simple, stable, but can't express
 *    saturation.
 *  - "saturated": adstocked spend is passed through the exponential
 *    saturation curve before entering the model -- captures
 *    diminishing returns but is a more complex, higher-variance fit.
 *
 * Both are backtested on the same trailing holdout window and blended
 * by inverse-RMSE weighting (a model that predicts the holdout better
 * gets more say in the final blended response curves), the same
 * "let backtest error decide the mix" idea used for reconciliation in
 * the previous day's forecasting engine, applied here to model
 * selection instead of hierarchy levels.
 */
function fitMMM(channels, weeks) {
  const y = weeks.map((w) => w.revenue);
  const decay = {};
  const adstockedByChannel = {};
  for (const ch of channels) {
    decay[ch] = 0.5; // fixed, documented carryover rate (see README limitations)
    adstockedByChannel[ch] = applyAdstock(
      weeks.map((w) => w.spend[ch]),
      decay[ch]
    );
  }
  const satScales = computeSaturationScales(channels, weeks);

  const Xlinear = buildDesignMatrix(channels, weeks, adstockedByChannel, (v) => v);
  const Xsat = buildDesignMatrix(channels, weeks, adstockedByChannel, (v, ch) => saturate(v, satScales[ch]));

  const splitLinear = trainTestSplit(Xlinear, y, HOLDOUT_WEEKS);
  const splitSat = trainTestSplit(Xsat, y, HOLDOUT_WEEKS);

  const betaLinearBT = fitRidge(splitLinear.Xtrain, splitLinear.ytrain, RIDGE_LAMBDA);
  const betaSatBT = fitRidge(splitSat.Xtrain, splitSat.ytrain, RIDGE_LAMBDA);

  const predLinearTest = predict(splitLinear.Xtest, betaLinearBT);
  const predSatTest = predict(splitSat.Xtest, betaSatBT);

  const rmseLinear = rmse(splitLinear.ytest, predLinearTest);
  const rmseSat = rmse(splitSat.ytest, predSatTest);
  const mapeLinear = mape(splitLinear.ytest, predLinearTest);
  const mapeSat = mape(splitSat.ytest, predSatTest);

  // Inverse-error weighting with a floor so neither model is ever
  // fully zeroed out (mirrors the ensembling approach used elsewhere
  // in the series).
  const FLOOR = 0.1;
  const invLinear = 1 / Math.max(rmseLinear, 1e-6);
  const invSat = 1 / Math.max(rmseSat, 1e-6);
  let wLinear = invLinear / (invLinear + invSat);
  let wSat = 1 - wLinear;
  wLinear = Math.max(wLinear, FLOOR);
  wSat = Math.max(wSat, FLOOR);
  const norm = wLinear + wSat;
  wLinear /= norm;
  wSat /= norm;

  // Refit both models on the FULL dataset for the production model
  // (the holdout split above was only to score blend weights).
  const betaLinear = fitRidge(Xlinear, y, RIDGE_LAMBDA);
  const betaSat = fitRidge(Xsat, y, RIDGE_LAMBDA);

  return {
    channels,
    decay,
    satScales,
    ridgeLambda: RIDGE_LAMBDA,
    holdoutWeeks: HOLDOUT_WEEKS,
    linear: { beta: betaLinear, rmseHoldout: rmseLinear, mapeHoldout: mapeLinear, weight: wLinear },
    saturated: { beta: betaSat, rmseHoldout: rmseSat, mapeHoldout: mapeSat, weight: wSat },
  };
}

/**
 * Predicts revenue for a hypothetical weekly spend allocation (a
 * single week snapshot, not a time series) using the blended model.
 * Adstock carryover is approximated by treating the hypothetical spend
 * as steady-state (i.e. adstocked value = spend / (1 - decay)), which
 * is the correct long-run average of the geometric adstock recursion
 * for a constant weekly spend level -- appropriate for "if I sustained
 * this allocation" scenario comparisons rather than single-week shocks.
 */
function predictRevenueForAllocation(model, allocation, trendPosition = 1) {
  const { channels, decay, satScales, linear, saturated } = model;

  const rowLinear = [1];
  const rowSat = [1];
  for (const ch of channels) {
    const steadyAdstock = allocation[ch] / (1 - decay[ch]);
    rowLinear.push(steadyAdstock);
    rowSat.push(saturate(steadyAdstock, satScales[ch]));
  }
  rowLinear.push(trendPosition);
  rowSat.push(trendPosition);

  const predLinear = rowLinear.reduce((s, v, i) => s + v * linear.beta[i], 0);
  const predSat = rowSat.reduce((s, v, i) => s + v * saturated.beta[i], 0);

  return linear.weight * predLinear + saturated.weight * predSat;
}

/**
 * Marginal revenue per next dollar spent on a channel at a given
 * steady-state allocation level, used by the budget optimizer. Uses
 * the saturated-model curve (the one capable of expressing
 * diminishing returns) weighted the same as the blended prediction,
 * plus the linear model's constant marginal rate for its share of the
 * blend.
 */
function marginalReturn(model, channel, spendLevel) {
  const { decay, satScales, linear, saturated, channels } = model;
  const idx = channels.indexOf(channel) + 1; // +1 for intercept offset
  const steadyAdstock = spendLevel / (1 - decay[channel]);

  // d(steadyAdstock)/d(spend) = 1 / (1 - decay)
  const dAdstockDSpend = 1 / (1 - decay[channel]);

  const linearMarginal = linear.beta[idx] * dAdstockDSpend;
  const satMarginal = saturated.beta[idx] * saturateDerivative(steadyAdstock, satScales[channel]) * dAdstockDSpend;

  return linear.weight * linearMarginal + saturated.weight * satMarginal;
}

module.exports = {
  fitMMM,
  predictRevenueForAllocation,
  marginalReturn,
  computeSaturationScales,
};
