// Country name → approximate centroid [lat, lon]
const COUNTRY_COORDS: Record<string, [number, number]> = {
  "Afghanistan": [33.93, 67.71], "Albania": [41.15, 20.17], "Algeria": [28.03, 1.66],
  "Angola": [-11.2, 17.87], "Argentina": [-38.42, -63.62], "Armenia": [40.07, 45.04],
  "Australia": [-25.27, 133.78], "Austria": [47.52, 14.55], "Azerbaijan": [40.14, 47.58],
  "Bahrain": [26.07, 50.55], "Bangladesh": [23.68, 90.36], "Belarus": [53.71, 27.95],
  "Belgium": [50.50, 4.47], "Bolivia": [-16.29, -63.59], "Bosnia and Herzegovina": [43.92, 17.68],
  "Brazil": [-14.24, -51.93], "Bulgaria": [42.73, 25.49], "Cambodia": [12.57, 104.99],
  "Cameroon": [7.37, 12.35], "Canada": [56.13, -106.35], "Chile": [-35.68, -71.54],
  "China": [35.86, 104.20], "Colombia": [4.57, -74.30], "Costa Rica": [9.75, -83.75],
  "Croatia": [45.10, 15.20], "Cuba": [21.52, -77.78], "Cyprus": [35.13, 33.43],
  "Czech Republic": [49.82, 15.47], "Denmark": [56.26, 9.50], "Dominican Republic": [18.74, -70.16],
  "Ecuador": [-1.83, -78.18], "Egypt": [26.82, 30.80], "El Salvador": [13.79, -88.90],
  "Estonia": [58.60, 25.01], "Ethiopia": [9.15, 40.49], "Finland": [61.92, 25.75],
  "France": [46.23, 2.21], "Georgia": [42.32, 43.36], "Germany": [51.17, 10.45],
  "Ghana": [7.95, -1.02], "Greece": [39.07, 21.82], "Guatemala": [15.78, -90.23],
  "Honduras": [15.20, -86.24], "Hungary": [47.16, 19.50], "Iceland": [64.96, -19.02],
  "India": [20.59, 78.96], "Indonesia": [-0.79, 113.92], "Iran": [32.43, 53.69],
  "Iran, Islamic Republic of": [32.43, 53.69],
  "Iraq": [33.22, 43.68], "Ireland": [53.14, -7.69], "Israel": [31.05, 34.85],
  "Italy": [41.87, 12.57], "Jamaica": [18.11, -77.30], "Japan": [36.20, 138.25],
  "Jordan": [30.59, 36.24], "Kazakhstan": [48.02, 66.92], "Kenya": [-0.02, 37.91],
  "Korea, Republic of": [35.91, 127.77], "South Korea": [35.91, 127.77],
  "Korea, Democratic People's Republic of": [40.34, 127.51], "North Korea": [40.34, 127.51],
  "Kuwait": [29.31, 47.48], "Kyrgyzstan": [41.20, 74.77], "Latvia": [56.88, 24.60],
  "Lebanon": [33.85, 35.86], "Libya": [26.34, 17.23], "Lithuania": [55.17, 23.88],
  "Malaysia": [4.21, 101.98], "Mexico": [23.63, -102.55], "Moldova": [47.41, 28.37],
  "Mongolia": [46.86, 103.85], "Montenegro": [42.71, 19.37], "Morocco": [31.79, -7.09],
  "Myanmar": [21.91, 95.96], "Nepal": [28.39, 84.12], "Netherlands": [52.13, 5.29],
  "New Zealand": [-40.90, 174.89], "Nigeria": [9.08, 8.68], "Norway": [60.47, 8.47],
  "Oman": [21.47, 55.98], "Pakistan": [30.38, 69.35], "Palestine": [31.95, 35.23],
  "Panama": [8.54, -80.78], "Paraguay": [-23.44, -58.44], "Peru": [-9.19, -75.02],
  "Philippines": [12.88, 121.77], "Poland": [51.92, 19.15], "Portugal": [39.40, -8.22],
  "Qatar": [25.35, 51.18], "Romania": [45.94, 24.97], "Russia": [61.52, 105.32],
  "Russian Federation": [61.52, 105.32],
  "Saudi Arabia": [23.89, 45.08], "Serbia": [44.02, 21.01], "Singapore": [1.35, 103.82],
  "Slovakia": [48.67, 19.70], "Slovenia": [46.15, 14.99], "Somalia": [5.15, 46.20],
  "South Africa": [-30.56, 22.94], "Spain": [40.46, -3.75], "Sri Lanka": [7.87, 80.77],
  "Sudan": [12.86, 30.22], "Sweden": [60.13, 18.64], "Switzerland": [46.82, 8.23],
  "Syria": [34.80, 38.99], "Syrian Arab Republic": [34.80, 38.99],
  "Taiwan": [23.70, 120.96], "Taiwan, Province of China": [23.70, 120.96],
  "Tajikistan": [38.86, 71.28], "Tanzania": [-6.37, 34.89],
  "Tanzania, United Republic of": [-6.37, 34.89],
  "Thailand": [15.87, 100.99], "Tunisia": [33.89, 9.54], "Turkey": [38.96, 35.24],
  "Turkmenistan": [38.97, 59.56], "Uganda": [1.37, 32.29], "Ukraine": [48.38, 31.17],
  "United Arab Emirates": [23.42, 53.85], "United Kingdom": [55.38, -3.44],
  "United States": [37.09, -95.71], "United States of America": [37.09, -95.71],
  "Uruguay": [-32.52, -55.77], "Uzbekistan": [41.38, 64.59], "Venezuela": [6.42, -66.59],
  "Viet Nam": [14.06, 108.28], "Vietnam": [14.06, 108.28],
  "Yemen": [15.55, 48.52], "Zambia": [-13.13, 27.85], "Zimbabwe": [-19.02, 29.15],
};

export interface ThreatPulse {
  id: string;
  name: string;
  description: string;
  adversary: string | null;
  malwareFamilies: string[];
  tags: string[];
  industries: string[];
  targetedCountry: string;
  lat: number;
  lon: number;
  created: string;
  modified: string;
  indicatorCount: number;
  tlp: string;
}

interface OtxPulse {
  id: string;
  name: string;
  description: string;
  adversary: string | null;
  malware_families: string[];
  tags: string[];
  industries: string[];
  targeted_countries: string[];
  created: string;
  modified: string;
  indicators: unknown[];
  tlp: string;
}

export async function fetchThreatPulses(endpoint: string): Promise<ThreatPulse[]> {
  const response = await fetch(endpoint, { cache: "no-store" });
  if (!response.ok) throw new Error(`OTX returned ${response.status}`);

  const data = await response.json();
  const pulses: OtxPulse[] = data?.results ?? [];

  const threats: ThreatPulse[] = [];

  for (const pulse of pulses) {
    const countries = pulse.targeted_countries ?? [];

    if (countries.length === 0) continue; // Can't place on map without target country

    // Create one entity per targeted country
    for (const country of countries) {
      const coords = COUNTRY_COORDS[country];
      if (!coords) continue;

      // Offset slightly to avoid stacking on same country
      const jitter = threats.filter((t) => t.targetedCountry === country).length;
      const lat = coords[0] + jitter * 0.8;
      const lon = coords[1] + jitter * 0.8;

      threats.push({
        id: `${pulse.id}-${country}`,
        name: pulse.name,
        description: pulse.description.slice(0, 300),
        adversary: pulse.adversary || null,
        malwareFamilies: pulse.malware_families ?? [],
        tags: pulse.tags ?? [],
        industries: pulse.industries ?? [],
        targetedCountry: country,
        lat,
        lon,
        created: pulse.created,
        modified: pulse.modified,
        indicatorCount: pulse.indicators?.length ?? 0,
        tlp: pulse.tlp,
      });
    }
  }

  return threats;
}
