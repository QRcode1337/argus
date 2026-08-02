// Alias for /api/feeds/aisstream. Route segment config must be declared
// locally — Next.js cannot statically parse a re-exported `dynamic`.
export const dynamic = "force-dynamic";
export { GET } from "../aisstream/route";
