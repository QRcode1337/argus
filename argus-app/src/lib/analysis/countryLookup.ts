export interface CountryInfo {
  iso: string;
  name: string;
  centroid: [number, number]; // [lat, lon]
  bbox: [number, number, number, number]; // [minLat, minLon, maxLat, maxLon]
  region: string;
}

export const COUNTRIES: CountryInfo[] = [
  { iso: "US", name: "United States", centroid: [39.8, -98.5], bbox: [24.5, -125.0, 49.4, -66.9], region: "NORTHCOM" },
  { iso: "RU", name: "Russia", centroid: [61.5, 105.3], bbox: [41.2, 19.6, 81.9, 180.0], region: "EUCOM" },
  { iso: "CN", name: "China", centroid: [35.9, 104.2], bbox: [18.2, 73.5, 53.6, 135.1], region: "INDOPACOM" },
  { iso: "UA", name: "Ukraine", centroid: [48.4, 31.2], bbox: [44.4, 22.1, 52.4, 40.2], region: "EUCOM" },
  { iso: "IR", name: "Iran", centroid: [32.4, 53.7], bbox: [25.1, 44.0, 39.8, 63.3], region: "CENTCOM" },
  { iso: "IQ", name: "Iraq", centroid: [33.2, 43.7], bbox: [29.1, 38.8, 37.4, 48.6], region: "CENTCOM" },
  { iso: "SY", name: "Syria", centroid: [34.8, 39.0], bbox: [32.3, 35.7, 37.3, 42.4], region: "CENTCOM" },
  { iso: "IL", name: "Israel", centroid: [31.0, 34.9], bbox: [29.5, 34.3, 33.3, 35.9], region: "CENTCOM" },
  { iso: "SA", name: "Saudi Arabia", centroid: [23.9, 45.1], bbox: [16.4, 34.5, 32.2, 55.7], region: "CENTCOM" },
  { iso: "KP", name: "North Korea", centroid: [40.3, 127.5], bbox: [37.7, 124.2, 43.0, 130.7], region: "INDOPACOM" },
  { iso: "KR", name: "South Korea", centroid: [35.9, 127.8], bbox: [33.1, 124.6, 38.6, 131.9], region: "INDOPACOM" },
  { iso: "JP", name: "Japan", centroid: [36.2, 138.3], bbox: [24.0, 122.9, 45.5, 153.0], region: "INDOPACOM" },
  { iso: "TW", name: "Taiwan", centroid: [23.7, 121.0], bbox: [21.9, 120.1, 25.3, 122.0], region: "INDOPACOM" },
  { iso: "IN", name: "India", centroid: [20.6, 79.0], bbox: [6.7, 68.2, 35.5, 97.4], region: "INDOPACOM" },
  { iso: "PK", name: "Pakistan", centroid: [30.4, 69.3], bbox: [23.7, 60.9, 37.1, 77.8], region: "CENTCOM" },
  { iso: "AF", name: "Afghanistan", centroid: [33.9, 67.7], bbox: [29.4, 60.5, 38.5, 74.9], region: "CENTCOM" },
  { iso: "GB", name: "United Kingdom", centroid: [55.4, -3.4], bbox: [49.9, -8.2, 60.9, 1.8], region: "EUCOM" },
  { iso: "DE", name: "Germany", centroid: [51.2, 10.5], bbox: [47.3, 5.9, 55.1, 15.0], region: "EUCOM" },
  { iso: "FR", name: "France", centroid: [46.2, 2.2], bbox: [41.3, -5.6, 51.1, 9.6], region: "EUCOM" },
  { iso: "PL", name: "Poland", centroid: [51.9, 19.1], bbox: [49.0, 14.1, 54.8, 24.1], region: "EUCOM" },
  { iso: "TR", name: "Turkey", centroid: [39.9, 32.9], bbox: [36.0, 26.0, 42.1, 44.8], region: "EUCOM" },
  { iso: "EG", name: "Egypt", centroid: [26.8, 30.8], bbox: [22.0, 25.0, 31.7, 36.9], region: "CENTCOM" },
  { iso: "NG", name: "Nigeria", centroid: [9.1, 8.7], bbox: [4.3, 2.7, 13.9, 14.7], region: "AFRICOM" },
  { iso: "ZA", name: "South Africa", centroid: [-30.6, 22.9], bbox: [-34.8, 16.5, -22.1, 33.0], region: "AFRICOM" },
  { iso: "ET", name: "Ethiopia", centroid: [9.1, 40.5], bbox: [3.4, 33.0, 14.9, 48.0], region: "AFRICOM" },
  { iso: "SD", name: "Sudan", centroid: [12.9, 30.2], bbox: [8.7, 21.8, 22.2, 38.6], region: "AFRICOM" },
  { iso: "BR", name: "Brazil", centroid: [-14.2, -51.9], bbox: [-33.8, -73.9, 5.3, -34.8], region: "SOUTHCOM" },
  { iso: "MX", name: "Mexico", centroid: [23.6, -102.6], bbox: [14.5, -118.4, 32.7, -86.7], region: "NORTHCOM" },
  { iso: "VE", name: "Venezuela", centroid: [6.4, -66.6], bbox: [0.6, -73.4, 12.2, -59.8], region: "SOUTHCOM" },
  { iso: "CO", name: "Colombia", centroid: [4.6, -74.3], bbox: [-4.2, -79.0, 13.4, -66.9], region: "SOUTHCOM" },
  { iso: "AU", name: "Australia", centroid: [-25.3, 133.8], bbox: [-43.6, 113.2, -10.1, 153.6], region: "INDOPACOM" },
  { iso: "PH", name: "Philippines", centroid: [12.9, 121.8], bbox: [4.6, 116.9, 21.1, 126.6], region: "INDOPACOM" },
  { iso: "ID", name: "Indonesia", centroid: [-0.8, 113.9], bbox: [-11.0, 95.0, 6.1, 141.0], region: "INDOPACOM" },
  { iso: "MY", name: "Malaysia", centroid: [4.2, 101.9], bbox: [0.9, 99.6, 7.4, 119.3], region: "INDOPACOM" },
  { iso: "MM", name: "Myanmar", centroid: [21.9, 96.0], bbox: [9.8, 92.2, 28.5, 101.2], region: "INDOPACOM" },
  { iso: "YE", name: "Yemen", centroid: [15.6, 48.5], bbox: [12.1, 42.6, 19.0, 54.5], region: "CENTCOM" },
  { iso: "LY", name: "Libya", centroid: [26.3, 17.2], bbox: [19.5, 9.3, 33.2, 25.2], region: "AFRICOM" },
  { iso: "SO", name: "Somalia", centroid: [5.2, 46.2], bbox: [-1.7, 40.9, 12.0, 51.4], region: "AFRICOM" },
  { iso: "CD", name: "DR Congo", centroid: [-4.0, 21.8], bbox: [-13.5, 12.2, 5.4, 31.3], region: "AFRICOM" },
  { iso: "RO", name: "Romania", centroid: [45.9, 25.0], bbox: [43.6, 20.3, 48.3, 29.7], region: "EUCOM" },
  { iso: "NO", name: "Norway", centroid: [60.5, 8.5], bbox: [58.0, 4.6, 71.2, 31.1], region: "EUCOM" },
  { iso: "SE", name: "Sweden", centroid: [60.1, 18.6], bbox: [55.3, 11.1, 69.1, 24.2], region: "EUCOM" },
  { iso: "FI", name: "Finland", centroid: [61.9, 25.7], bbox: [59.8, 20.6, 70.1, 31.6], region: "EUCOM" },
  { iso: "LB", name: "Lebanon", centroid: [33.9, 35.9], bbox: [33.1, 35.1, 34.7, 36.6], region: "CENTCOM" },
  { iso: "JO", name: "Jordan", centroid: [30.6, 36.2], bbox: [29.2, 34.9, 33.4, 39.3], region: "CENTCOM" },
  { iso: "AE", name: "UAE", centroid: [23.4, 53.8], bbox: [22.6, 51.6, 26.1, 56.4], region: "CENTCOM" },
  { iso: "KE", name: "Kenya", centroid: [-0.0, 38.0], bbox: [-4.7, 33.9, 5.0, 41.9], region: "AFRICOM" },
];

export function latLonToCountry(lat: number, lon: number): string | null {
  for (const c of COUNTRIES) {
    if (lat >= c.bbox[0] && lat <= c.bbox[2] && lon >= c.bbox[1] && lon <= c.bbox[3]) {
      return c.iso;
    }
  }
  return null;
}

export function latLonToRegion(lat: number, lon: number): string {
  for (const c of COUNTRIES) {
    if (lat >= c.bbox[0] && lat <= c.bbox[2] && lon >= c.bbox[1] && lon <= c.bbox[3]) {
      return c.region;
    }
  }
  return "GLOBAL";
}

export function getCountry(iso: string): CountryInfo | undefined {
  return COUNTRIES.find((c) => c.iso === iso);
}
