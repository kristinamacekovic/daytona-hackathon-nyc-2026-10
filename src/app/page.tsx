"use client";
import { useState } from "react";
import { NewJobForm } from "@/components/new-job-form";
import { JobView } from "@/components/job-view";

export default function Home() {
  const [jobId, setJobId] = useState<string | null>(null);
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-12 sm:px-6 sm:py-16">
      <header className="flex flex-col gap-3">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Music Swap</p>
        <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          Brand-safe music that hits every cut.
        </h1>
        <p className="max-w-2xl text-pretty text-muted-foreground">
          Drop in your video, pick the brand. We measure the edit, write three original tracks timed to it,
          and recommend the one that fits.
        </p>
      </header>
      {jobId ? <JobView id={jobId} onReset={() => setJobId(null)} /> : <NewJobForm onCreated={setJobId} />}
    </main>
  );
}
