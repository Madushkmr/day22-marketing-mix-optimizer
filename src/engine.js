'use strict';

const path = require('path');
const { loadSpendRevenueCSV } = require('./data');
const { fitMMM } = require('./mmm');
const { optimizeBudget } = require('./optimizer');
const { compareScenarios } = require('./scenario');
const { buildNarrative } = require('./narrative');
const db = require('./db');

const DEFAULT_DATA_PATH = path.join(__dirname, '..', 'sample_data', 'marketing_spend.csv');
const DEFAULT_DB_PATH = path.join(__dirname, '..', 'mmm.db');

/**
 * Orchestrates the full pipeline: ingest -> fit blended MMM -> compute
 * current allocation baseline -> optimize budget -> compare scenarios
 * -> generate narrative -> persist. Mirrors the "engine orchestrates
 * ingest -> model -> decide -> persist" shape used elsewhere in the
 * series, applied here to a prescriptive (not just predictive) task.
 */
function runPipeline({ dataPath = DEFAULT_DATA_PATH, dbPath = DEFAULT_DB_PATH } = {}) {
  const { channels, weeks } = loadSpendRevenueCSV(dataPath);
  const model = fitMMM(channels, weeks);

  const lastWeek = weeks[weeks.length - 1];
  const currentAllocation = { ...lastWeek.spend };
  const totalBudget = Object.values(currentAllocation).reduce((a, b) => a + b, 0);

  const optimized = optimizeBudget(model, totalBudget);

  const scenarios = compareScenarios(model, {
    current: currentAllocation,
    optimized: optimized.allocation,
  });

  const narrative = buildNarrative({
    model,
    currentAllocation,
    optimized,
    scenarios,
  });

  const database = db.openDb(dbPath);
  const runId = db.insertRun(database, { dataPath, channels, model, narrative });
  db.insertOptimization(database, {
    runId,
    totalBudget,
    allocation: optimized.allocation,
    predictedRevenue: optimized.predictedRevenue,
  });
  db.insertScenarios(database, { runId, scenarios });
  database.close();

  return { runId, model, currentAllocation, totalBudget, optimized, scenarios, narrative };
}

module.exports = { runPipeline, DEFAULT_DATA_PATH, DEFAULT_DB_PATH };
