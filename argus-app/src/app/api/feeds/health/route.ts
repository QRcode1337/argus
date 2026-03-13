import { NextResponse } from "next/server";
import { getFeedHealth } from "@/lib/feedHealth";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    feeds: getFeedHealth(),
    timestamp: new Date().toISOString(),
  });
}
