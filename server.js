'use strict';

const express = require('express');
const path = require('path');
const { runPipeline, DEFAULT_DB_PATH } = require('./src/engine');
const { optimizeBudget } = require('./src/optimizer');
const { compareScenarios } = require('./src/scenario');
const db = require('./src/db');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 5000;

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.post('/api/run', (req, res) => {
  try {
    const result = runPipeline();
    res.json({
      runId: result.runId,
      narrative: result.narrative,
      totalBudget: result.totalBudget,
      optimized: result.optimized,
      scenarios: result.scenarios,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/runs', (req, res) => {
  const database = db.openDb(DEFAULT_DB_PATH);
  const runs = db.listRuns(database);
  database.close();
  res.json(runs);
});

app.get('/api/runs/latest', (req, res) => {
  const database = db.openDb(DEFAULT_DB_PATH);
  const run = db.getLatestRun(database);
  const opts = run ? db.getOptimizationsForRun(database, run.id) : [];
  database.close();
  if (!run) return res.status(404).json({ error: 'No runs yet. POST /api/run first.' });
  res.json({ run, optimizations: opts });
});

app.get('/api/runs/:id', (req, res) => {
  const database = db.openDb(DEFAULT_DB_PATH);
  const run = db.getRun(database, Number(req.params.id));
  const opts = run ? db.getOptimizationsForRun(database, run.id) : [];
  database.close();
  if (!run) return res.status(404).json({ error: 'Run not found' });
  res.json({ run, optimizations: opts });
});

app.post('/api/runs/:id/optimize', (req, res) => {
  const database = db.openDb(DEFAULT_DB_PATH);
  const run = db.getRun(database, Number(req.params.id));
  if (!run) {
    database.close();
    return res.status(404).json({ error: 'Run not found' });
  }
  const totalBudget = Number(req.body.totalBudget);
  if (!totalBudget || totalBudget <= 0) {
    database.close();
    return res.status(400).json({ error: 'totalBudget must be a positive number' });
  }
  try {
    const result = optimizeBudget(run.model, totalBudget);
    const optId = db.insertOptimization(database, {
      runId: run.id,
      totalBudget,
      allocation: result.allocation,
      predictedRevenue: result.predictedRevenue,
    });
    database.close();
    res.json({ optimizationId: optId, ...result });
  } catch (err) {
    database.close();
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/runs/:id/simulate', (req, res) => {
  const database = db.openDb(DEFAULT_DB_PATH);
  const run = db.getRun(database, Number(req.params.id));
  database.close();
  if (!run) return res.status(404).json({ error: 'Run not found' });
  const { scenarios } = req.body;
  if (!scenarios || typeof scenarios !== 'object') {
    return res.status(400).json({ error: 'Body must include { scenarios: { name: { channel: spend, ... } } }' });
  }
  try {
    const result = compareScenarios(run.model, scenarios);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Marketing mix optimizer dashboard: http://localhost:${PORT}`);
  });
}

module.exports = app;
