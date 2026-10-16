import { Daytona } from "@daytona/sdk";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const WORK = "/tmp/job";

export type JobSandbox = {
  upload(buf: Buffer, remotePath: string): Promise<void>;
  exec(cmd: string, timeoutSec?: number): Promise<string>;
  download(remotePath: string): Promise<Buffer>;
};

let client: Daytona | null = null;
// Endpoint is set here on purpose: the SDK refuses an API URL that only comes from a .env file.
const daytona = () =>
  (client ??= new Daytona({
    apiKey: process.env.DAYTONA_API_KEY,
    apiUrl: "https://app.daytona.io/api",
    target: process.env.DAYTONA_TARGET || "eu",
  }));

export async function withJobSandbox<T>(fn: (sb: JobSandbox) => Promise<T>): Promise<T> {
  // Default python sandbox ships ffmpeg, numpy and scipy; librosa installs in ~5s.
  // (Declarative image builds aren't enabled for this org.)
  const sandbox = await daytona().create({ language: "python" }, { timeout: 120 });
  const sb: JobSandbox = {
    async upload(buf, remotePath) {
      await sandbox.fs.uploadFile(buf, remotePath);
    },
    async exec(cmd, timeoutSec = 300) {
      const r = await sandbox.process.executeCommand(cmd, WORK, undefined, timeoutSec);
      if (r.exitCode !== 0) throw new Error(`sandbox command failed (${r.exitCode}): ${cmd}\n${r.result}`);
      return r.result;
    },
    async download(remotePath) {
      return Buffer.from(await sandbox.fs.downloadFile(remotePath));
    },
  };
  try {
    await sandbox.process.executeCommand(`mkdir -p ${WORK} && pip install -q librosa soundfile`, undefined, undefined, 180);
    return await fn(sb);
  } finally {
    await sandbox.delete().catch((e: unknown) => console.error("[daytona] delete failed", e));
  }
}

export async function uploadScripts(sb: JobSandbox) {
  for (const f of ["analyze.py", "mux.sh"]) {
    await sb.upload(await readFile(path.join(process.cwd(), "sandbox", f)), `${WORK}/${f}`);
  }
}
