import { Daytona, Image } from "@daytona/sdk";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const WORK = "/tmp/job";

export type JobSandbox = {
  upload(buf: Buffer, remotePath: string): Promise<void>;
  exec(cmd: string, timeoutSec?: number): Promise<string>;
  download(remotePath: string): Promise<Buffer>;
};

// Built once by Daytona and cached; first job of the day takes longer.
const image = Image.debianSlim("3.12")
  .runCommands("apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*")
  .pipInstall(["librosa==0.10.2.post1", "numpy", "scipy", "soundfile"]);

let client: Daytona | null = null;
const daytona = () => (client ??= new Daytona());

export async function withJobSandbox<T>(fn: (sb: JobSandbox) => Promise<T>): Promise<T> {
  const sandbox = await daytona().create(
    { image },
    { timeout: 600, onSnapshotCreateLogs: (l: string) => console.log("[daytona]", l.trimEnd()) },
  );
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
    await sandbox.process.executeCommand(`mkdir -p ${WORK}`);
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
