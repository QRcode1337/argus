import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type AstroPerson = {
  craft: string;
  name: string;
};

type AstrosResponse = {
  message?: string;
  number?: number;
  people?: AstroPerson[];
};

const OPEN_NOTIFY_ASTROS = "http://api.open-notify.org/astros.json";
const DEFAULT_VIDEO_URL = "https://www.youtube.com/embed/21X5lGlDOfg";
const DEFAULT_MORE_INFO_URL = "https://www.nasa.gov/international-space-station/";

export async function GET() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    let crew: string[] = [];
    try {
      const response = await fetch(OPEN_NOTIFY_ASTROS, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (response.ok) {
        const payload = (await response.json()) as AstrosResponse;
        crew = (payload.people ?? [])
          .filter((person) => person.craft?.toUpperCase().includes("ISS"))
          .map((person) => person.name);
      }
    } finally {
      clearTimeout(timeout);
    }

    return NextResponse.json(
      {
        craft: "ISS",
        crew,
        updatedAt: new Date().toISOString(),
        videoUrl: DEFAULT_VIDEO_URL,
        moreInfoUrl: DEFAULT_MORE_INFO_URL,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, max-age=180",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        craft: "ISS",
        crew: [],
        updatedAt: new Date().toISOString(),
        videoUrl: DEFAULT_VIDEO_URL,
        moreInfoUrl: DEFAULT_MORE_INFO_URL,
        error: error instanceof Error ? error.message : "Failed to resolve ISS crew",
      },
      { status: 200 },
    );
  }
}
