'use strict';

/**
 * Minimal dense-matrix helpers, written from scratch (no numpy/numeric.js
 * equivalent needed in Node) since the design matrices in this app are
 * small: a handful of channels plus trend/intercept columns.
 *
 * Matrices are represented as arrays of arrays (row-major).
 */

function transpose(A) {
  const rows = A.length;
  const cols = A[0].length;
  const T = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      T[j][i] = A[i][j];
    }
  }
  return T;
}

function multiply(A, B) {
  const rowsA = A.length;
  const colsA = A[0].length;
  const colsB = B[0].length;
  const C = Array.from({ length: rowsA }, () => new Array(colsB).fill(0));
  for (let i = 0; i < rowsA; i++) {
    for (let k = 0; k < colsA; k++) {
      const a = A[i][k];
      if (a === 0) continue;
      for (let j = 0; j < colsB; j++) {
        C[i][j] += a * B[k][j];
      }
    }
  }
  return C;
}

function addScaledIdentity(A, lambda) {
  const n = A.length;
  const C = A.map((row) => row.slice());
  for (let i = 0; i < n; i++) C[i][i] += lambda;
  return C;
}

/**
 * Inverts a square matrix via Gauss-Jordan elimination with partial
 * pivoting. Throws if the matrix is singular past a small tolerance.
 */
function invert(A) {
  const n = A.length;
  const M = A.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let maxAbs = Math.abs(M[col][col]);
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > maxAbs) {
        maxAbs = Math.abs(M[r][col]);
        pivotRow = r;
      }
    }
    if (maxAbs < 1e-12) {
      throw new Error('Matrix is singular or near-singular; increase ridge lambda');
    }
    if (pivotRow !== col) {
      [M[col], M[pivotRow]] = [M[pivotRow], M[col]];
    }
    const pivot = M[col][col];
    for (let j = 0; j < 2 * n; j++) M[col][j] /= pivot;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col];
      if (factor === 0) continue;
      for (let j = 0; j < 2 * n; j++) {
        M[r][j] -= factor * M[col][j];
      }
    }
  }

  return M.map((row) => row.slice(n));
}

function matVec(A, v) {
  return A.map((row) => row.reduce((sum, a, j) => sum + a * v[j], 0));
}

module.exports = { transpose, multiply, addScaledIdentity, invert, matVec };
