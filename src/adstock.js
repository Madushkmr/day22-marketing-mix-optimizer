'use strict';

/**
 * Geometric adstock transform: models the "carryover" effect of media
 * spend (a TV ad seen this week keeps nudging behavior for a few weeks
 * afterwards). adstocked[t] = spend[t] + decay * adstocked[t-1].
 *
 * decay in [0, 1). decay=0 means no carryover (adstocked === spend).
 * Higher decay means the effect of past spend lingers longer.
 */
function applyAdstock(spendSeries, decay) {
  if (decay < 0 || decay >= 1) {
    throw new Error('adstock decay must be in [0, 1)');
  }
  const out = new Array(spendSeries.length).fill(0);
  let carry = 0;
  for (let t = 0; t < spendSeries.length; t++) {
    carry = spendSeries[t] + decay * carry;
    out[t] = carry;
  }
  return out;
}

module.exports = { applyAdstock };
