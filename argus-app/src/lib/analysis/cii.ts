import { baselines } from "./baselines";
import { COUNTRIES, latLonToCountry } from "./countryLookup";

export interface CiiScore {
  score: number;
  signals: Record<string, number>;
  updatedAt: number;
}

interface CiiInputs {
  gdeltEvents: Array<{ lat: number; lon: number; goldsteinScale: number; avgTone: number }>;
  militaryFlights: Array<{ latitude: number; longitude: number }>;
  seismicEvents: Array<{ latitude: number; longitude: number; magnitude: number }>;
  threatPulses: Array<{ targetedCountry?: string; lat?: number; lon?: number }>;
  outages: Array<{ location?: string; lat?: number; lon?: number; severity?: number }>;
  fredIndicators: Record<string, number>;
}

const WEIGHTS = {
  gdelt: 0.40,
  military: 0.15,
  economic: 0.15,
  cyber: 0.10,
  outages: 0.10,
  seismic: 0.10,
};

function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, v));
}

function normalizeGoldstein(avgGoldstein: number): number {
  return clamp(50 - avgGoldstein * 5);
}

function normalizeTone(avgTone: number): number {
  return clamp(50 - avgTone * 5);
}

export function computeCii(inputs: CiiInputs): Record<string, CiiScore> {
  const scores: Record<string, CiiScore> = {};

  const gdeltByCountry = new Map<string, { goldsteinSum: number; toneSum: number; count: number }>();
  for (const e of inputs.gdeltEvents) {
    const iso = latLonToCountry(e.lat, e.lon);
    if (!iso) continue;
    const entry = gdeltByCountry.get(iso) ?? { goldsteinSum: 0, toneSum: 0, count: 0 };
    entry.goldsteinSum += e.goldsteinScale;
    entry.toneSum += e.avgTone;
    entry.count++;
    gdeltByCountry.set(iso, entry);
  }

  const milByCountry = new Map<string, number>();
  for (const f of inputs.militaryFlights) {
    const iso = latLonToCountry(f.latitude, f.longitude);
    if (!iso) continue;
    milByCountry.set(iso, (milByCountry.get(iso) ?? 0) + 1);
  }

  const seismicByCountry = new Map<string, number>();
  for (const e of inputs.seismicEvents) {
    const iso = latLonToCountry(e.latitude, e.longitude);
    if (!iso) continue;
    seismicByCountry.set(iso, (seismicByCountry.get(iso) ?? 0) + e.magnitude);
  }

  const cyberByCountry = new Map<string, number>();
  for (const t of inputs.threatPulses) {
    const iso = t.targetedCountry ?? (t.lat != null && t.lon != null ? latLonToCountry(t.lat, t.lon) : null);
    if (!iso) continue;
    cyberByCountry.set(iso, (cyberByCountry.get(iso) ?? 0) + 1);
  }

  const outageByCountry = new Map<string, number>();
  for (const o of inputs.outages) {
    const iso = o.lat != null && o.lon != null ? latLonToCountry(o.lat, o.lon) : null;
    if (!iso) continue;
    outageByCountry.set(iso, (outageByCountry.get(iso) ?? 0) + (o.severity ?? 1));
  }

  for (const country of COUNTRIES) {
    const iso = country.iso;
    const signals: Record<string, number> = {};

    const gdelt = gdeltByCountry.get(iso);
    if (gdelt && gdelt.count > 0) {
      const avgGoldstein = gdelt.goldsteinSum / gdelt.count;
      const avgTone = gdelt.toneSum / gdelt.count;
      signals.gdelt = (normalizeGoldstein(avgGoldstein) + normalizeTone(avgTone)) / 2;
    } else {
      signals.gdelt = 0;
    }

    const milCount = milByCountry.get(iso) ?? 0;
    const baselineKey = `military:${iso}` as const;
    baselines.observe(baselineKey, milCount);
    const milZ = baselines.zScore(baselineKey, milCount);
    signals.military = milZ !== null ? clamp(milZ * 20 + 30) : clamp(milCount * 2);

    signals.economic = inputs.fredIndicators[iso] ?? 0;
    signals.cyber = clamp((cyberByCountry.get(iso) ?? 0) * 10);
    signals.outages = clamp((outageByCountry.get(iso) ?? 0) * 20);
    signals.seismic = clamp((seismicByCountry.get(iso) ?? 0) * 5);

    const score = clamp(
      signals.gdelt * WEIGHTS.gdelt +
      signals.military * WEIGHTS.military +
      signals.economic * WEIGHTS.economic +
      signals.cyber * WEIGHTS.cyber +
      signals.outages * WEIGHTS.outages +
      signals.seismic * WEIGHTS.seismic,
    );

    if (score > 0) {
      scores[iso] = { score, signals, updatedAt: Date.now() };
    }
  }

  return scores;
}
