import { NextResponse } from "next/server";
import { readSettings, writeSettings } from "@/lib/settings";
import { AppSettings } from "@/types/settings";

export async function GET() {
  const settings = await readSettings();
  const safe = {
    ...settings,
    llm: { ...settings.llm, apiKey: settings.llm.apiKey ? "••••••" : undefined },
  };
  return NextResponse.json(safe);
}

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<AppSettings>;
  const current = await readSettings();
  const merged: AppSettings = {
    ...current,
    llm: {
      ...current.llm,
      ...(body.llm ?? {}),
      apiKey: body.llm?.apiKey === "••••••" ? current.llm.apiKey : (body.llm?.apiKey ?? current.llm.apiKey),
    },
  };
  await writeSettings(merged);
  return NextResponse.json({ ok: true });
}
