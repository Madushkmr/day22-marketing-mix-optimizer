'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadSpendRevenueCSV } = require('../src/data');
const { fitMMM, predictRevenueForAllocation } = require('../src/mmm');
const { optimizeBudget } = require('../src/optimizer');

const SAMPLE_CSV = path.join(__dirname, '..', 'sample_data', 'marketing_spend.csv');

function fittedModel() {
  const { channels, weeks } = loadSpendRevenueCSV(SAMPLE_CSV);
  return fitMMM(channels, weeks);
}

test('optimizeBudget allocates (approximately) the full budget', () => {
  const model = fittedModel();
  const budget = 30000;
  const { allocation } = optimizeBudget(model, budget, { steps: 300 });
  const total = Object.values(allocation).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - budget) < 1, `allocation should sum to budget, got ${total}`);
});

test('optimizeBudget gives every channel at least its minimum floor', () => {
  const model = fittedModel();
  const budget = 30000;
  const { allocation } = optimizeBudget(model, budget, { steps: 300, minShare: 0.05 });
  for (const ch of model.channels) {
    assert.ok(allocation[ch] > 0, `${ch} should have nonzero allocation`);
  }
});

test('optimizeBudget improves (or at least does not worsen) predicted revenue vs an even split', () => {
  const model = fittedModel();
  const budget = 30000;
  const evenSplit = Object.fromEntries(model.channels.map((c) => [c, budget / model.channels.length]));
  const evenRevenue = predictRevenueForAllocation(model, evenSplit);

  const { allocation, predictedRevenue } = optimizeBudget(model, budget, { steps: 500 });
  assert.ok(
    predictedRevenue >= evenRevenue - 1e-6,
    `optimized (${predictedRevenue}) should be >= even split (${evenRevenue})`
  );
  const total = Object.values(allocation).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - budget) < 1);
});

test('optimizeBudget rejects an infeasible minimum-floor configuration', () => {
  const model = fittedModel();
  // minShare is a fraction of the even split per channel; minShare > 1
  // means "every channel's floor alone exceeds an even share of the
  // budget," which is infeasible for all channels simultaneously
  // regardless of the total budget size.
  assert.throws(() => optimizeBudget(model, 30000, { minShare: 1.5 }));
});
