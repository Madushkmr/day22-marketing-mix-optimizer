'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { multiply, transpose, invert } = require('../src/matrix');

test('multiply produces correct dimensions and values', () => {
  const A = [[1, 2], [3, 4]];
  const B = [[5, 6], [7, 8]];
  const C = multiply(A, B);
  assert.deepEqual(C, [[19, 22], [43, 50]]);
});

test('transpose flips rows and columns', () => {
  const A = [[1, 2, 3], [4, 5, 6]];
  assert.deepEqual(transpose(A), [[1, 4], [2, 5], [3, 6]]);
});

test('invert recovers the identity when multiplied by original', () => {
  const A = [[4, 7], [2, 6]];
  const Ainv = invert(A);
  const product = multiply(A, Ainv);
  assert.ok(Math.abs(product[0][0] - 1) < 1e-9);
  assert.ok(Math.abs(product[1][1] - 1) < 1e-9);
  assert.ok(Math.abs(product[0][1]) < 1e-9);
  assert.ok(Math.abs(product[1][0]) < 1e-9);
});

test('invert throws on a singular matrix', () => {
  const singular = [[1, 2], [2, 4]];
  assert.throws(() => invert(singular));
});
