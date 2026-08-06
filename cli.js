#!/usr/bin/env node
'use strict';

const path = require('path');
const { runPipeline, DEFAULT_DB_PATH } = require('./src/engine');
const db = require('./src/db');
const { optimizeBudget } = require('./src/optimizer');
const { compareScenarios } = require('./src/scenario');

function main() {
  const [, , command, ...args] = process.argv;

  switch (command) {
    case 'fit': {
      const result = runPipeline();
      console.log(`Fitted run #${result.runId}.`);
      console.log(result.narrative);
      break;
    }
    case 'list-runs': {
      const database = db.openDb(DEFAULT_DB_PATH);
      const runs = db.listRuns(database);
      database.close();
      if (runs.length === 0) {
        console.log('No runs yet. Run `node cli.js fit` first.');
        break;
      }
      for (const r of runs) {
        console.log(`#${r.id}  ${r.created_at}  channels=[${r.channels.join(', ')}]`);
      }
      break;
    }
    case 'show-run': {
      const id = Number(args[0]);
      if (!id) {
        console.error('Usage: node cli.js show-run <id>');
        process.exit(1);
      }
      const database = db.openDb(DEFAULT_DB_PATH);
      const run = db.getRun(database, id);
      const opts = db.getOptimizationsForRun(database, id);
      database.close();
      if (!run) {
        console.error(`No run #${id}`);
        process.exit(1);
      }
      console.log(JSON.stringify({ run, optimizations: opts }, null, 2));
      break;
    }
    case 'optimize': {
      const budgetArg = args.find((a) => a.startsWith('--budget='));
      const database = db.openDb(DEFAULT_DB_PATH);
      const latest = db.getLatestRun(database);
      if (!latest) {
        console.error('No runs yet. Run `node cli.js fit` first.');
        process.exit(1);
      }
      const budget = budgetArg ? Number(budgetArg.split('=')[1]) : defaultBudgetFromModel(latest.model);
      const result = optimizeBudget(latest.model, budget);
      const optId = db.insertOptimization(database, {
        runId: latest.id,
        totalBudget: budget,
        allocation: result.allocation,
        predictedRevenue: result.predictedRevenue,
      });
      database.close();
      console.log(`Optimization #${optId} for run #${latest.id}, budget=$${budget.toFixed(0)}`);
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case 'simulate': {
      const allocArg = args.find((a) => a.startsWith('--allocation='));
      if (!allocArg) {
        console.error('Usage: node cli.js simulate --allocation=\'{"tv":8000,"search":5000,...}\'');
        process.exit(1);
      }
      const allocation = JSON.parse(allocArg.split('=').slice(1).join('='));
      const database = db.openDb(DEFAULT_DB_PATH);
      const latest = db.getLatestRun(database);
      database.close();
      if (!latest) {
        console.error('No runs yet. Run `node cli.js fit` first.');
        process.exit(1);
      }
      const result = compareScenarios(latest.model, { what_if: allocation });
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    default:
      console.log(`Usage: node cli.js <command>

Commands:
  fit                          Run the full ingest -> model -> optimize -> persist pipeline
  list-runs                    List all persisted runs
  show-run <id>                Show full detail for a run
  optimize --budget=<n>        Re-optimize budget allocation for the latest run
  simulate --allocation='{}'   Score a custom what-if allocation against the latest run
`);
  }
}

function defaultBudgetFromModel(model) {
  // Reasonable default: sum of each channel's saturation scale (roughly
  // "typical" historical spend level) as the total budget to reallocate.
  return Object.values(model.satScales).reduce((a, b) => a + b, 0);
}

main();
