'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fitRidge, predict, mape } = require('../src/ridge');

test('ridge regression recovers known coefficients on a noiseless linear system', () => {
  // y = 3 + 2*x1 - 1*x2
  const X = [];
  const y = [];
  let seed = 42;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let i = 0; i < 200; i++) {
    const x1 = rand() * 10;
    const x2 = rand() * 10;
    X.push([1, x1, x2]);
    y.push(3 + 2 * x1 - 1 * x2);
  }
  const beta = fitRidge(X, y, 1e-6); // tiny lambda ~ OLS
  assert.ok(Math.abs(beta[0] - 3) < 0.05, `intercept off: ${beta[0]}`);
  assert.ok(Math.abs(beta[1] - 2) < 0.05, `x1 coef off: ${beta[1]}`);
  assert.ok(Math.abs(beta[2] + 1) < 0.05, `x2 coef off: ${beta[2]}`);
});

test('ridge with larger lambda shrinks coefficients toward zero', () => {
  const X = [[1, 1], [1, 2], [1, 3], [1, 4], [1, 5]];
  const y = [2, 4, 6, 8, 10];
  const betaLow = fitRidge(X, y, 0.001);
  const betaHigh = fitRidge(X, y, 100);
  assert.ok(Math.abs(betaHigh[1]) < Math.abs(betaLow[1]));
});

test('predict + mape work end to end', () => {
  const X = [[1, 1], [1, 2], [1, 3]];
  const y = [2, 4, 6];
  const beta = fitRidge(X, y, 1e-6);
  const preds = predict(X, beta);
  const error = mape(y, preds);
  assert.ok(error < 1, `expected near-zero MAPE, got ${error}`);
});
