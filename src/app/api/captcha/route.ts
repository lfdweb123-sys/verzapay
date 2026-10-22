import { NextResponse } from "next/server";
import { createCaptchaChallenge } from "@/lib/captcha";

export async function GET() {
  const challenge = createCaptchaChallenge();
  if (!challenge) return NextResponse.json({ enabled: false });
  return NextResponse.json({ enabled: true, ...challenge }, { headers: { "Cache-Control": "no-store" } });
}
