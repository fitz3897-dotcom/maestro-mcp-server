/**
 * Maestro CLI wrapper — executes Maestro commands and manages YAML flow files.
 */

import { execFile, spawn } from "node:child_process";
import { writeFile, mkdtemp, rm, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Run a shell command and collect output. */
export function exec(
  cmd: string,
  args: string[],
  timeoutMs = 120_000,
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout ?? "",
        stderr: stderr ?? "",
        exitCode: error ? (typeof (error as any).code === "number" ? (error as any).code : 1) : 0,
      });
    });
  });
}

/** Run a command and stream output in real-time, returning collected result. */
export function execStream(
  cmd: string,
  args: string[],
  timeoutMs = 180_000,
): Promise<ExecResult> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";

    const child = spawn(cmd, args, { timeout: timeoutMs });

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });
    child.on("error", (err) => {
      resolve({ stdout, stderr: stderr + "\n" + err.message, exitCode: 1 });
    });
  });
}

// ---------------------------------------------------------------------------
// YAML Flow builder
// ---------------------------------------------------------------------------

export interface FlowStep {
  command: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params?: any;
}

export function buildYaml(appId: string, steps: FlowStep[]): string {
  const lines: string[] = [`appId: ${appId}`, "---"];
  for (const step of steps) {
    lines.push(formatStep(step));
  }
  return lines.join("\n") + "\n";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function formatStep(step: FlowStep): string {
  const { command, params } = step;

  // Simple commands without params
  if (params === undefined || params === null) {
    return `- ${command}`;
  }

  // String param  →  - tapOn: "Login"
  if (typeof params === "string") {
    return `- ${command}: "${escapeYaml(params)}"`;
  }

  // Number param  →  - scroll: 500
  if (typeof params === "number") {
    return `- ${command}: ${params}`;
  }

  // Boolean param
  if (typeof params === "boolean") {
    return `- ${command}: ${params}`;
  }

  // Object param  →  multi-line YAML
  if (typeof params === "object" && !Array.isArray(params)) {
    const inner = Object.entries(params)
      .map(([k, v]) => {
        if (typeof v === "object" && v !== null) {
          // Nested object (e.g., point: { x: 50, y: 50 })
          const nested = Object.entries(v as Record<string, unknown>)
            .map(([nk, nv]) => `        ${nk}: ${formatValue(nv)}`)
            .join("\n");
          return `      ${k}:\n${nested}`;
        }
        return `      ${k}: ${formatValue(v)}`;
      })
      .join("\n");
    return `- ${command}:\n${inner}`;
  }

  return `- ${command}: ${JSON.stringify(params)}`;
}

export function formatValue(v: unknown): string {
  if (typeof v === "string") return `"${escapeYaml(v)}"`;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

export function escapeYaml(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// ---------------------------------------------------------------------------
// Maestro Client
// ---------------------------------------------------------------------------

export class MaestroClient {
  /** Verify maestro CLI is available. */
  async checkInstallation(): Promise<{ installed: boolean; version?: string; error?: string }> {
    const result = await exec("maestro", ["--version"]);
    if (result.exitCode === 0) {
      return { installed: true, version: result.stdout.trim() };
    }
    return { installed: false, error: result.stderr || "maestro CLI not found" };
  }

  /** List connected devices via adb (Android) and xcrun simctl (iOS). */
  async listDevices(): Promise<{
    android: { id: string; status: string }[];
    ios: { id: string; name: string; status: string }[];
  }> {
    const [androidResult, iosResult] = await Promise.all([
      exec("adb", ["devices"]).catch(() => ({ stdout: "", stderr: "", exitCode: 1 })),
      exec("xcrun", ["simctl", "list", "devices", "--json"]).catch(() => ({
        stdout: "",
        stderr: "",
        exitCode: 1,
      })),
    ]);

    const android: { id: string; status: string }[] = [];
    if (androidResult.exitCode === 0) {
      const lines = androidResult.stdout.split("\n").slice(1); // skip header
      for (const line of lines) {
        const match = line.trim().match(/^(\S+)\s+(device|offline|unauthorized)$/);
        if (match) {
          android.push({ id: match[1], status: match[2] });
        }
      }
    }

    const ios: { id: string; name: string; status: string }[] = [];
    if (iosResult.exitCode === 0) {
      try {
        const data = JSON.parse(iosResult.stdout);
        const devices = data.devices || {};
        for (const runtime of Object.keys(devices)) {
          for (const device of devices[runtime]) {
            if (device.isAvailable !== false) {
              ios.push({
                id: device.udid,
                name: `${device.name} (${runtime.split(".").pop()})`,
                status: device.state?.toLowerCase() ?? "unknown",
              });
            }
          }
        }
      } catch {
        // ignore parse errors
      }
    }

    return { android, ios };
  }

  /** Run a Maestro flow YAML file on a specific device. */
  async runFlow(
    flowPath: string,
    deviceId?: string,
    timeoutMs = 180_000,
  ): Promise<ExecResult> {
    const args: string[] = [];
    if (deviceId) {
      args.push("--device", deviceId);
    }
    args.push("test", flowPath);
    return execStream("maestro", args, timeoutMs);
  }

  /** Build a YAML flow from steps, write to temp file, run it, and clean up. */
  async executeSteps(
    appId: string,
    steps: FlowStep[],
    deviceId?: string,
    timeoutMs = 180_000,
  ): Promise<{ yaml: string; result: ExecResult }> {
    const yaml = buildYaml(appId, steps);
    const dir = await mkdtemp(join(tmpdir(), "maestro-mcp-"));
    const flowPath = join(dir, "flow.yaml");
    await writeFile(flowPath, yaml, "utf-8");

    try {
      const result = await this.runFlow(flowPath, deviceId, timeoutMs);
      return { yaml, result };
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /** Run flows on multiple devices in parallel. */
  async executeStepsMultiDevice(
    appId: string,
    steps: FlowStep[],
    deviceIds: string[],
    timeoutMs = 180_000,
  ): Promise<{ yaml: string; results: Record<string, ExecResult> }> {
    const yaml = buildYaml(appId, steps);
    const dir = await mkdtemp(join(tmpdir(), "maestro-mcp-"));
    const flowPath = join(dir, "flow.yaml");
    await writeFile(flowPath, yaml, "utf-8");

    try {
      const entries = await Promise.all(
        deviceIds.map(async (id) => {
          const result = await this.runFlow(flowPath, id, timeoutMs);
          return [id, result] as const;
        }),
      );
      const results: Record<string, ExecResult> = {};
      for (const [id, result] of entries) {
        results[id] = result;
      }
      return { yaml, results };
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /** Run Maestro's built-in sharding (shard-all or shard-split). */
  async runSharded(
    flowDir: string,
    shardCount: number,
    strategy: "all" | "split" = "split",
  ): Promise<ExecResult> {
    const flag = strategy === "all" ? "--shard-all" : "--shard-split";
    return execStream("maestro", [flag, String(shardCount), "test", flowDir]);
  }

  /** Take a screenshot via Maestro. */
  async takeScreenshot(deviceId?: string, outputPath?: string): Promise<{ path: string; result: ExecResult }> {
    const dir = await mkdtemp(join(tmpdir(), "maestro-mcp-screenshot-"));
    const screenshotPath = outputPath ?? join(dir, "screenshot.png");

    // No appId context needed; use a minimal flow
    const yaml = `---\n- takeScreenshot: ${screenshotPath}\n`;
    const flowPath = join(dir, "screenshot_flow.yaml");
    await writeFile(flowPath, yaml, "utf-8");

    const args: string[] = [];
    if (deviceId) args.push("--device", deviceId);
    args.push("test", flowPath);

    const result = await execStream("maestro", args);
    return { path: screenshotPath, result };
  }

  /** Get device hierarchy / UI elements. */
  async getHierarchy(deviceId?: string): Promise<ExecResult> {
    const args: string[] = [];
    if (deviceId) args.push("--device", deviceId);
    args.push("hierarchy");
    return exec("maestro", args);
  }

  /** Launch Maestro Studio (returns immediately, studio runs in background). */
  async launchStudio(deviceId?: string, port?: number): Promise<ExecResult> {
    const args: string[] = [];
    if (deviceId) args.push("--device", deviceId);
    args.push("studio");
    if (port) args.push("--port", String(port));
    // Studio is interactive; run with a short timeout just to start it
    return exec("maestro", args, 5_000);
  }

  /** Run a raw Maestro CLI command. */
  async rawCommand(args: string[], timeoutMs = 120_000): Promise<ExecResult> {
    return execStream("maestro", args, timeoutMs);
  }
}
