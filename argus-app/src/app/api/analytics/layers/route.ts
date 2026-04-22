import { NextResponse } from "next/server";

interface RainViewerMap {
  path: string;
  time: number;
}

interface RainViewerData {
  radar?: { past?: RainViewerMap[] };
}

async function getLatestRadarTimestamp(): Promise<string> {
  try {
    const res = await fetch("https://api.rainviewer.com/public/weather-maps.json", {
      next: { revalidate: 300 },
    });
    const data: RainViewerData = await res.json();
    const past = data?.radar?.past;
    if (past && past.length > 0) {
      return past[past.length - 1].path;
    }
  } catch {
    // fall through to default
  }
  return "/v2/radar/nowcast";
}

export async function GET() {
  const radarPath = await getLatestRadarTimestamp();

  const layers = [
    {
      id: "gfs_precip_radar",
      label: "Precipitation Radar",
      source: "RainViewer",
      type: "xyz",
      tileUrl: `https://tilecache.rainviewer.com${radarPath}/256/{z}/{x}/{y}/6/1_1.png`,
      
      available: true,
    },
    {
      id: "gfs_satellite_ir",
      label: "Satellite IR (GOES)",
      source: "NOAA / Iowa Mesonet",
      type: "xyz",
      tileUrl:
        "https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/goes-vis-1km-900913/{z}/{x}/{y}.png",
      
      available: true,
    },
    {
      id: "sentinel_imagery",
      label: "Sentinel-2 Imagery",
      source: "EOX / Sentinel-2 Cloudless",
      type: "xyz",
      tileUrl:
        "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2021_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg",
      
      available: true,
    },
  ];

  return NextResponse.json(
    { layers, available_file_count: layers.length, fallback: false },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
