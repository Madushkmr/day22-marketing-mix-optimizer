'use strict';

/**
 * Exponential saturation ("diminishing returns") curve.
 *
 *   sat(x, k) = 1 - exp(-x / k)
 *
 * - sat(0, k) = 0, sat(x, k) -> 1 as x -> infinity: bounded response.
 * - Monotonically increasing and concave: each extra dollar of spend
 *   buys less incremental response than the last, which is the whole
 *   point of a saturation curve in media mix modeling.
 * - k is the "half-life" spend scale for the channel (roughly, the
 *   spend level at which the channel is already ~63% saturated).
 *   Chosen per-channel from the data (e.g. mean historical spend) so
 *   channels with different budget scales are comparable.
 *
 * The derivative is closed-form, which the budget optimizer uses to
 * rank channels by marginal return per next dollar spent.
 */
function saturate(x, k) {
  if (k <= 0) throw new Error('saturation k must be > 0');
  return 1 - Math.exp(-x / k);
}

function saturateDerivative(x, k) {
  if (k <= 0) throw new Error('saturation k must be > 0');
  return Math.exp(-x / k) / k;
}

module.exports = { saturate, saturateDerivative };
