import { NextResponse } from "next/server";
import { getJob } from "@/lib/store";


export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const job = await getJob((await params).id);
  return job ? NextResponse.json(job) : NextResponse.json({ error: "not found" }, { status: 404 });
}
