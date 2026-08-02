// Alias for /api/feeds/celestrak. Route segment config must be declared
// locally — Next.js cannot statically parse a re-exported `dynamic`.
export const dynamic = "force-dynamic";
export { GET } from "../celestrak/route";
