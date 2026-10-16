import { NextResponse, connection } from "next/server";
import { listBrands } from "@/lib/brands";

export async function GET() {
  await connection(); // always read the current list, never prerender it
  return NextResponse.json(await listBrands());
}
