/**
 * PNEUMA S5 -- Sparse Memory Retrieval Engine
 *
 * CSR (Compressed Sparse Row) matrix construction and operations.
 *
 * CSR stores a sparse matrix using three arrays:
 *   rowPtr[i]..rowPtr[i+1] indexes into colIndices and values for row i.
 *
 * All operations are zero-dependency and work directly on typed arrays
 * for cache-friendly traversal during Forward Push.
 */

import type { CSRMatrix } from '../types/index.js';

/**
 * A single weighted edge for CSR construction.
 */
export interface WeightedEdge {
  source: number;
  target: number;
  weight: number;
}

/**
 * Build a CSR matrix from a list of weighted edges.
 *
 * Duplicate edges (same source, target) are summed.
 *
 * Complexity: O(nnz + numNodes) time and space.
 *
 * @param edges   - Array of {source, target, weight} triples
 * @param numNodes - Number of rows (and columns) in the square matrix
 * @returns A CSRMatrix with rows = cols = numNodes
 */
export function buildCSR(
  edges: WeightedEdge[],
  numNodes: number,
): CSRMatrix {
  // Count non-zeros per row (first pass)
  const rowCounts = new Uint32Array(numNodes);
  for (let i = 0; i < edges.length; i++) {
    rowCounts[edges[i].source]++;
  }

  // Build rowPtr via prefix sum
  const rowPtr = new Uint32Array(numNodes + 1);
  for (let i = 0; i < numNodes; i++) {
    rowPtr[i + 1] = rowPtr[i] + rowCounts[i];
  }
  const nnz = rowPtr[numNodes];

  // Fill colIndices and values using a cursor array
  const colIndices = new Uint32Array(nnz);
  const values = new Float64Array(nnz);
  const cursor = new Uint32Array(numNodes);
  cursor.set(rowPtr.subarray(0, numNodes));

  for (let i = 0; i < edges.length; i++) {
    const { source, target, weight } = edges[i];
    const pos = cursor[source]++;
    colIndices[pos] = target;
    values[pos] = weight;
  }

  // Sort each row by column index and merge duplicates
  for (let r = 0; r < numNodes; r++) {
    const start = rowPtr[r];
    const end = rowPtr[r + 1];
    if (end - start <= 1) continue;
    sortRowSegment(colIndices, values, start, end);
    // Duplicates are merged in-place during sortRowSegment
  }

  return { rows: numNodes, cols: numNodes, rowPtr, colIndices, values };
}

/**
 * Insertion sort a segment of colIndices/values by column index.
 * Merges duplicate column entries by summing their values.
 *
 * We use insertion sort because row segments are typically small
 * (average degree of memory graphs is low).
 *
 * Complexity: O(d^2) where d is the row degree. For typical memory
 * graphs d << 100, so this is faster than a general-purpose sort.
 */
function sortRowSegment(
  cols: Uint32Array,
  vals: Float64Array,
  start: number,
  end: number,
): void {
  for (let i = start + 1; i < end; i++) {
    const col = cols[i];
    const val = vals[i];
    let j = i - 1;
    while (j >= start && cols[j] > col) {
      cols[j + 1] = cols[j];
      vals[j + 1] = vals[j];
      j--;
    }
    cols[j + 1] = col;
    vals[j + 1] = val;
  }
}

/**
 * Extract all (column, value) pairs for a given row.
 *
 * Complexity: O(d) where d is the degree of the row.
 *
 * @param matrix - The CSR matrix
 * @param row    - Row index in [0, matrix.rows)
 * @returns Array of {col, val} pairs for the row
 */
export function getRow(
  matrix: CSRMatrix,
  row: number,
): Array<{ col: number; val: number }> {
  if (row < 0 || row >= matrix.rows) return [];
  const start = matrix.rowPtr[row];
  const end = matrix.rowPtr[row + 1];
  const result: Array<{ col: number; val: number }> = new Array(end - start);
  for (let i = start; i < end; i++) {
    result[i - start] = { col: matrix.colIndices[i], val: matrix.values[i] };
  }
  return result;
}

/**
 * Compute the transpose of a CSR matrix.
 *
 * Given A stored in CSR, returns A^T in CSR.
 * Used to build the reverse adjacency for backward push operations.
 *
 * Complexity: O(nnz + n) time and space.
 *
 * @param matrix - The input CSR matrix
 * @returns The transposed CSR matrix
 */
export function transpose(matrix: CSRMatrix): CSRMatrix {
  const { rows, cols, rowPtr, colIndices, values } = matrix;
  const nnz = rowPtr[rows];

  // Count entries per column (= row counts of transpose)
  const tRowCounts = new Uint32Array(cols);
  for (let i = 0; i < nnz; i++) {
    tRowCounts[colIndices[i]]++;
  }

  // Build transpose rowPtr
  const tRowPtr = new Uint32Array(cols + 1);
  for (let j = 0; j < cols; j++) {
    tRowPtr[j + 1] = tRowPtr[j] + tRowCounts[j];
  }

  // Fill transpose colIndices and values
  const tColIndices = new Uint32Array(nnz);
  const tValues = new Float64Array(nnz);
  const cursor = new Uint32Array(cols);
  cursor.set(tRowPtr.subarray(0, cols));

  for (let r = 0; r < rows; r++) {
    const rStart = rowPtr[r];
    const rEnd = rowPtr[r + 1];
    for (let i = rStart; i < rEnd; i++) {
      const c = colIndices[i];
      const pos = cursor[c]++;
      tColIndices[pos] = r;
      tValues[pos] = values[i];
    }
  }

  return {
    rows: cols,
    cols: rows,
    rowPtr: tRowPtr,
    colIndices: tColIndices,
    values: tValues,
  };
}

/**
 * Normalize each row of a CSR matrix to sum to 1.0 (row-stochastic).
 *
 * Required for PageRank: the transition matrix P must have rows
 * that represent probability distributions over outgoing neighbors.
 *
 * Dangling nodes (zero out-degree) are left with an empty row;
 * the Forward Push algorithm handles them by treating their
 * contribution as teleportation.
 *
 * Complexity: O(nnz + n) time, O(nnz + n) space (returns new matrix).
 *
 * @param matrix - The input CSR matrix
 * @returns A new CSR matrix where each non-empty row sums to 1.0
 */
export function normalizeRows(matrix: CSRMatrix): CSRMatrix {
  const { rows, cols, rowPtr, colIndices, values } = matrix;
  const nnz = rowPtr[rows];

  // Copy colIndices (structure unchanged), normalize values
  const normValues = new Float64Array(nnz);

  for (let r = 0; r < rows; r++) {
    const start = rowPtr[r];
    const end = rowPtr[r + 1];
    if (start === end) continue; // dangling node

    // Compute row sum
    let rowSum = 0;
    for (let i = start; i < end; i++) {
      rowSum += values[i];
    }

    if (rowSum === 0) continue;

    // Normalize
    const invSum = 1.0 / rowSum;
    for (let i = start; i < end; i++) {
      normValues[i] = values[i] * invSum;
    }
  }

  return {
    rows,
    cols,
    rowPtr: new Uint32Array(rowPtr),
    colIndices: new Uint32Array(colIndices),
    values: normValues,
  };
}

/**
 * Get the out-degree of a specific row (number of non-zero entries).
 *
 * Complexity: O(1).
 *
 * @param matrix - The CSR matrix
 * @param row    - Row index
 * @returns Number of non-zero entries in the row
 */
export function getRowDegree(matrix: CSRMatrix, row: number): number {
  if (row < 0 || row >= matrix.rows) return 0;
  return matrix.rowPtr[row + 1] - matrix.rowPtr[row];
}
