import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import type { MeetingBrief } from "../../../packages/agent/src/meeting-brief-synthesizer.ts";

export type GeneratedMeetingBriefPdf = {
  bytes: Buffer;
  filename: string;
  storagePath: string;
};

export async function generateMeetingBriefPdf(input: {
  brief: MeetingBrief;
  meetingContext: string;
  researchGoal: string;
}): Promise<GeneratedMeetingBriefPdf> {
  const projectRoot = process.cwd();
  const filename = `${safeFilename(input.brief.companyName)}-meeting-brief-r${input.brief.revision}.pdf`;
  const outputPath = join(projectRoot, "output", "pdf", filename);
  await mkdir(dirname(outputPath), { recursive: true });

  const scriptPath = fileURLToPath(new URL("./generate_meeting_brief_pdf.py", import.meta.url));
  await runPython(scriptPath, outputPath, JSON.stringify(input));
  const bytes = await readFile(outputPath);
  if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw new Error("Meeting brief renderer did not produce a valid PDF");
  }
  return {
    bytes,
    filename,
    storagePath: relative(projectRoot, outputPath).replaceAll("\\", "/"),
  };
}

function runPython(scriptPath: string, outputPath: string, input: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const processHandle = spawn(resolvePython(), [scriptPath, outputPath], {
      cwd: process.cwd(),
      stdio: ["pipe", "ignore", "pipe"],
      windowsHide: true,
    });
    let errorText = "";
    processHandle.stderr.setEncoding("utf8");
    processHandle.stderr.on("data", (chunk: string) => {
      errorText += chunk;
    });
    processHandle.on("error", reject);
    processHandle.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Meeting brief PDF generation failed (${code}): ${errorText.trim()}`));
    });
    processHandle.stdin.end(input);
  });
}

function resolvePython(): string {
  const configured = process.env.SWITCHPATH_PYTHON_BIN?.trim();
  if (configured) return configured;
  const bundled = join(
    homedir(),
    ".cache",
    "codex-runtimes",
    "codex-primary-runtime",
    "dependencies",
    "python",
    process.platform === "win32" ? "python.exe" : "bin/python",
  );
  return existsSync(bundled) ? bundled : process.platform === "win32" ? "python" : "python3";
}

function safeFilename(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return normalized || "account";
}
