export interface LiveFeedItem {
  id: string;
  title: string;
  region: string;
  category: "City" | "Landmark" | "Nature" | "Space";
  streamUrl: string;
  sourceUrl?: string;
  lat?: number;
  lon?: number;
}

export const LIVE_FEEDS: LiveFeedItem[] = [
  {
    id: "iss-1",
    title: "ISS Live Feed",
    region: "Low Earth Orbit",
    category: "Space",
    streamUrl: "https://www.youtube.com/embed/zPH5KtjJFaQ?autoplay=1&rel=0",
    sourceUrl: "https://www.nasa.gov/international-space-station/",
  },
  {
    id: "iss-2",
    title: "ISS Earth View",
    region: "Low Earth Orbit",
    category: "Space",
    streamUrl: "https://www.youtube.com/embed/fO9e9jnhYK8?autoplay=1&rel=0",
    sourceUrl: "https://www.nasa.gov/international-space-station/",
  },
  {
    id: "shibuya",
    title: "Shibuya Crossing Live",
    region: "Tokyo, Japan",
    category: "City",
    streamUrl: "https://www.youtube.com/embed/dfVK7ld38Ys?autoplay=1&rel=0",
    sourceUrl: "https://www.youtube.com/@ANNnewsCH",
    lat: 35.6595,
    lon: 139.7004,
  },
  {
    id: "shibuya-sky",
    title: "Shibuya Sky View",
    region: "Tokyo, Japan",
    category: "City",
    streamUrl: "https://www.youtube.com/embed/3Q5wZeTuttw?autoplay=1&rel=0",
    sourceUrl: "https://www.youtube.com/@shibuyasky7253",
    lat: 35.6585,
    lon: 139.7013,
  },
  {
    id: "tel-aviv",
    title: "Tel Aviv Live",
    region: "Tel Aviv, Israel",
    category: "City",
    streamUrl: "https://www.youtube.com/embed/SAdzW1Ptung?autoplay=1&rel=0",
    sourceUrl: "https://www.youtube.com/",
    lat: 32.0853,
    lon: 34.7818,
  },
  {
    id: "giza",
    title: "Pyramids of Giza & Sphinx",
    region: "Giza, Egypt",
    category: "Landmark",
    streamUrl: "https://www.youtube.com/embed/EaQr917lRgI?autoplay=1&rel=0",
    sourceUrl: "https://www.youtube.com/",
    lat: 29.9792,
    lon: 31.1342,
  },
  {
    id: "yellowstone",
    title: "Old Faithful Geyser",
    region: "Yellowstone, United States",
    category: "Nature",
    streamUrl: "https://www.youtube.com/embed/BWnloy8r0qU?autoplay=1&rel=0",
    sourceUrl: "https://www.nps.gov/yell/learn/photosmultimedia/webcams.htm",
    lat: 44.4605,
    lon: -110.8281,
  },
  {
    id: "dubai",
    title: "Dubai Skyline Live",
    region: "Dubai, UAE",
    category: "City",
    streamUrl: "https://www.youtube.com/embed/7dE4IjDQJmE?autoplay=1&rel=0",
    sourceUrl: "https://www.youtube.com/",
    lat: 25.1972,
    lon: 55.2744,
  },
  {
    id: "jerusalem",
    title: "Western Wall Live",
    region: "Jerusalem, Israel",
    category: "Landmark",
    streamUrl: "https://www.youtube.com/embed/AKGqd20ik_A?autoplay=1&rel=0",
    sourceUrl: "https://www.youtube.com/",
    lat: 31.7767,
    lon: 35.2345,
  },
  {
    id: "shinjuku",
    title: "Shinjuku Live",
    region: "Tokyo, Japan",
    category: "City",
    streamUrl: "https://www.youtube.com/embed/6dp-bvQ7RWo?autoplay=1&rel=0",
    sourceUrl: "https://www.youtube.com/",
    lat: 35.6938,
    lon: 139.7034,
  },
];
