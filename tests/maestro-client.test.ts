/**
 * Unit tests for MaestroClient.
 * Mocks child_process to avoid needing real devices / Maestro CLI.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { MaestroClient } from "../src/maestro-client.js";

// ── Mock helpers ───────────────────────────────────────────────────────────

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
  spawn: vi.fn(),
}));

const mockExecFile = vi.mocked(childProcess.execFile);
const mockSpawn = vi.mocked(childProcess.spawn);

function setupExecFile(
  stdout: string,
  stderr = "",
  error: Error | null = null,
) {
  mockExecFile.mockImplementation(
    (_cmd: any, _args: any, _opts: any, callback: any) => {
      process.nextTick(() => callback(error, stdout, stderr));
      return {} as any;
    },
  );
}

function createMockSpawnChild(
  stdout: string,
  stderr: string,
  exitCode: number,
) {
  const child = new EventEmitter() as any;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();

  // Emit data and close on next tick
  process.nextTick(() => {
    if (stdout) child.stdout.emit("data", Buffer.from(stdout));
    if (stderr) child.stderr.emit("data", Buffer.from(stderr));
    child.emit("close", exitCode);
  });

  return child;
}

function setupSpawn(stdout: string, stderr = "", exitCode = 0) {
  mockSpawn.mockImplementation(() =>
    createMockSpawnChild(stdout, stderr, exitCode),
  );
}

let client: MaestroClient;

beforeEach(() => {
  client = new MaestroClient();
  vi.clearAllMocks();
});

// ── checkInstallation ──────────────────────────────────────────────────────

describe("MaestroClient.checkInstallation", () => {
  it("returns installed=true with version when maestro is found", async () => {
    setupExecFile("1.38.1\n");
    const result = await client.checkInstallation();
    expect(result).toEqual({ installed: true, version: "1.38.1" });
    expect(mockExecFile).toHaveBeenCalledWith(
      "maestro",
      ["--version"],
      expect.any(Object),
      expect.any(Function),
    );
  });

  it("returns installed=false with error when maestro is not found", async () => {
    const err = new Error("command not found");
    (err as any).code = 127;
    setupExecFile("", "maestro: command not found", err);
    const result = await client.checkInstallation();
    expect(result.installed).toBe(false);
    expect(result.error).toContain("command not found");
  });

  it("returns installed=false with fallback error when stderr is empty", async () => {
    const err = new Error("fail");
    (err as any).code = 1;
    setupExecFile("", "", err);
    const result = await client.checkInstallation();
    expect(result.installed).toBe(false);
    expect(result.error).toBe("maestro CLI not found");
  });
});

// ── listDevices ────────────────────────────────────────────────────────────

describe("MaestroClient.listDevices", () => {
  it("parses Android devices from adb output", async () => {
    // First call = adb, second call = xcrun
    let callIndex = 0;
    mockExecFile.mockImplementation(
      (cmd: any, _args: any, _opts: any, callback: any) => {
        if (cmd === "adb") {
          process.nextTick(() =>
            callback(
              null,
              "List of devices attached\nemulator-5554\tdevice\nABC123\toffline\n\n",
              "",
            ),
          );
        } else {
          // xcrun — return empty
          process.nextTick(() => callback(null, '{"devices":{}}', ""));
        }
        return {} as any;
      },
    );

    const result = await client.listDevices();
    expect(result.android).toEqual([
      { id: "emulator-5554", status: "device" },
      { id: "ABC123", status: "offline" },
    ]);
  });

  it("parses iOS simulators from xcrun output", async () => {
    const iosJson = {
      devices: {
        "com.apple.CoreSimulator.SimRuntime.iOS-17-5": [
          {
            udid: "5B6D77EF-2AE9-47D0-9A62-70A1ABBC5FA2",
            name: "iPhone 16",
            state: "Booted",
            isAvailable: true,
          },
          {
            udid: "DEAD0000-BEEF-0000-0000-000000000000",
            name: "iPhone SE",
            state: "Shutdown",
            isAvailable: false,
          },
        ],
      },
    };

    mockExecFile.mockImplementation(
      (cmd: any, _args: any, _opts: any, callback: any) => {
        if (cmd === "adb") {
          process.nextTick(() =>
            callback(null, "List of devices attached\n", ""),
          );
        } else {
          process.nextTick(() =>
            callback(null, JSON.stringify(iosJson), ""),
          );
        }
        return {} as any;
      },
    );

    const result = await client.listDevices();
    expect(result.android).toEqual([]);
    expect(result.ios).toHaveLength(1);
    expect(result.ios[0]).toEqual({
      id: "5B6D77EF-2AE9-47D0-9A62-70A1ABBC5FA2",
      name: "iPhone 16 (iOS-17-5)",
      status: "booted",
    });
  });

  it("handles adb and xcrun both failing gracefully", async () => {
    mockExecFile.mockImplementation(
      (_cmd: any, _args: any, _opts: any, callback: any) => {
        const err = new Error("not found");
        (err as any).code = 1;
        process.nextTick(() => callback(err, "", ""));
        return {} as any;
      },
    );

    const result = await client.listDevices();
    expect(result.android).toEqual([]);
    expect(result.ios).toEqual([]);
  });

  it("handles malformed xcrun JSON gracefully", async () => {
    mockExecFile.mockImplementation(
      (cmd: any, _args: any, _opts: any, callback: any) => {
        if (cmd === "adb") {
          process.nextTick(() =>
            callback(null, "List of devices attached\n", ""),
          );
        } else {
          process.nextTick(() => callback(null, "not-json{{{", ""));
        }
        return {} as any;
      },
    );

    const result = await client.listDevices();
    expect(result.ios).toEqual([]);
  });

  it("parses multiple Android device statuses", async () => {
    mockExecFile.mockImplementation(
      (cmd: any, _args: any, _opts: any, callback: any) => {
        if (cmd === "adb") {
          process.nextTick(() =>
            callback(
              null,
              "List of devices attached\nDEV001\tdevice\nDEV002\tunauthorized\nDEV003\toffline\nrandom_noise\n",
              "",
            ),
          );
        } else {
          process.nextTick(() => callback(null, '{"devices":{}}', ""));
        }
        return {} as any;
      },
    );

    const result = await client.listDevices();
    expect(result.android).toEqual([
      { id: "DEV001", status: "device" },
      { id: "DEV002", status: "unauthorized" },
      { id: "DEV003", status: "offline" },
    ]);
  });

  it("handles iOS devices with missing state field", async () => {
    const iosJson = {
      devices: {
        "com.apple.CoreSimulator.SimRuntime.iOS-18-0": [
          {
            udid: "AAA-BBB",
            name: "iPad Pro",
            isAvailable: true,
            // no state field
          },
        ],
      },
    };

    mockExecFile.mockImplementation(
      (cmd: any, _args: any, _opts: any, callback: any) => {
        if (cmd === "adb") {
          process.nextTick(() =>
            callback(null, "List of devices attached\n", ""),
          );
        } else {
          process.nextTick(() =>
            callback(null, JSON.stringify(iosJson), ""),
          );
        }
        return {} as any;
      },
    );

    const result = await client.listDevices();
    expect(result.ios[0].status).toBe("unknown");
  });
});

// ── runFlow ────────────────────────────────────────────────────────────────

describe("MaestroClient.runFlow", () => {
  it("runs maestro test with flow path", async () => {
    setupSpawn("Test passed", "", 0);
    const result = await client.runFlow("/tmp/flow.yaml");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("Test passed");
    expect(mockSpawn).toHaveBeenCalledWith(
      "maestro",
      ["test", "/tmp/flow.yaml"],
      expect.any(Object),
    );
  });

  it("passes --device flag when deviceId is provided", async () => {
    setupSpawn("OK", "", 0);
    await client.runFlow("/tmp/flow.yaml", "emulator-5554");
    expect(mockSpawn).toHaveBeenCalledWith(
      "maestro",
      ["--device", "emulator-5554", "test", "/tmp/flow.yaml"],
      expect.any(Object),
    );
  });

  it("returns non-zero exit code on failure", async () => {
    setupSpawn("", "Error: element not found", 1);
    const result = await client.runFlow("/tmp/flow.yaml");
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("element not found");
  });
});

// ── executeSteps ───────────────────────────────────────────────────────────

describe("MaestroClient.executeSteps", () => {
  it("builds YAML, writes temp file, runs flow, and returns result", async () => {
    setupSpawn("Test passed", "", 0);
    const { yaml, result } = await client.executeSteps("com.test.app", [
      { command: "launchApp", params: "com.test.app" },
      { command: "tapOn", params: "Login" },
    ]);

    expect(yaml).toContain("appId: com.test.app");
    expect(yaml).toContain('- launchApp: "com.test.app"');
    expect(yaml).toContain('- tapOn: "Login"');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("Test passed");
  });

  it("passes device ID through to runFlow", async () => {
    setupSpawn("OK", "", 0);
    await client.executeSteps(
      "com.test.app",
      [{ command: "scroll" }],
      "emulator-5554",
    );
    expect(mockSpawn).toHaveBeenCalledWith(
      "maestro",
      expect.arrayContaining(["--device", "emulator-5554"]),
      expect.any(Object),
    );
  });

  it("returns failure result when flow fails", async () => {
    setupSpawn("", "Assertion failed", 1);
    const { result } = await client.executeSteps("com.test.app", [
      { command: "assertVisible", params: "MissingElement" },
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Assertion failed");
  });
});

// ── executeStepsMultiDevice ────────────────────────────────────────────────

describe("MaestroClient.executeStepsMultiDevice", () => {
  it("runs flows on multiple devices in parallel", async () => {
    let callCount = 0;
    mockSpawn.mockImplementation(() => {
      callCount++;
      return createMockSpawnChild(`Device ${callCount} OK`, "", 0);
    });

    const { yaml, results } = await client.executeStepsMultiDevice(
      "com.test.app",
      [{ command: "launchApp", params: "com.test.app" }],
      ["device-1", "device-2", "device-3"],
    );

    expect(yaml).toContain("appId: com.test.app");
    expect(Object.keys(results)).toHaveLength(3);
    expect(results["device-1"].exitCode).toBe(0);
    expect(results["device-2"].exitCode).toBe(0);
    expect(results["device-3"].exitCode).toBe(0);
  });

  it("returns per-device results even when some fail", async () => {
    let callCount = 0;
    mockSpawn.mockImplementation(() => {
      callCount++;
      if (callCount === 2) {
        return createMockSpawnChild("", "Failed", 1);
      }
      return createMockSpawnChild("OK", "", 0);
    });

    const { results } = await client.executeStepsMultiDevice(
      "com.test.app",
      [{ command: "tapOn", params: "Button" }],
      ["dev-A", "dev-B"],
    );

    expect(results["dev-A"].exitCode).toBe(0);
    expect(results["dev-B"].exitCode).toBe(1);
  });
});

// ── runSharded ─────────────────────────────────────────────────────────────

describe("MaestroClient.runSharded", () => {
  it("uses --shard-split flag by default", async () => {
    setupSpawn("Sharding complete", "", 0);
    const result = await client.runSharded(".maestro/", 3);
    expect(result.exitCode).toBe(0);
    expect(mockSpawn).toHaveBeenCalledWith(
      "maestro",
      ["--shard-split", "3", "test", ".maestro/"],
      expect.any(Object),
    );
  });

  it("uses --shard-all when strategy is 'all'", async () => {
    setupSpawn("All shards done", "", 0);
    await client.runSharded(".maestro/", 5, "all");
    expect(mockSpawn).toHaveBeenCalledWith(
      "maestro",
      ["--shard-all", "5", "test", ".maestro/"],
      expect.any(Object),
    );
  });
});

// ── takeScreenshot ─────────────────────────────────────────────────────────

describe("MaestroClient.takeScreenshot", () => {
  it("returns screenshot path and result", async () => {
    setupSpawn("Screenshot taken", "", 0);
    const { path, result } = await client.takeScreenshot();
    expect(path).toContain("screenshot.png");
    expect(result.exitCode).toBe(0);
  });

  it("passes --device flag for device-specific screenshot", async () => {
    setupSpawn("OK", "", 0);
    await client.takeScreenshot("emulator-5554");
    expect(mockSpawn).toHaveBeenCalledWith(
      "maestro",
      expect.arrayContaining(["--device", "emulator-5554"]),
      expect.any(Object),
    );
  });

  it("uses custom output path if provided", async () => {
    setupSpawn("OK", "", 0);
    const { path } = await client.takeScreenshot(
      undefined,
      "/custom/path/shot.png",
    );
    expect(path).toBe("/custom/path/shot.png");
  });
});

// ── getHierarchy ───────────────────────────────────────────────────────────

describe("MaestroClient.getHierarchy", () => {
  it("runs maestro hierarchy command", async () => {
    setupExecFile("<hierarchy>...</hierarchy>");
    const result = await client.getHierarchy();
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("<hierarchy>");
    expect(mockExecFile).toHaveBeenCalledWith(
      "maestro",
      ["hierarchy"],
      expect.any(Object),
      expect.any(Function),
    );
  });

  it("passes --device flag", async () => {
    setupExecFile("<hierarchy/>");
    await client.getHierarchy("device-123");
    expect(mockExecFile).toHaveBeenCalledWith(
      "maestro",
      ["--device", "device-123", "hierarchy"],
      expect.any(Object),
      expect.any(Function),
    );
  });
});

// ── launchStudio ───────────────────────────────────────────────────────────

describe("MaestroClient.launchStudio", () => {
  it("runs maestro studio command", async () => {
    setupExecFile("Studio launched");
    const result = await client.launchStudio();
    expect(mockExecFile).toHaveBeenCalledWith(
      "maestro",
      ["studio"],
      expect.any(Object),
      expect.any(Function),
    );
  });

  it("passes device and port options", async () => {
    setupExecFile("OK");
    await client.launchStudio("emulator-5554", 9999);
    expect(mockExecFile).toHaveBeenCalledWith(
      "maestro",
      ["--device", "emulator-5554", "studio", "--port", "9999"],
      expect.any(Object),
      expect.any(Function),
    );
  });
});

// ── rawCommand ─────────────────────────────────────────────────────────────

describe("MaestroClient.rawCommand", () => {
  it("passes arbitrary args to maestro CLI", async () => {
    setupSpawn("custom output", "", 0);
    const result = await client.rawCommand(["--version"]);
    expect(result.stdout).toBe("custom output");
    expect(mockSpawn).toHaveBeenCalledWith(
      "maestro",
      ["--version"],
      expect.any(Object),
    );
  });

  it("passes complex args correctly", async () => {
    setupSpawn("OK", "", 0);
    await client.rawCommand([
      "--device",
      "emulator-5554",
      "test",
      "my-flow.yaml",
    ]);
    expect(mockSpawn).toHaveBeenCalledWith(
      "maestro",
      ["--device", "emulator-5554", "test", "my-flow.yaml"],
      expect.any(Object),
    );
  });
});
