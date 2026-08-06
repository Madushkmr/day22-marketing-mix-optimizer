'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadSpendRevenueCSV } = require('../src/data');
const { fitMMM, predictRevenueForAllocation } = require('../src/mmm');

const SAMPLE_CSV = path.join(__dirname, '..', 'sample_data', 'marketing_spend.csv');

test('fitMMM produces a blended model with weights summing to 1', () => {
  const { channels, weeks } = loadSpendRevenueCSV(SAMPLE_CSV);
  const model = fitMMM(channels, weeks);
  const totalWeight = model.linear.weight + model.saturated.weight;
  assert.ok(Math.abs(totalWeight - 1) < 1e-9, `weights should sum to 1, got ${totalWeight}`);
  assert.ok(model.linear.weight > 0 && model.saturated.weight > 0, 'neither model should be fully zeroed out');
});

test('fitMMM backtest MAPE is reasonably low on synthetic data', () => {
  const { channels, weeks } = loadSpendRevenueCSV(SAMPLE_CSV);
  const model = fitMMM(channels, weeks);
  // Synthetic data has known structure; a reasonable fit should beat 25% MAPE on holdout.
  assert.ok(model.saturated.mapeHoldout < 25, `saturated MAPE too high: ${model.saturated.mapeHoldout}`);
  assert.ok(model.linear.mapeHoldout < 25, `linear MAPE too high: ${model.linear.mapeHoldout}`);
});

test('predictRevenueForAllocation increases with more total spend (all else equal)', () => {
  const { channels, weeks } = loadSpendRevenueCSV(SAMPLE_CSV);
  const model = fitMMM(channels, weeks);
  // Scale low/high per channel relative to that channel's own historical
  // spend level (satScales ~= historical mean spend) rather than a fixed
  // absolute number for every channel. Extrapolating a regression model
  // wildly outside the spend range it was trained on (e.g. asking what
  // $8,000/week on a channel that historically never exceeded ~$1,400/week
  // would do) is not a reliable test of the model -- real MMM tools have
  // the same caveat, noted in the README.
  const low = Object.fromEntries(channels.map((c) => [c, model.satScales[c] * 0.3]));
  const high = Object.fromEntries(channels.map((c) => [c, model.satScales[c] * 1.5]));
  const revLow = predictRevenueForAllocation(model, low);
  const revHigh = predictRevenueForAllocation(model, high);
  assert.ok(revHigh > revLow, 'more spend within a realistic historical range should predict more revenue');
});
