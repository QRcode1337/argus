import { Raindrop } from "raindrop-ai";

export const raindrop = new Raindrop({
  writeKey: process.env.RAINDROP_WRITE_KEY!,
  useExternalOtel: true,
});
