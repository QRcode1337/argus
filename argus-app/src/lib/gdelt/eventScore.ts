export interface ScorableGdeltEvent {
  goldsteinScale: number;
  numMentions: number;
  numSources: number;
  avgTone: number;
}

/**
 * Combined significance score used to rank GDELT events — the same formula
 * that drives the strategic digest's top-events selection, blending
 * severity (Goldstein) and coverage (mentions/sources).
 */
export function gdeltEventScore(event: ScorableGdeltEvent): number {
  return (
    Math.abs(event.goldsteinScale) * 2 +
    event.numMentions * 0.6 +
    event.numSources * 0.4 +
    Math.abs(event.avgTone) * 0.2
  );
}
