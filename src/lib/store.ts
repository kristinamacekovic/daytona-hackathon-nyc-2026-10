import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Job } from "./types";

const DATA = path.join(process.cwd(), ".data");
export const DEMO_DIR = path.join(DATA, "demo");
export const jobDir = (id: string) => path.join(DATA, "jobs", id.replace(/[^a-z0-9-]/gi, ""));

// globalThis survives Next dev hot reloads
const g = globalThis as unknown as { __jobs?: Map<string, Job> };
const jobs = (g.__jobs ??= new Map<string, Job>());

export function createJob(brand: string): Job {
  const job: Job = { id: randomUUID(), brand, status: "ingesting", options: [], created_at: new Date().toISOString() };
  jobs.set(job.id, job);
  return job;
}

export async function updateJob(job: Job, patch: Partial<Job>) {
  Object.assign(job, patch);
  await mkdir(jobDir(job.id), { recursive: true });
  await writeFile(path.join(jobDir(job.id), "job.json"), JSON.stringify(job, null, 2));
}

export async function getJob(id: string): Promise<Job | null> {
  const mem = jobs.get(id);
  if (mem) return mem;
  try {
    const job = JSON.parse(await readFile(path.join(jobDir(id), "job.json"), "utf8")) as Job;
    jobs.set(id, job);
    return job;
  } catch {
    return null;
  }
}
