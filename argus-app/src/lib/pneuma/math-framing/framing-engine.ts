/**
 * PNEUMA S7 -- Mathematical Framing Engine
 *
 * Classifies mathematical domains from text, selects appropriate
 * notation systems, and generates formal scaffolds (definitions,
 * assumptions, claims, proof sketches) for structured reasoning.
 *
 * The engine operates in three stages:
 *   1. Domain classification: detect which of 11 math domains
 *      the input belongs to via keyword/pattern matching
 *   2. Notation selection: choose latex/unicode/ascii/dirac based
 *      on domain and context
 *   3. Scaffold generation: produce a MathematicalFrame with
 *      formal structure for downstream reasoning
 *
 * Source: psycho-symbolic.ts DomainAdaptationEngine
 */

import type { MathematicalFrame } from '../types/index.js';

// ---------------------------------------------------------------------------
// Domain type (re-exported from MathematicalFrame for convenience)
// ---------------------------------------------------------------------------

type MathDomain = MathematicalFrame['domain'];
type NotationType = MathematicalFrame['notation'];

// ---------------------------------------------------------------------------
// Domain classification
// ---------------------------------------------------------------------------

/**
 * Keyword patterns for each mathematical domain.
 *
 * Each entry maps a domain to an array of regex patterns that
 * indicate the domain. Patterns are checked case-insensitively.
 * The domain with the most matching patterns wins.
 */
const DOMAIN_PATTERNS: Array<{ domain: MathDomain; patterns: RegExp[] }> = [
  {
    domain: 'linear_algebra',
    patterns: [
      /\bmatrix\b/i, /\bmatrices\b/i, /\beigen(value|vector)\b/i,
      /\bdeterminant\b/i, /\bvector\s*space\b/i, /\blinear\s*(map|transform)/i,
      /\brank\b/i, /\bnull\s*space\b/i, /\bkernel\b/i, /\bbasis\b/i,
      /\bspan\b/i, /\borthogonal\b/i, /\bunitary\b/i, /\bSVD\b/,
      /\bdiagonal(iz|is)/i, /\btensor\b/i, /\binverse\b/i,
    ],
  },
  {
    domain: 'calculus',
    patterns: [
      /\bderivative\b/i, /\bintegral\b/i, /\bdifferenti(al|ate)\b/i,
      /\blimit\b/i, /\bcontinuous\b/i, /\bconverg(e|ence)\b/i,
      /\bTaylor\b/i, /\bFourier\b/i, /\bLaplace\b/i,
      /\bgradient\b/i, /\bdivergence\b/i, /\bcurl\b/i,
      /\bStokes\b/i, /\bGreen'?s\b/i, /\bpartial\b/i,
    ],
  },
  {
    domain: 'probability',
    patterns: [
      /\bprobabil(ity|istic)\b/i, /\brandom\s*variable\b/i,
      /\bexpect(ation|ed\s*value)\b/i, /\bvariance\b/i,
      /\bBayes(ian)?\b/i, /\bdistribution\b/i, /\bMarkov\b/i,
      /\bstochastic\b/i, /\bsample\b/i, /\blikelihood\b/i,
      /\bpoisson\b/i, /\bgaussian\b/i, /\bnormal\s*distribution\b/i,
      /\bmonte\s*carlo\b/i, /\bconditional\b/i,
    ],
  },
  {
    domain: 'topology',
    patterns: [
      /\btopolog(y|ical)\b/i, /\bhomeomorphi(sm|c)\b/i,
      /\bopen\s*set\b/i, /\bclosed\s*set\b/i, /\bcompact(ness)?\b/i,
      /\bconnected(ness)?\b/i, /\bcontinuous\s*map\b/i,
      /\bmanifold\b/i, /\bhomotop(y|ic)\b/i, /\bfundamental\s*group\b/i,
      /\bEuler\s*characteristic\b/i, /\bsimplex\b/i,
    ],
  },
  {
    domain: 'number_theory',
    patterns: [
      /\bprime\b/i, /\bdivisib(le|ility)\b/i, /\bmodular\b/i,
      /\bcongruence\b/i, /\bdiophantine\b/i, /\bGCD\b/i,
      /\bLCM\b/i, /\bfactori(ze|zation)\b/i, /\bFermat\b/i,
      /\bEuler'?s\s*(totient|phi)\b/i, /\bRSA\b/i,
      /\bresidue\b/i, /\bquadratic\s*reciprocity\b/i,
    ],
  },
  {
    domain: 'optimization',
    patterns: [
      /\boptimiz(e|ation)\b/i, /\bminimi(ze|zation)\b/i,
      /\bmaximiz(e|ation)\b/i, /\bconvex\b/i, /\bconcave\b/i,
      /\blagrang(e|ian)\b/i, /\bKKT\b/i, /\bconstraint\b/i,
      /\blinear\s*program/i, /\bgradient\s*descent\b/i,
      /\bobjective\s*function\b/i, /\bsimplex\s*method\b/i,
      /\bdual(ity)?\b/i, /\bfeasib(le|ility)\b/i,
    ],
  },
  {
    domain: 'graph_theory',
    patterns: [
      /\bgraph\s*theor/i, /\bvertex\b/i, /\bvertices\b/i,
      /\bedge\b/i, /\badjacen(cy|t)\b/i, /\bpath\b/i,
      /\bcycle\b/i, /\btree\b/i, /\bplanar\b/i,
      /\bchromatic\b/i, /\bclique\b/i, /\bbipartite\b/i,
      /\bflow\s*network\b/i, /\bPageRank\b/i, /\bspanning\b/i,
    ],
  },
  {
    domain: 'information_theory',
    patterns: [
      /\bentropy\b/i, /\bmutual\s*information\b/i,
      /\bShannon\b/i, /\bchannel\s*capacity\b/i,
      /\bKL\s*divergence\b/i, /\bcoding\s*theor/i,
      /\bcompress(ion|ible)\b/i, /\bbit(s)?\b/i,
      /\binformation\s*gain\b/i, /\bcross[-\s]entropy\b/i,
    ],
  },
  {
    domain: 'dynamical_systems',
    patterns: [
      /\bdynamical\s*system\b/i, /\battractor\b/i,
      /\bchaos\b/i, /\bchaotic\b/i, /\bLyapunov\b/i,
      /\bbifurcation\b/i, /\bfixed\s*point\b/i,
      /\bphase\s*(space|portrait)\b/i, /\bstability\b/i,
      /\bequilibri(um|a)\b/i, /\bODE\b/, /\bPDE\b/,
      /\bdifferential\s*equation\b/i, /\brecurrence\b/i,
    ],
  },
  {
    domain: 'quantum_mechanics',
    patterns: [
      /\bquantum\b/i, /\bwave\s*function\b/i, /\bSchrodinger\b/i,
      /\bHilbert\s*space\b/i, /\boperator\b/i, /\bHermitian\b/i,
      /\bcommutator\b/i, /\bsuperposition\b/i, /\bentanglement\b/i,
      /\bbra\b/i, /\bket\b/i, /\bDirac\b/i,
      /\bPauli\b/i, /\bBloch\s*sphere\b/i, /\bqubit\b/i,
    ],
  },
  {
    domain: 'category_theory',
    patterns: [
      /\bcategor(y|ical)\s*theor/i, /\bfunctor\b/i,
      /\bnatural\s*transformation\b/i, /\bmorphism\b/i,
      /\bisomorphism\b/i, /\bmonad\b/i, /\badjunction\b/i,
      /\bYoneda\b/i, /\bcolimit\b/i, /\blimit\b/i,
      /\bpullback\b/i, /\bpushout\b/i, /\btopos\b/i,
    ],
  },
];

/**
 * Classify the mathematical domain of input text.
 *
 * Scans the text against keyword patterns for each of the 11
 * mathematical domains. Returns the domain with the highest
 * match count. Ties are broken by declaration order (first listed).
 *
 * Also returns a confidence score based on the ratio of matches
 * to total patterns checked, and identifies semantic clusters
 * (groups of related matched terms).
 *
 * Complexity: O(|text| * |patterns|) for regex matching.
 *
 * @param text - The input text to classify
 * @returns Object with domain, confidence, matched terms, and analogy domains
 */
export function classifyDomain(text: string): {
  domain: MathDomain;
  confidence: number;
  matchedTerms: string[];
  analogyDomains: MathDomain[];
  semanticClusters: string[];
} {
  let bestDomain: MathDomain = 'linear_algebra';
  let bestCount = 0;
  let bestTerms: string[] = [];
  const domainScores: Array<{ domain: MathDomain; count: number }> = [];

  for (const { domain, patterns } of DOMAIN_PATTERNS) {
    let count = 0;
    const terms: string[] = [];

    for (const pattern of patterns) {
      const match = pattern.exec(text);
      if (match) {
        count++;
        terms.push(match[0]);
      }
    }

    domainScores.push({ domain, count });

    if (count > bestCount) {
      bestCount = count;
      bestDomain = domain;
      bestTerms = terms;
    }
  }

  // Confidence: ratio of matches to max possible patterns for that domain
  const maxPatterns = DOMAIN_PATTERNS.find(d => d.domain === bestDomain)?.patterns.length ?? 1;
  const confidence = bestCount > 0 ? Math.min(bestCount / maxPatterns, 1.0) : 0;

  // Analogy domains: other domains with non-zero match counts
  const analogyDomains: MathDomain[] = domainScores
    .filter(d => d.count > 0 && d.domain !== bestDomain)
    .sort((a, b) => b.count - a.count)
    .map(d => d.domain);

  // Semantic clusters: deduplicated matched terms
  const semanticClusters = Array.from(new Set(bestTerms));

  return {
    domain: bestDomain,
    confidence,
    matchedTerms: bestTerms,
    analogyDomains,
    semanticClusters,
  };
}

// ---------------------------------------------------------------------------
// Notation selection
// ---------------------------------------------------------------------------

/**
 * Default notation preference per domain.
 *
 * Quantum mechanics defaults to Dirac notation. Most domains
 * default to LaTeX. Information theory uses Unicode for
 * entropy symbols.
 */
const DOMAIN_NOTATION: Partial<Record<MathDomain, NotationType>> = {
  quantum_mechanics: 'dirac',
  information_theory: 'unicode',
  category_theory: 'unicode',
};

/**
 * Select the best notation type for a given domain.
 *
 * Falls back to LaTeX if no domain-specific preference exists.
 * An explicit override can be provided to force a specific notation.
 *
 * Complexity: O(1).
 *
 * @param domain   - The classified math domain
 * @param override - Optional explicit notation preference
 * @returns The selected notation type
 */
export function selectNotation(
  domain: MathDomain,
  override?: NotationType,
): NotationType {
  if (override) return override;
  return DOMAIN_NOTATION[domain] ?? 'latex';
}

// ---------------------------------------------------------------------------
// Reasoning style selection
// ---------------------------------------------------------------------------

/**
 * Select a reasoning style appropriate for the domain.
 *
 * Complexity: O(1).
 */
function selectReasoningStyle(domain: MathDomain): string {
  switch (domain) {
    case 'linear_algebra': return 'algebraic-constructive';
    case 'calculus': return 'analytic-limit-based';
    case 'probability': return 'probabilistic-bayesian';
    case 'topology': return 'constructive-point-set';
    case 'number_theory': return 'arithmetic-modular';
    case 'optimization': return 'variational-lagrangian';
    case 'graph_theory': return 'combinatorial-structural';
    case 'information_theory': return 'entropic-coding';
    case 'dynamical_systems': return 'qualitative-phase-space';
    case 'quantum_mechanics': return 'operator-algebraic';
    case 'category_theory': return 'abstract-diagrammatic';
    default: return 'deductive';
  }
}

// ---------------------------------------------------------------------------
// Scaffold generation
// ---------------------------------------------------------------------------

/**
 * Domain-specific scaffold templates.
 *
 * Each template provides starter definitions, standard assumptions,
 * claim patterns, and proof sketch outlines appropriate for the domain.
 */
const DOMAIN_SCAFFOLDS: Record<MathDomain, {
  definitions: string[];
  assumptions: string[];
  claims: string[];
  proofSketch: string;
}> = {
  linear_algebra: {
    definitions: [
      'Let V be a vector space over field F.',
      'Let T: V -> W be a linear transformation.',
    ],
    assumptions: [
      'V is finite-dimensional.',
      'F is algebraically closed (for eigenvalue existence).',
    ],
    claims: [
      'T is represented by matrix A in the chosen basis.',
      'The rank-nullity theorem holds: dim(V) = rank(T) + nullity(T).',
    ],
    proofSketch: 'Construct the matrix representation, apply row reduction, and verify dimensions.',
  },
  calculus: {
    definitions: [
      'Let f: R^n -> R be a differentiable function.',
      'Let D denote the domain of definition.',
    ],
    assumptions: [
      'f is continuous on the closed domain.',
      'f is differentiable on the open interior.',
    ],
    claims: [
      'The fundamental theorem of calculus connects differentiation and integration.',
    ],
    proofSketch: 'Apply the epsilon-delta definition of limits, establish continuity, then integrate.',
  },
  probability: {
    definitions: [
      'Let (Omega, F, P) be a probability space.',
      'Let X: Omega -> R be a random variable.',
    ],
    assumptions: [
      'Events are sigma-algebra measurable.',
      'P is a countably additive probability measure.',
    ],
    claims: [
      'E[X] exists and is finite.',
      'By Bayes\' theorem: P(A|B) = P(B|A)*P(A)/P(B).',
    ],
    proofSketch: 'Define the sample space, establish measurability, compute expectations via integration.',
  },
  topology: {
    definitions: [
      'Let (X, tau) be a topological space.',
      'Let f: X -> Y be a continuous map.',
    ],
    assumptions: [
      'X is Hausdorff.',
      'The topology is second-countable.',
    ],
    claims: [
      'The continuous image of a compact set is compact.',
    ],
    proofSketch: 'Take an open cover of f(K), pull back to X, extract a finite subcover, push forward.',
  },
  number_theory: {
    definitions: [
      'Let n, m be positive integers.',
      'Let p denote a prime number.',
    ],
    assumptions: [
      'All integers are non-negative unless stated otherwise.',
      'gcd and lcm are computed over Z.',
    ],
    claims: [
      'By the fundamental theorem of arithmetic, every integer > 1 has a unique prime factorization.',
    ],
    proofSketch: 'Apply the Euclidean algorithm, use modular arithmetic, invoke unique factorization.',
  },
  optimization: {
    definitions: [
      'Let f: R^n -> R be the objective function.',
      'Let C subset R^n be the feasible set.',
    ],
    assumptions: [
      'f is convex (or concave for maximization).',
      'C is a convex set.',
    ],
    claims: [
      'Any local minimum of a convex function over a convex set is a global minimum.',
    ],
    proofSketch: 'Form the Lagrangian, derive KKT conditions, verify complementary slackness.',
  },
  graph_theory: {
    definitions: [
      'Let G = (V, E) be a graph with vertex set V and edge set E.',
      'Let d(v) denote the degree of vertex v.',
    ],
    assumptions: [
      'G is finite and simple (no self-loops or multi-edges).',
    ],
    claims: [
      'The sum of all vertex degrees equals twice the number of edges.',
    ],
    proofSketch: 'Count edge-vertex incidences in two ways (handshake lemma argument).',
  },
  information_theory: {
    definitions: [
      'Let X be a discrete random variable with distribution p.',
      'H(X) = -sum_x p(x) log p(x) is the Shannon entropy.',
    ],
    assumptions: [
      'Logarithms are base 2 (measuring in bits).',
      'p(x) > 0 for all x in the support.',
    ],
    claims: [
      'H(X) >= 0 with equality iff X is deterministic.',
      'H(X) <= log|X| with equality iff X is uniform.',
    ],
    proofSketch: 'Apply Jensen\'s inequality to the concave function -x*log(x).',
  },
  dynamical_systems: {
    definitions: [
      'Let x\' = f(x) be an autonomous ODE on R^n.',
      'Let phi_t denote the flow map.',
    ],
    assumptions: [
      'f is Lipschitz continuous (ensuring unique solutions).',
      'The system is autonomous (f does not depend on t).',
    ],
    claims: [
      'Fixed points satisfy f(x*) = 0.',
      'Stability is determined by the eigenvalues of Df(x*).',
    ],
    proofSketch: 'Linearize around the fixed point, compute the Jacobian, analyze eigenvalue signs.',
  },
  quantum_mechanics: {
    definitions: [
      'Let H be a complex Hilbert space.',
      'Let |psi> in H be a state vector with <psi|psi> = 1.',
    ],
    assumptions: [
      'Observables are Hermitian operators on H.',
      'Measurement outcomes follow the Born rule.',
    ],
    claims: [
      'The expected value of observable A is <psi|A|psi>.',
    ],
    proofSketch: 'Express |psi> in the eigenbasis of A, apply the spectral theorem, compute the trace.',
  },
  category_theory: {
    definitions: [
      'Let C be a category with objects Ob(C) and morphisms Hom(C).',
      'Let F: C -> D be a functor.',
    ],
    assumptions: [
      'C is locally small.',
      'Composition is associative with identity morphisms.',
    ],
    claims: [
      'The Yoneda lemma: Nat(Hom(-, A), F) is naturally isomorphic to F(A).',
    ],
    proofSketch: 'Construct the natural isomorphism explicitly by evaluating at the identity morphism.',
  },
};

/**
 * Generate a MathematicalFrame scaffold for a given domain.
 *
 * Combines domain classification results with a formal scaffold
 * template to produce a complete MathematicalFrame ready for
 * downstream reasoning.
 *
 * Complexity: O(1) -- template lookup and assembly.
 *
 * @param domain            - The classified math domain
 * @param confidence        - Classification confidence
 * @param notation          - Selected notation type
 * @param analogyDomains    - Related domains for cross-domain reasoning
 * @param semanticClusters  - Matched term clusters
 * @returns A complete MathematicalFrame
 */
export function generateScaffold(
  domain: MathDomain,
  confidence: number,
  notation: NotationType,
  analogyDomains: string[],
  semanticClusters: string[],
): MathematicalFrame {
  const scaffold = DOMAIN_SCAFFOLDS[domain];

  return {
    domain,
    notation,
    scaffold: {
      definitions: [...scaffold.definitions],
      assumptions: [...scaffold.assumptions],
      claims: [...scaffold.claims],
      proofSketch: scaffold.proofSketch,
    },
    classificationConfidence: confidence,
    reasoningStyle: selectReasoningStyle(domain),
    analogyDomains,
    semanticClusters,
  };
}

// ---------------------------------------------------------------------------
// Frame application
// ---------------------------------------------------------------------------

/**
 * Apply a MathematicalFrame to a response, injecting notation
 * and structural scaffolding.
 *
 * The frame wraps the response with:
 *   1. Domain header with notation context
 *   2. Definitions and assumptions from the scaffold
 *   3. The original response content
 *   4. Claims and proof sketch as a formal appendix
 *
 * Complexity: O(|response| + |scaffold|).
 *
 * @param response - The raw response text to frame
 * @param frame    - The MathematicalFrame to apply
 * @returns The framed response with mathematical structure
 */
export function applyFrame(response: string, frame: MathematicalFrame): string {
  const parts: string[] = [];

  // Notation marker
  const notationLabel = notationDisplayName(frame.notation);
  parts.push(`[${frame.domain} | ${notationLabel} notation | ${frame.reasoningStyle}]`);
  parts.push('');

  // Definitions
  if (frame.scaffold.definitions.length > 0) {
    parts.push('Definitions:');
    for (const def of frame.scaffold.definitions) {
      parts.push(`  ${applyNotationMarkers(def, frame.notation)}`);
    }
    parts.push('');
  }

  // Assumptions
  if (frame.scaffold.assumptions.length > 0) {
    parts.push('Assumptions:');
    for (const assumption of frame.scaffold.assumptions) {
      parts.push(`  ${assumption}`);
    }
    parts.push('');
  }

  // Main response body
  parts.push(response);

  // Claims (formal appendix)
  if (frame.scaffold.claims.length > 0) {
    parts.push('');
    parts.push('Claims:');
    for (const claim of frame.scaffold.claims) {
      parts.push(`  ${claim}`);
    }
  }

  // Proof sketch
  if (frame.scaffold.proofSketch) {
    parts.push('');
    parts.push(`Proof sketch: ${frame.scaffold.proofSketch}`);
  }

  return parts.join('\n');
}

/**
 * Get the display name for a notation type.
 *
 * Complexity: O(1).
 */
function notationDisplayName(notation: NotationType): string {
  switch (notation) {
    case 'latex': return 'LaTeX';
    case 'unicode': return 'Unicode';
    case 'ascii': return 'ASCII';
    case 'dirac': return 'Dirac';
    default: return notation;
  }
}

/**
 * Apply notation-specific markers to a definition string.
 *
 * For LaTeX: wraps math expressions in $...$.
 * For Dirac: converts ket/bra notation.
 * For ASCII/Unicode: returns as-is.
 *
 * Complexity: O(|text|).
 */
function applyNotationMarkers(text: string, notation: NotationType): string {
  switch (notation) {
    case 'latex':
      // Wrap standalone math-like tokens in inline LaTeX delimiters
      return text.replace(/\b([A-Z])\s*:\s*([A-Z])\s*->\s*([A-Z])\b/g, '$$$1: $2 \\to $3$$');
    case 'dirac':
      // Convert |x> to Dirac ket notation marker
      return text
        .replace(/\|(\w+)>/g, '|$1⟩')
        .replace(/<(\w+)\|/g, '⟨$1|');
    case 'unicode':
      return text
        .replace(/->/g, '→')
        .replace(/=>/g, '⇒')
        .replace(/subset/g, '⊂')
        .replace(/sum_/g, '∑')
        .replace(/prod_/g, '∏');
    case 'ascii':
    default:
      return text;
  }
}

// ---------------------------------------------------------------------------
// High-level API
// ---------------------------------------------------------------------------

/**
 * Create a MathematicalFrame from input text.
 *
 * This is the main entry point: classifies the domain, selects
 * notation, and generates a scaffold in one call.
 *
 * Complexity: O(|text| * |patterns|).
 *
 * @param text              - Input text to analyze
 * @param notationOverride  - Optional forced notation type
 * @returns A complete MathematicalFrame
 */
export function createFrame(
  text: string,
  notationOverride?: NotationType,
): MathematicalFrame {
  const classification = classifyDomain(text);
  const notation = selectNotation(classification.domain, notationOverride);

  return generateScaffold(
    classification.domain,
    classification.confidence,
    notation,
    classification.analogyDomains,
    classification.semanticClusters,
  );
}

/**
 * Classify and frame a response in one step.
 *
 * Combines domain classification, scaffold generation, and frame
 * application into a single convenience function.
 *
 * Complexity: O(|inputText| * |patterns| + |response| + |scaffold|).
 *
 * @param inputText         - The input that prompted the response
 * @param response          - The response to frame
 * @param notationOverride  - Optional forced notation type
 * @returns Object with the frame and the framed response text
 */
export function classifyAndFrame(
  inputText: string,
  response: string,
  notationOverride?: NotationType,
): { frame: MathematicalFrame; framedResponse: string } {
  const frame = createFrame(inputText, notationOverride);
  const framedResponse = applyFrame(response, frame);
  return { frame, framedResponse };
}
