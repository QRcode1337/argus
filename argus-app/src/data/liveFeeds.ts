export interface LiveFeedItem {
  id: string;
  title: string;
  region: string;
  category: "City" | "Landmark" | "Nature" | "Space";
  streamUrl: string;
  sourceUrl?: string;
}

export const LIVE_FEEDS: LiveFeedItem[] = [
  {
    id: "iss-1",
    title: "ISS Live Feed",
    region: "Low Earth Orbit",
    category: "Space",
    streamUrl: "https://www.youtube.com/embed/vytmBNhc9ig?autoplay=1&rel=0",
    sourceUrl: "https://www.nasa.gov/international-space-station/",
  },
  {
    id: "iss-2",
    title: "ISS Earth View",
    region: "Low Earth Orbit",
    category: "Space",
    streamUrl: "https://www.youtube.com/embed/sWasdbDVNvc?autoplay=1&rel=0",
    sourceUrl: "https://www.nasa.gov/international-space-station/",
  },
  {
    id: "shibuya",
    title: "Shibuya Crossing Live",
    region: "Tokyo, Japan",
    category: "City",
    streamUrl: "https://www.youtube.com/embed/dfVK7ld38Ys?autoplay=1&rel=0",
    sourceUrl: "https://www.youtube.com/@ANNnewsCH",
  },
  {
    id: "shibuya-sky",
    title: "Shibuya Sky View",
    region: "Tokyo, Japan",
    category: "City",
    streamUrl: "https://www.youtube.com/embed/3Q5wZeTuttw?autoplay=1&rel=0",
    sourceUrl: "https://www.youtube.com/@shibuyasky7253",
  },
  {
    id: "shinjuku",
    title: "Shinjuku Live",
    region: "Tokyo, Japan",
    category: "City",
    streamUrl: "https://www.youtube.com/embed/6dp-bvQ7RWo?autoplay=1&rel=0",
    sourceUrl: "https://www.youtube.com/",
  },
  {
    id: "jerusalem",
    title: "Western Wall Live",
    region: "Jerusalem, Israel",
    category: "Landmark",
    streamUrl: "https://www.youtube.com/embed/AKGqd20ik_A?autoplay=1&rel=0",
    sourceUrl: "https://www.youtube.com/",
  },
  {
    id: "jerusalem-2",
    title: "Jerusalem Panorama",
    region: "Jerusalem, Israel",
    category: "City",
    streamUrl: "https://www.youtube.com/embed/zp6LNSoq000?autoplay=1&rel=0",
    sourceUrl: "https://www.youtube.com/",
  },
  {
    id: "iss-tracker",
    title: "ISS HD Earth Viewing",
    region: "Low Earth Orbit",
    category: "Space",
    streamUrl: "https://www.youtube.com/embed/zPH5KtjJFaQ?autoplay=1&rel=0",
    sourceUrl: "https://www.nasa.gov/international-space-station/",
  },
];
