'use strict';

const { marginalReturn, predictRevenueForAllocation } = require('./mmm');

/**
 * Greedy marginal-return budget allocator.
 *
 * Given a fixed total budget, starts from a minimum floor per channel
 * (5% of the naive even split, so no channel is starved to zero) and
 * repeatedly hands the next increment of budget to whichever channel
 * currently has the highest marginal return per dollar (accounting
 * for diminishing returns via the saturation curve derivative). This
 * is a standard hill-climbing / water-filling approach to concave
 * budget allocation problems: because each channel's response is
 * concave (saturating), greedily following the marginal-return
 * gradient converges to the (near-)optimal allocation without needing
 * a general-purpose nonlinear solver.
 *
 * @param {object} model fitted MMM model (see mmm.js)
 * @param {number} totalBudget total to allocate across channels
 * @param {object} [opts]
 * @param {number} [opts.steps] number of increments to distribute (more = finer-grained)
 * @param {object} [opts.minShare] per-channel minimum floor as a fraction of even split
 */
function optimizeBudget(model, totalBudget, opts = {}) {
  const { channels } = model;
  const steps = opts.steps || 500;
  const minSharePct = opts.minShare ?? 0.05;

  const evenSplit = totalBudget / channels.length;
  const floor = evenSplit * minSharePct;

  const allocation = {};
  for (const ch of channels) allocation[ch] = floor;

  let remaining = totalBudget - floor * channels.length;
  if (remaining < 0) {
    throw new Error('Budget too small to meet minimum per-channel floor');
  }

  const increment = remaining / steps;
  for (let s = 0; s < steps; s++) {
    let bestChannel = channels[0];
    let bestMarginal = -Infinity;
    for (const ch of channels) {
      const m = marginalReturn(model, ch, allocation[ch]);
      if (m > bestMarginal) {
        bestMarginal = m;
        bestChannel = ch;
      }
    }
    allocation[bestChannel] += increment;
  }

  const predictedRevenue = predictRevenueForAllocation(model, allocation);
  return { allocation, predictedRevenue };
}

/**
 * Convenience: score an arbitrary user-specified allocation (does not
 * have to sum exactly to any particular budget) against the model.
 */
function evaluateAllocation(model, allocation) {
  return predictRevenueForAllocation(model, allocation);
}

module.exports = { optimizeBudget, evaluateAllocation };
