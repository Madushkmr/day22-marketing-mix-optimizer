'use strict';

/**
 * Regenerates sample_data/marketing_spend.csv: 104 weeks (2 years) of
 * synthetic weekly spend across 5 channels plus resulting revenue,
 * built from known ground-truth response curves so the fitted model
 * can be sanity-checked against a real answer (see tests/test_mmm.js).
 *
 * Uses a seeded PRNG (mulberry32) so the checked-in CSV is reproducible.
 */
const fs = require('fs');
const path = require('path');
const { applyAdstock } = require('../src/adstock');
const { saturate } = require('../src/saturation');

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260806);
const WEEKS = 104;

// Ground-truth per-channel behavior: baseline weekly spend level,
// week-to-week noise, adstock decay (carryover), true revenue
// coefficient, and saturation scale.
const CHANNEL_TRUTH = {
  tv: { baseSpend: 8000, noise: 1500, decay: 0.6, coef: 2.2, satK: 9000 },
  search: { baseSpend: 5000, noise: 800, decay: 0.2, coef: 3.1, satK: 6000 },
  social: { baseSpend: 3000, noise: 700, decay: 0.4, coef: 2.6, satK: 4000 },
  display: { baseSpend: 2500, noise: 600, decay: 0.5, coef: 1.4, satK: 5000 },
  email: { baseSpend: 800, noise: 200, decay: 0.1, coef: 4.0, satK: 1200 },
};

const CHANNELS = Object.keys(CHANNEL_TRUTH);
const BASELINE_REVENUE = 40000;
const TREND_PER_WEEK = 60;
const SEASONAL_AMPLITUDE = 6000;
const NOISE_STD = 1800;

function gaussianNoise(std) {
  // Box-Muller
  const u1 = Math.max(rand(), 1e-9);
  const u2 = rand();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return z * std;
}

function main() {
  const spendByChannel = {};
  for (const ch of CHANNELS) {
    const truth = CHANNEL_TRUTH[ch];
    spendByChannel[ch] = Array.from({ length: WEEKS }, () =>
      Math.max(0, truth.baseSpend + gaussianNoise(truth.noise))
    );
  }

  const adstockedByChannel = {};
  for (const ch of CHANNELS) {
    adstockedByChannel[ch] = applyAdstock(spendByChannel[ch], CHANNEL_TRUTH[ch].decay);
  }

  const rows = [];
  for (let t = 0; t < WEEKS; t++) {
    let revenue = BASELINE_REVENUE + TREND_PER_WEEK * t;
    revenue += SEASONAL_AMPLITUDE * Math.sin((2 * Math.PI * t) / 52);
    for (const ch of CHANNELS) {
      const truth = CHANNEL_TRUTH[ch];
      const response = saturate(adstockedByChannel[ch][t], truth.satK);
      revenue += truth.coef * response * truth.satK; // scale so coef is interpretable as $ per saturation-unit
    }
    revenue += gaussianNoise(NOISE_STD);

    rows.push({
      week: `2024-W${String(t + 1).padStart(2, '0')}`,
      ...Object.fromEntries(CHANNELS.map((ch) => [ch, Math.round(spendByChannel[ch][t])])),
      revenue: Math.round(Math.max(revenue, 0)),
    });
  }

  const header = ['week', ...CHANNELS, 'revenue'].join(',');
  const lines = rows.map((r) => [r.week, ...CHANNELS.map((ch) => r[ch]), r.revenue].join(','));
  const csv = [header, ...lines].join('\n') + '\n';

  const outPath = path.join(__dirname, '..', 'sample_data', 'marketing_spend.csv');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, csv);
  console.log(`Wrote ${rows.length} weeks of synthetic data to ${outPath}`);
}

if (require.main === module) {
  main();
}

module.exports = { CHANNEL_TRUTH, mulberry32 };
