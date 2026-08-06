'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runPipeline, DEFAULT_DATA_PATH } = require('../src/engine');
const db = require('../src/db');

test('runPipeline executes end-to-end and persists a run + optimization + scenarios', () => {
  const tmpDbPath = path.join(os.tmpdir(), `mmm-test-${Date.now()}.db`);
  const result = runPipeline({ dataPath: DEFAULT_DATA_PATH, dbPath: tmpDbPath });

  assert.ok(result.runId > 0);
  assert.ok(result.optimized.predictedRevenue > 0);
  assert.ok(typeof result.narrative === 'string' && result.narrative.length > 20);
  assert.ok(result.scenarios.current && result.scenarios.optimized);

  const database = db.openDb(tmpDbPath);
  const run = db.getRun(database, result.runId);
  assert.ok(run, 'run should be retrievable after persisting');
  assert.equal(run.channels.length, 5);

  const opts = db.getOptimizationsForRun(database, result.runId);
  assert.equal(opts.length, 1);
  assert.ok(opts[0].predictedRevenue > 0);
  database.close();

  fs.unlinkSync(tmpDbPath);
});

test('runPipeline is repeatable and each run gets a new id', () => {
  const tmpDbPath = path.join(os.tmpdir(), `mmm-test-repeat-${Date.now()}.db`);
  const r1 = runPipeline({ dataPath: DEFAULT_DATA_PATH, dbPath: tmpDbPath });
  const r2 = runPipeline({ dataPath: DEFAULT_DATA_PATH, dbPath: tmpDbPath });
  assert.ok(r2.runId > r1.runId);
  fs.unlinkSync(tmpDbPath);
});
