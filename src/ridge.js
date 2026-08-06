'use strict';

const { transpose, multiply, addScaledIdentity, invert, matVec } = require('./matrix');

/**
 * Ridge regression fit via the closed-form normal equations:
 *
 *   beta = (X^T X + lambda * I)^-1 X^T y
 *
 * Ridge (rather than plain OLS) is used because MMM design matrices
 * routinely have correlated columns (e.g. two channels that tend to
 * run campaigns in the same weeks), which makes X^T X ill-conditioned;
 * the lambda*I term keeps it invertible and shrinks coefficients
 * toward zero to reduce variance. The intercept column is not
 * penalized.
 *
 * @param {number[][]} X design matrix, rows = observations, first
 *   column must be the intercept (all 1s).
 * @param {number[]} y target vector
 * @param {number} lambda ridge penalty strength
 */
function fitRidge(X, y, lambda) {
  const Xt = transpose(X);
  const XtX = multiply(Xt, X);
  const n = XtX.length;
  const penalty = Array.from({ length: n }, (_, i) => (i === 0 ? 0 : lambda)); // don't penalize intercept
  const XtXreg = XtX.map((row, i) => row.map((v, j) => (i === j ? v + penalty[i] : v)));
  const XtXinv = invert(XtXreg);
  const XtY = multiply(Xt, y.map((v) => [v]));
  const betaCol = multiply(XtXinv, XtY);
  return betaCol.map((r) => r[0]);
}

function predict(X, beta) {
  return matVec(X, beta);
}

function mape(actual, predicted) {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < actual.length; i++) {
    if (Math.abs(actual[i]) < 1e-9) continue;
    sum += Math.abs((actual[i] - predicted[i]) / actual[i]);
    count++;
  }
  return count === 0 ? 0 : (sum / count) * 100;
}

function rmse(actual, predicted) {
  const n = actual.length;
  const sq = actual.reduce((s, a, i) => s + (a - predicted[i]) ** 2, 0);
  return Math.sqrt(sq / n);
}

module.exports = { fitRidge, predict, mape, rmse, addScaledIdentity };
