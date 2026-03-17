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
    id: "iss",
    title: "ISS Live Feed",
    region: "Low Earth Orbit",
    category: "Space",
    streamUrl: "https://www.youtube.com/embed/21X5lGlDOfg",
    sourceUrl: "https://www.nasa.gov/international-space-station/",
  },
  {
    id: "tokyo",
    title: "Tokyo City Live",
    region: "Tokyo, Japan",
    category: "City",
    streamUrl: "https://www.youtube.com/embed/live_stream?channel=UCN6sm8iHiPd0cnoUardDAnA",
    sourceUrl: "https://www.youtube.com/@JapanLiveCamera",
  },
  {
    id: "tel-aviv",
    title: "Tel Aviv Coast Live",
    region: "Tel Aviv, Israel",
    category: "City",
    streamUrl: "https://www.youtube.com/embed/live_stream?channel=UC_6Q5j4Q6kTr5f7Jc6n3j4A",
    sourceUrl: "https://www.youtube.com/",
  },
  {
    id: "tehran",
    title: "Tehran Skyline Live",
    region: "Tehran, Iran",
    category: "City",
    streamUrl: "https://www.youtube.com/embed/live_stream?channel=UCD7lH8fO6A7m8GQxV8i2bZA",
    sourceUrl: "https://www.youtube.com/",
  },
  {
    id: "giza",
    title: "Great Pyramids Live",
    region: "Giza, Egypt",
    category: "Landmark",
    streamUrl: "https://www.youtube.com/embed/live_stream?channel=UCqR2lK4V2f8x2z4P9h3x8WQ",
    sourceUrl: "https://www.youtube.com/",
  },
  {
    id: "yellowstone",
    title: "Yellowstone Basin Live",
    region: "Yellowstone, United States",
    category: "Nature",
    streamUrl: "https://www.youtube.com/embed/live_stream?channel=UC2n4h8n2f1Qx3o1s0s1f6PQ",
    sourceUrl: "https://www.nps.gov/yell/learn/photosmultimedia/webcams.htm",
  },
];
