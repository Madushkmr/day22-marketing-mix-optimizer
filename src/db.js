'use strict';

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

/**
 * Persistence layer using Node's built-in node:sqlite module (stable
 * enough for this use case as of Node 22; flagged experimental by
 * Node itself). Chosen over an npm SQLite package specifically to
 * keep this app's dependency tree at zero native-compiled modules,
 * which makes `npm install` fast and reliable across machines.
 */
function openDb(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      data_path TEXT NOT NULL,
      channels TEXT NOT NULL,
      model_json TEXT NOT NULL,
      narrative TEXT
    );

    CREATE TABLE IF NOT EXISTS optimizations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      total_budget REAL NOT NULL,
      allocation_json TEXT NOT NULL,
      predicted_revenue REAL NOT NULL,
      FOREIGN KEY (run_id) REFERENCES runs(id)
    );

    CREATE TABLE IF NOT EXISTS scenarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      scenarios_json TEXT NOT NULL,
      FOREIGN KEY (run_id) REFERENCES runs(id)
    );
  `);
  return db;
}

function insertRun(db, { dataPath, channels, model, narrative }) {
  const stmt = db.prepare(
    `INSERT INTO runs (created_at, data_path, channels, model_json, narrative) VALUES (?, ?, ?, ?, ?)`
  );
  const info = stmt.run(
    new Date().toISOString(),
    dataPath,
    JSON.stringify(channels),
    JSON.stringify(model),
    narrative || null
  );
  return Number(info.lastInsertRowid);
}

function insertOptimization(db, { runId, totalBudget, allocation, predictedRevenue }) {
  const stmt = db.prepare(
    `INSERT INTO optimizations (run_id, created_at, total_budget, allocation_json, predicted_revenue) VALUES (?, ?, ?, ?, ?)`
  );
  const info = stmt.run(runId, new Date().toISOString(), totalBudget, JSON.stringify(allocation), predictedRevenue);
  return Number(info.lastInsertRowid);
}

function insertScenarios(db, { runId, scenarios }) {
  const stmt = db.prepare(`INSERT INTO scenarios (run_id, created_at, scenarios_json) VALUES (?, ?, ?)`);
  const info = stmt.run(runId, new Date().toISOString(), JSON.stringify(scenarios));
  return Number(info.lastInsertRowid);
}

function listRuns(db) {
  const rows = db.prepare(`SELECT id, created_at, data_path, channels FROM runs ORDER BY id DESC`).all();
  return rows.map((r) => ({ ...r, channels: JSON.parse(r.channels) }));
}

function getRun(db, id) {
  const row = db.prepare(`SELECT * FROM runs WHERE id = ?`).get(id);
  if (!row) return null;
  return {
    id: row.id,
    created_at: row.created_at,
    data_path: row.data_path,
    channels: JSON.parse(row.channels),
    model: JSON.parse(row.model_json),
    narrative: row.narrative,
  };
}

function getLatestRun(db) {
  const row = db.prepare(`SELECT id FROM runs ORDER BY id DESC LIMIT 1`).get();
  return row ? getRun(db, row.id) : null;
}

function getOptimizationsForRun(db, runId) {
  const rows = db.prepare(`SELECT * FROM optimizations WHERE run_id = ? ORDER BY id DESC`).all(runId);
  return rows.map((r) => ({
    id: r.id,
    created_at: r.created_at,
    totalBudget: r.total_budget,
    allocation: JSON.parse(r.allocation_json),
    predictedRevenue: r.predicted_revenue,
  }));
}

module.exports = {
  openDb,
  insertRun,
  insertOptimization,
  insertScenarios,
  listRuns,
  getRun,
  getLatestRun,
  getOptimizationsForRun,
};
