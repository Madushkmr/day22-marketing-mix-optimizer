'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { applyAdstock } = require('../src/adstock');
const { saturate, saturateDerivative } = require('../src/saturation');

test('adstock with decay=0 is the identity transform', () => {
  const spend = [10, 20, 30];
  assert.deepEqual(applyAdstock(spend, 0), [10, 20, 30]);
});

test('adstock carries value forward with decay > 0', () => {
  const spend = [100, 0, 0];
  const out = applyAdstock(spend, 0.5);
  assert.equal(out[0], 100);
  assert.equal(out[1], 50);
  assert.equal(out[2], 25);
});

test('adstock rejects decay outside [0, 1)', () => {
  assert.throws(() => applyAdstock([1, 2], 1));
  assert.throws(() => applyAdstock([1, 2], -0.1));
});

test('saturation is 0 at x=0 and bounded below 1', () => {
  assert.equal(saturate(0, 100), 0);
  // Note: at truly extreme x (e.g. 1e9), exp(-x/k) underflows to exactly
  // 0 in double precision and saturate() returns exactly 1 -- expected
  // floating-point behavior, not a bug. Use a large-but-not-underflowing
  // x to check the "approaches but never reaches 1" property instead.
  assert.ok(saturate(3000, 100) < 1);
  assert.ok(saturate(3000, 100) > 0.999999);
});

test('saturation is monotonically increasing', () => {
  const k = 500;
  let prev = -Infinity;
  for (let x = 0; x <= 5000; x += 250) {
    const v = saturate(x, k);
    assert.ok(v >= prev);
    prev = v;
  }
});

test('saturation derivative decreases as spend increases (diminishing returns)', () => {
  const k = 500;
  const d1 = saturateDerivative(100, k);
  const d2 = saturateDerivative(1000, k);
  const d3 = saturateDerivative(5000, k);
  assert.ok(d1 > d2);
  assert.ok(d2 > d3);
});
