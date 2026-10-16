import { NextResponse } from "next/server";
import { listBrands } from "@/lib/brands";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await listBrands());
}
