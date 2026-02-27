import { NextResponse } from "next/server";

// Stub response — returns mock data until PostGIS is populated by the ingestor.
// When the ingestor runs, replace this with a real pg query.
const MOCK_LAYERS = [
  {
    id: 1,
    name: "GFS Temperature 2m",
    variable: "t2m",
    valid_time: null,
    tile_url: null, // populated after first ingest
  },
  {
    id: 2,
    name: "GFS Wind U 10m",
    variable: "u10",
    valid_time: null,
    tile_url: null,
  },
  {
    id: 3,
    name: "GFS Wind V 10m",
    variable: "v10",
    valid_time: null,
    tile_url: null,
  },
];

export async function GET() {
  return NextResponse.json({ layers: MOCK_LAYERS });
}
