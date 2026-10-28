import test from "node:test";
import assert from "node:assert/strict";

import { gdeltEventScore } from "../src/lib/gdelt/eventScore.ts";

test("scores a high-severity, widely-reported event higher than a quiet one", () => {
  const severe = gdeltEventScore({
    goldsteinScale: -9,
    numMentions: 40,
    numSources: 10,
    avgTone: -8,
  });
  const quiet = gdeltEventScore({
    goldsteinScale: 1,
    numMentions: 2,
    numSources: 1,
    avgTone: 0.5,
  });

  assert.ok(severe > quiet);
});

test("matches the exact formula used by the strategic digest", () => {
  const score = gdeltEventScore({
    goldsteinScale: -5,
    numMentions: 10,
    numSources: 3,
    avgTone: -4,
  });

  // |−5|*2 + 10*0.6 + 3*0.4 + |−4|*0.2 = 10 + 6 + 1.2 + 0.8 = 18
  assert.equal(score, 18);
});

test("is symmetric for positive and negative Goldstein/tone of equal magnitude", () => {
  const negative = gdeltEventScore({ goldsteinScale: -6, numMentions: 5, numSources: 2, avgTone: -3 });
  const positive = gdeltEventScore({ goldsteinScale: 6, numMentions: 5, numSources: 2, avgTone: 3 });

  assert.equal(negative, positive);
});
