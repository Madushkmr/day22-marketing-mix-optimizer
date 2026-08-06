'use strict';

/**
 * Rule-based natural-language summary of a fit + optimization result.
 * No external LLM API -- runs fully offline, consistent with the
 * narrative modules used elsewhere in this series.
 */
function buildNarrative({ model, currentAllocation, optimized, scenarios }) {
  const lines = [];

  const linearW = (model.linear.weight * 100).toFixed(0);
  const satW = (model.saturated.weight * 100).toFixed(0);
  lines.push(
    `Model blend: ${satW}% saturated-response curve / ${linearW}% linear-response, chosen by holdout backtest error ` +
      `(saturated MAPE ${model.saturated.mapeHoldout.toFixed(1)}%, linear MAPE ${model.linear.mapeHoldout.toFixed(1)}%).`
  );

  // Rank channels by current ROAS implied by the model coefficients.
  const roas = model.channels.map((ch, i) => {
    const idx = i + 1;
    const betaLin = model.linear.beta[idx];
    const betaSat = model.saturated.beta[idx];
    return { channel: ch, weight: model.linear.weight * betaLin + model.saturated.weight * betaSat };
  });
  roas.sort((a, b) => b.weight - a.weight);
  const best = roas[0];
  const worst = roas[roas.length - 1];
  lines.push(
    `${best.channel} shows the strongest modeled response coefficient; ${worst.channel} shows the weakest ` +
      `among the ${model.channels.length} channels analyzed.`
  );

  if (optimized) {
    const currentRevenue = scenarios.current.predictedRevenue;
    const lift = optimized.predictedRevenue - currentRevenue;
    const liftPct = currentRevenue !== 0 ? (lift / currentRevenue) * 100 : 0;
    lines.push(
      `Reallocating the same total budget (${fmt(scenarios.current.totalSpend)}) toward the optimizer's recommended ` +
        `mix is projected to move revenue from ${fmt(currentRevenue)} to ${fmt(optimized.predictedRevenue)} ` +
        `(${lift >= 0 ? '+' : ''}${liftPct.toFixed(1)}%).`
    );

    const deltas = model.channels
      .map((ch) => ({ ch, delta: optimized.allocation[ch] - currentAllocation[ch] }))
      .sort((a, b) => b.delta - a.delta);
    const biggestIncrease = deltas[0];
    const biggestDecrease = deltas[deltas.length - 1];
    if (biggestIncrease.delta > 1) {
      lines.push(
        `Recommended: increase ${biggestIncrease.ch} spend by ${fmt(biggestIncrease.delta)}/week ` +
          `(still-room-to-grow channel, not yet heavily saturated).`
      );
    }
    if (biggestDecrease.delta < -1) {
      lines.push(
        `Recommended: reduce ${biggestDecrease.ch} spend by ${fmt(-biggestDecrease.delta)}/week ` +
          `(marginal returns there are now below other channels' marginal returns).`
      );
    }
  }

  return lines.join(' ');
}

function fmt(n) {
  return '$' + Math.round(n).toLocaleString('en-US');
}

module.exports = { buildNarrative };
