'use strict';

const fs = require('fs');

const CHANNELS = ['tv', 'search', 'social', 'display', 'email'];

/**
 * Loads weekly marketing spend + revenue from CSV.
 * Expected columns: week,tv,search,social,display,email,revenue
 */
function loadSpendRevenueCSV(path) {
  const raw = fs.readFileSync(path, 'utf8').trim();
  const [headerLine, ...lines] = raw.split('\n');
  const headers = headerLine.split(',').map((h) => h.trim());

  const weeks = lines
    .filter((l) => l.trim().length > 0)
    .map((line) => {
      const cells = line.split(',').map((c) => c.trim());
      const row = {};
      headers.forEach((h, i) => {
        row[h] = cells[i];
      });
      const spend = {};
      for (const ch of CHANNELS) {
        spend[ch] = Number(row[ch]);
      }
      return {
        week: row.week,
        spend,
        revenue: Number(row.revenue),
      };
    });

  for (const w of weeks) {
    if (Number.isNaN(w.revenue)) throw new Error(`Invalid revenue value for week ${w.week}`);
    for (const ch of CHANNELS) {
      if (Number.isNaN(w.spend[ch])) throw new Error(`Invalid spend value for channel ${ch} in week ${w.week}`);
    }
  }

  return { channels: CHANNELS, weeks };
}

module.exports = { loadSpendRevenueCSV, CHANNELS };
