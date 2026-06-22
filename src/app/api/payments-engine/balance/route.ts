import { NextResponse } from "next/server";
import { getJoonapayBalance } from "@/lib/joonapay";

export async function GET() {
  try {
    const res = await getJoonapayBalance();
    return NextResponse.json(res);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
