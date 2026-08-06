'use strict';

const { evaluateAllocation } = require('./optimizer');

/**
 * Compares an arbitrary set of named allocations (e.g. "current",
 * "optimized", "what_if_shift_tv_to_search") against the fitted model
 * and returns predicted revenue + ROI ranking for each, so a planner
 * can weigh concrete "what if we moved $X from channel A to channel
 * B" questions instead of only seeing the single global optimum.
 */
function compareScenarios(model, scenarios) {
  const results = {};
  for (const [name, allocation] of Object.entries(scenarios)) {
    const totalSpend = Object.values(allocation).reduce((a, b) => a + b, 0);
    const predictedRevenue = evaluateAllocation(model, allocation);
    results[name] = {
      allocation,
      totalSpend,
      predictedRevenue,
      roas: totalSpend > 0 ? predictedRevenue / totalSpend : null,
    };
  }
  return results;
}

module.exports = { compareScenarios };
