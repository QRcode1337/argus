/**
 * PNEUMA S1 -- Phi Approximation Engine
 *
 * Computes Integrated Information Theory (IIT) Phi approximations
 * using three methods of increasing fidelity:
 *
 *   1. phi_ar   (Autoregressive): Fit a VAR(1) model on state traces,
 *               measure information loss under the Minimum Information
 *               Partition via log-determinant of covariance matrices.
 *
 *   2. phi_id   (Information Decomposition): Enumerate bipartitions of
 *               the state space, compute mutual information for each,
 *               and find the partition that minimizes integrated info.
 *
 *   3. compression (Normalized Compression Distance): Use lossless
 *               compression ratio as a proxy for information integration.
 *
 * Mathematical conventions:
 *   X_t          -- state vector at time t (column of stateTrace)
 *   Sigma        -- covariance matrix
 *   I(X;Y)       -- mutual information
 *   H(X)         -- differential entropy
 *   NCD(x,y)     -- Normalized Compression Distance
 *   MIP          -- Minimum Information Partition
 *
 * No external dependencies -- uses Node.js zlib for compression.
 */

import { deflateSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import type { PhiScore } from '../types/index.js';

// ---------------------------------------------------------------------------
// Utility: linear algebra on flat Float64Arrays (column-major)
// ---------------------------------------------------------------------------

/**
 * Compute the covariance matrix of a set of observation vectors.
 *
 * @param data - Array of observation vectors (each Float64Array of length d).
 * @returns Flat Float64Array of size d*d representing the covariance matrix
 *          in row-major order.
 *
 * Math:
 *   mu = (1/N) sum_i x_i
 *   Sigma[j][k] = (1/(N-1)) sum_i (x_i[j] - mu[j]) * (x_i[k] - mu[k])
 */
function covarianceMatrix(data: Float64Array[]): { cov: Float64Array; dim: number } {
  const n = data.length;
  const d = data[0].length;

  // Compute mean
  const mu = new Float64Array(d);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < d; j++) {
      mu[j] += data[i][j];
    }
  }
  for (let j = 0; j < d; j++) {
    mu[j] /= n;
  }

  // Compute covariance (row-major d x d)
  const cov = new Float64Array(d * d);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < d; j++) {
      const dj = data[i][j] - mu[j];
      for (let k = j; k < d; k++) {
        const dk = data[i][k] - mu[k];
        cov[j * d + k] += dj * dk;
      }
    }
  }

  const denom = Math.max(n - 1, 1);
  for (let j = 0; j < d; j++) {
    for (let k = j; k < d; k++) {
      cov[j * d + k] /= denom;
      cov[k * d + j] = cov[j * d + k]; // symmetry
    }
  }

  return { cov, dim: d };
}

/**
 * Compute log-determinant of a symmetric positive-definite matrix
 * via Cholesky decomposition.
 *
 * Math:
 *   Sigma = L * L^T
 *   log det(Sigma) = 2 * sum_i log(L[i][i])
 *
 * Falls back to regularization (adding epsilon * I) if the matrix
 * is not positive definite.
 *
 * @param mat - Row-major flat array of size d*d.
 * @param d   - Dimension.
 * @returns log(det(mat))
 */
function logDet(mat: Float64Array, d: number): number {
  // Cholesky decomposition: L stored in-place (lower triangle)
  const L = new Float64Array(d * d);
  const REG = 1e-10; // regularization

  for (let i = 0; i < d; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) {
        sum += L[i * d + k] * L[j * d + k];
      }
      if (i === j) {
        const diag = mat[i * d + i] + REG - sum;
        if (diag <= 0) {
          // Matrix not PD even with regularization -- return -Infinity
          return -Infinity;
        }
        L[i * d + j] = Math.sqrt(diag);
      } else {
        L[i * d + j] = (mat[i * d + j] - sum) / L[j * d + j];
      }
    }
  }

  let logDetVal = 0;
  for (let i = 0; i < d; i++) {
    logDetVal += Math.log(L[i * d + i]);
  }
  return 2 * logDetVal;
}

/**
 * Extract sub-covariance matrix for a subset of indices.
 */
function extractSubCov(cov: Float64Array, d: number, indices: number[]): { sub: Float64Array; subDim: number } {
  const subDim = indices.length;
  const sub = new Float64Array(subDim * subDim);
  for (let i = 0; i < subDim; i++) {
    for (let j = 0; j < subDim; j++) {
      sub[i * subDim + j] = cov[indices[i] * d + indices[j]];
    }
  }
  return { sub, subDim };
}

/**
 * Extract sub-vectors (projection onto a subset of dimensions).
 */
function projectToSubset(data: Float64Array[], indices: number[]): Float64Array[] {
  return data.map((vec) => {
    const sub = new Float64Array(indices.length);
    for (let i = 0; i < indices.length; i++) {
      sub[i] = vec[indices[i]];
    }
    return sub;
  });
}

// ---------------------------------------------------------------------------
// Bipartition enumeration
// ---------------------------------------------------------------------------

/**
 * Generate all non-trivial bipartitions of elements {0, ..., n-1}.
 *
 * A bipartition splits the set into two non-empty subsets (A, B).
 * We enumerate by iterating over all bitmasks 1..(2^n - 2) and
 * taking each bitmask and its complement, deduplicating by
 * requiring bit 0 to always be in partition A.
 *
 * @returns Array of [A_indices, B_indices] tuples.
 */
function enumerateBipartitions(n: number): [number[], number[]][] {
  const partitions: [number[], number[]][] = [];
  const total = 1 << n;

  // Iterate bitmasks where bit 0 is always in A (mask & 1 === 1)
  // to avoid counting each partition twice.
  for (let mask = 1; mask < total - 1; mask += 2) {
    const a: number[] = [];
    const b: number[] = [];
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        a.push(i);
      } else {
        b.push(i);
      }
    }
    if (a.length > 0 && b.length > 0) {
      partitions.push([a, b]);
    }
  }

  return partitions;
}

// ---------------------------------------------------------------------------
// Method 1: phi_ar (Autoregressive / VAR)
// ---------------------------------------------------------------------------

/**
 * Compute Phi via the autoregressive (VAR) method.
 *
 * Fits a first-order Vector Autoregressive model on the state trace
 * and measures information loss under the Minimum Information Partition.
 *
 * Math:
 *   Given state trace X_0, X_1, ..., X_{T-1} with each X_t in R^d:
 *
 *   1. Form past/future pairs: X_past = X_{0..T-2}, X_future = X_{1..T-1}
 *
 *   2. Compute mutual information of the whole system:
 *      I(X_past; X_future) = 0.5 * [log det(Sigma_past) + log det(Sigma_future) - log det(Sigma_joint)]
 *      where Sigma_joint is the covariance of [X_past; X_future] concatenated.
 *
 *   3. For each bipartition (A, B) of dimensions {0..d-1}:
 *      I_partitioned = I(X_past^A; X_future^A) + I(X_past^B; X_future^B)
 *
 *   4. Phi = min over bipartitions of [I_whole - I_partitioned]
 *      The minimizing partition is the MIP.
 *
 * @param stateTrace - Array of state vectors (time series).
 * @param budget     - Max computation time in ms (used for early termination).
 * @returns PhiScore with method 'phi_ar'.
 */
function phiAR(stateTrace: Float64Array[], budget: number): PhiScore {
  const startTime = performance.now();
  const T = stateTrace.length;
  const d = stateTrace[0].length;

  if (T < 3) {
    return makeEmptyScore('phi_ar', d, startTime);
  }

  // Form past and future arrays
  const past = stateTrace.slice(0, T - 1);
  const future = stateTrace.slice(1, T);

  // Concatenate past and future for joint covariance
  const joint = past.map((p, i) => {
    const j = new Float64Array(2 * d);
    j.set(p, 0);
    j.set(future[i], d);
    return j;
  });

  // Compute covariances
  const { cov: covPast, dim: dimPast } = covarianceMatrix(past);
  const { cov: covFuture } = covarianceMatrix(future);
  const { cov: covJoint, dim: dimJoint } = covarianceMatrix(joint);

  // Whole-system mutual information:
  // I(past; future) = 0.5 * [logdet(Sigma_past) + logdet(Sigma_future) - logdet(Sigma_joint)]
  const ldPast = logDet(covPast, dimPast);
  const ldFuture = logDet(covFuture, dimPast);
  const ldJoint = logDet(covJoint, dimJoint);
  const miWhole = 0.5 * (ldPast + ldFuture - ldJoint);

  if (!isFinite(miWhole) || miWhole < 0) {
    return makeEmptyScore('phi_ar', d, startTime);
  }

  // Effective dimensionality for bipartition enumeration
  // Cap at 15 to keep 2^d tractable
  const effectiveD = Math.min(d, 15);

  // If d > effectiveD, we only partition the first effectiveD dimensions
  // and treat the rest as belonging to partition A
  const bipartitions = enumerateBipartitions(effectiveD);
  let minExcess = Infinity;
  let mipPartition: [number[], number[]] = [[0], Array.from({ length: effectiveD - 1 }, (_, i) => i + 1)];
  let partitionsEvaluated = 0;

  for (const [a, b] of bipartitions) {
    if (performance.now() - startTime > budget) break;

    // Extend partitions if d > effectiveD
    const fullA = d > effectiveD ? [...a, ...Array.from({ length: d - effectiveD }, (_, i) => effectiveD + i)] : a;
    const fullB = b;

    // MI for partition A
    const pastA = projectToSubset(past, fullA);
    const futureA = projectToSubset(future, fullA);
    const jointA = pastA.map((p, i) => {
      const j = new Float64Array(fullA.length * 2);
      j.set(p, 0);
      j.set(futureA[i], fullA.length);
      return j;
    });
    const covPA = covarianceMatrix(pastA);
    const covFA = covarianceMatrix(futureA);
    const covJA = covarianceMatrix(jointA);
    const miA = 0.5 * (logDet(covPA.cov, covPA.dim) + logDet(covFA.cov, covFA.dim) - logDet(covJA.cov, covJA.dim));

    // MI for partition B
    const pastB = projectToSubset(past, fullB);
    const futureB = projectToSubset(future, fullB);
    const jointB = pastB.map((p, i) => {
      const j = new Float64Array(fullB.length * 2);
      j.set(p, 0);
      j.set(futureB[i], fullB.length);
      return j;
    });
    const covPB = covarianceMatrix(pastB);
    const covFB = covarianceMatrix(futureB);
    const covJB = covarianceMatrix(jointB);
    const miB = 0.5 * (logDet(covPB.cov, covPB.dim) + logDet(covFB.cov, covFB.dim) - logDet(covJB.cov, covJB.dim));

    const miPartitioned = (isFinite(miA) ? Math.max(miA, 0) : 0) + (isFinite(miB) ? Math.max(miB, 0) : 0);
    const excess = miWhole - miPartitioned;

    if (excess < minExcess) {
      minExcess = excess;
      mipPartition = [fullA, fullB];
    }

    partitionsEvaluated++;
  }

  const phi = Math.max(0, isFinite(minExcess) ? minExcess : 0);
  const elapsed = performance.now() - startTime;

  return {
    value: phi,
    method: 'phi_ar',
    confidence: computeConfidence(T, d, partitionsEvaluated, bipartitions.length),
    computeCostMs: elapsed,
    numElements: d,
    numPartitions: partitionsEvaluated,
    computedAt: Date.now(),
    mipPartition,
  };
}

// ---------------------------------------------------------------------------
// Method 2: phi_id (Information Decomposition)
// ---------------------------------------------------------------------------

/**
 * Compute Phi via Information Decomposition.
 *
 * Enumerates all bipartitions of the state space and computes mutual
 * information between the two halves. The Minimum Information Partition
 * (MIP) is the bipartition that minimizes MI, and Phi is the MI at the MIP.
 *
 * Math:
 *   For each bipartition (A, B) of {0, ..., d-1}:
 *
 *   I(A; B) = H(A) + H(B) - H(A, B)
 *
 *   where differential entropy of a multivariate Gaussian is:
 *   H(X) = 0.5 * d * (1 + log(2*pi)) + 0.5 * log det(Sigma_X)
 *
 *   So: I(A; B) = 0.5 * [log det(Sigma_A) + log det(Sigma_B) - log det(Sigma_AB)]
 *
 *   Phi = min over bipartitions I(A; B)
 *
 * Note: This is the most faithful IIT approximation but is exponential
 * in the number of elements. Capped at 15 elements (16384 partitions).
 *
 * @param stateTrace - Array of state vectors (simultaneous observations).
 * @param budget     - Max computation time in ms.
 * @returns PhiScore with method 'phi_id'.
 */
function phiID(stateTrace: Float64Array[], budget: number): PhiScore {
  const startTime = performance.now();
  const T = stateTrace.length;
  const d = stateTrace[0].length;

  if (T < 3 || d < 2) {
    return makeEmptyScore('phi_id', d, startTime);
  }

  const { cov: fullCov, dim: fullDim } = covarianceMatrix(stateTrace);
  const ldFull = logDet(fullCov, fullDim);

  if (!isFinite(ldFull)) {
    return makeEmptyScore('phi_id', d, startTime);
  }

  const effectiveD = Math.min(d, 15);
  const bipartitions = enumerateBipartitions(effectiveD);

  let minMI = Infinity;
  let mipPartition: [number[], number[]] = [[0], Array.from({ length: effectiveD - 1 }, (_, i) => i + 1)];
  let partitionsEvaluated = 0;

  for (const [a, b] of bipartitions) {
    if (performance.now() - startTime > budget) break;

    // Extract sub-covariance for A and B directly from the full covariance
    const { sub: covA, subDim: dA } = extractSubCov(fullCov, fullDim, a);
    const { sub: covB, subDim: dB } = extractSubCov(fullCov, fullDim, b);

    const ldA = logDet(covA, dA);
    const ldB = logDet(covB, dB);

    // I(A; B) = 0.5 * [log det(Sigma_A) + log det(Sigma_B) - log det(Sigma_AB)]
    // Sigma_AB is the full covariance restricted to dimensions in A union B.
    // Since A union B = {0..effectiveD-1}, Sigma_AB ~ fullCov (for effectiveD dimensions).
    const allIndices = [...a, ...b].sort((x, y) => x - y);
    const { sub: covAB, subDim: dAB } = extractSubCov(fullCov, fullDim, allIndices);
    const ldAB = logDet(covAB, dAB);

    const mi = 0.5 * (ldA + ldB - ldAB);

    if (isFinite(mi) && mi < minMI) {
      minMI = mi;
      mipPartition = [a, b];
    }

    partitionsEvaluated++;
  }

  const phi = Math.max(0, isFinite(minMI) ? minMI : 0);
  const elapsed = performance.now() - startTime;

  return {
    value: phi,
    method: 'phi_id',
    confidence: computeConfidence(T, d, partitionsEvaluated, bipartitions.length),
    computeCostMs: elapsed,
    numElements: d,
    numPartitions: partitionsEvaluated,
    computedAt: Date.now(),
    mipPartition,
  };
}

// ---------------------------------------------------------------------------
// Method 3: compression (Normalized Compression Distance)
// ---------------------------------------------------------------------------

/**
 * Compute Phi via Normalized Compression Distance (NCD).
 *
 * Uses lossless compression (deflate) as a proxy for Kolmogorov complexity.
 * Information integration is estimated by how much compressing two subsystem
 * state traces together beats compressing them individually.
 *
 * Math:
 *   For byte-serialized state traces x and y:
 *
 *   C(x)  = length of deflate(x)
 *   C(y)  = length of deflate(y)
 *   C(xy) = length of deflate(concat(x, y))
 *
 *   NCD(x, y) = [C(xy) - min(C(x), C(y))] / max(C(x), C(y))
 *
 *   NCD in [0, 1]:
 *     0 = maximally integrated (perfect redundancy)
 *     1 = maximally independent (no shared information)
 *
 *   Phi_compression = 1 - min over bipartitions NCD(A, B)
 *
 *   Higher Phi = lower NCD = more integration.
 *
 * This is the cheapest method and works for arbitrary state representations.
 *
 * @param stateTrace - Array of state vectors.
 * @param budget     - Max computation time in ms.
 * @returns PhiScore with method 'compression'.
 */
function phiCompression(stateTrace: Float64Array[], budget: number): PhiScore {
  const startTime = performance.now();
  const T = stateTrace.length;
  const d = stateTrace[0].length;

  if (T < 2 || d < 2) {
    return makeEmptyScore('compression', d, startTime);
  }

  const effectiveD = Math.min(d, 15);
  const bipartitions = enumerateBipartitions(effectiveD);

  let minNCD = Infinity;
  let mipPartition: [number[], number[]] = [[0], Array.from({ length: effectiveD - 1 }, (_, i) => i + 1)];
  let partitionsEvaluated = 0;

  for (const [a, b] of bipartitions) {
    if (performance.now() - startTime > budget) break;

    const bytesA = serializeSubsystem(stateTrace, a);
    const bytesB = serializeSubsystem(stateTrace, b);
    const bytesAB = Buffer.concat([bytesA, bytesB]);

    const cA = compressedLength(bytesA);
    const cB = compressedLength(bytesB);
    const cAB = compressedLength(bytesAB);

    const ncd = (cAB - Math.min(cA, cB)) / Math.max(cA, cB);

    if (ncd < minNCD) {
      minNCD = ncd;
      mipPartition = [a, b];
    }

    partitionsEvaluated++;
  }

  // Phi = 1 - NCD: higher integration -> higher Phi
  const phi = Math.max(0, isFinite(minNCD) ? 1 - minNCD : 0);
  const elapsed = performance.now() - startTime;

  return {
    value: phi,
    method: 'compression',
    confidence: computeConfidence(T, d, partitionsEvaluated, bipartitions.length),
    computeCostMs: elapsed,
    numElements: d,
    numPartitions: partitionsEvaluated,
    computedAt: Date.now(),
    mipPartition,
  };
}

/**
 * Serialize a subsystem's state trace to a byte buffer.
 * Writes Float64 values for the selected dimensions across all timesteps.
 */
function serializeSubsystem(stateTrace: Float64Array[], indices: number[]): Buffer {
  const T = stateTrace.length;
  const subD = indices.length;
  const buf = Buffer.allocUnsafe(T * subD * 8);
  let offset = 0;

  for (let t = 0; t < T; t++) {
    for (let i = 0; i < subD; i++) {
      buf.writeDoubleBE(stateTrace[t][indices[i]], offset);
      offset += 8;
    }
  }

  return buf;
}

/**
 * Compute the compressed length of a buffer using deflate (zlib level 6).
 */
function compressedLength(data: Buffer): number {
  return deflateSync(data, { level: 6 }).length;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Compute a confidence score for the Phi approximation based on
 * sample size, dimensionality, and partition coverage.
 *
 * Confidence increases with more samples relative to dimensions
 * and higher partition coverage.
 */
function computeConfidence(
  T: number,
  d: number,
  partitionsEvaluated: number,
  totalPartitions: number,
): number {
  // Sample adequacy: need at least d+1 samples for covariance to be full-rank
  const sampleAdequacy = Math.min(1, (T - 1) / (2 * d));

  // Partition coverage: what fraction of bipartitions were actually evaluated
  const coverage = totalPartitions > 0 ? partitionsEvaluated / totalPartitions : 0;

  // Combined confidence
  return Math.min(1, sampleAdequacy * 0.6 + coverage * 0.4);
}

/**
 * Create a zero-valued PhiScore when computation cannot proceed.
 */
function makeEmptyScore(method: PhiScore['method'], numElements: number, startTime: number): PhiScore {
  return {
    value: 0,
    method,
    confidence: 0,
    computeCostMs: performance.now() - startTime,
    numElements,
    numPartitions: 0,
    computedAt: Date.now(),
    mipPartition: [[], []],
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute Phi (integrated information) for a state trace using the
 * specified approximation method.
 *
 * @param state  - Time series of system state vectors. Each Float64Array
 *                 represents the system state at one timestep. All vectors
 *                 must have the same length d (the number of system elements).
 * @param method - Which approximation algorithm to use:
 *                   'phi_ar'      -- Autoregressive (VAR). O(2^d * d^3 * T). Best balance.
 *                   'phi_id'      -- Information Decomposition. O(2^d * d^3). Most faithful.
 *                   'compression' -- NCD via deflate. O(2^d * T * d). Cheapest per partition.
 * @param budget - Maximum wall-clock milliseconds to spend. Methods will
 *                 terminate early if the budget is exhausted, returning a
 *                 partial result with reduced confidence.
 * @returns A PhiScore with the computed value, confidence, MIP, and cost.
 */
export function computePhi(
  state: Float64Array[],
  method: PhiScore['method'],
  budget: number,
): PhiScore {
  if (state.length === 0 || state[0].length === 0) {
    return makeEmptyScore(method, 0, performance.now());
  }

  // Validate all vectors have the same dimensionality
  const d = state[0].length;
  for (let i = 1; i < state.length; i++) {
    if (state[i].length !== d) {
      throw new Error(
        `State trace dimension mismatch: vector 0 has length ${d}, ` +
        `vector ${i} has length ${state[i].length}`,
      );
    }
  }

  switch (method) {
    case 'phi_ar':
      return phiAR(state, budget);
    case 'phi_id':
      return phiID(state, budget);
    case 'compression':
      return phiCompression(state, budget);
    default:
      throw new Error(`Unsupported Phi method: ${method as string}. Use 'phi_ar', 'phi_id', or 'compression'.`);
  }
}

export { phiAR, phiID, phiCompression };
