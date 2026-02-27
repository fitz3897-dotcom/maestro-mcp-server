#!/usr/bin/env node

/**
 * Maestro MCP Server
 *
 * Exposes Maestro mobile-automation capabilities as MCP tools so that
 * AI assistants (Claude, ChatGPT, Cursor, etc.) can drive Android / iOS
 * devices and apps — including in-app H5 / WebView pages.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { MaestroClient, type FlowStep } from "./maestro-client.js";

const maestro = new MaestroClient();

const server = new McpServer({
  name: "maestro-mcp-server",
  version: "1.0.0",
});

// ── helpers ────────────────────────────────────────────────────────────────

function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function fail(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

// ── Tool: check_environment ────────────────────────────────────────────────

server.tool(
  "check_environment",
  "Check if Maestro CLI is installed and return its version",
  {},
  async () => {
    const info = await maestro.checkInstallation();
    if (info.installed) {
      return ok(`Maestro is installed. Version: ${info.version}`);
    }
    return fail(
      `Maestro is NOT installed. ${info.error}\n\nInstall via:\n  curl -fsSL "https://get.maestro.mobile.dev" | bash`,
    );
  },
);

// ── Tool: list_devices ─────────────────────────────────────────────────────

server.tool(
  "list_devices",
  "List all connected Android devices/emulators and iOS simulators",
  {},
  async () => {
    const devices = await maestro.listDevices();
    const lines: string[] = [];

    lines.push("## Android Devices");
    if (devices.android.length === 0) {
      lines.push("  (none detected — is adb running?)");
    } else {
      for (const d of devices.android) {
        lines.push(`  - ${d.id}  [${d.status}]`);
      }
    }

    lines.push("\n## iOS Simulators");
    if (devices.ios.length === 0) {
      lines.push("  (none detected — is Xcode installed?)");
    } else {
      for (const d of devices.ios) {
        lines.push(`  - ${d.id}  ${d.name}  [${d.status}]`);
      }
    }

    return ok(lines.join("\n"));
  },
);

// ── Tool: launch_app ───────────────────────────────────────────────────────

server.tool(
  "launch_app",
  "Launch a mobile app by its package/bundle ID on a device",
  {
    appId: z.string().describe("App package name (Android) or bundle ID (iOS), e.g. com.example.app"),
    deviceId: z.string().optional().describe("Target device ID. Omit to use the default device"),
    clearState: z.boolean().optional().describe("Clear app state before launching (default: false)"),
  },
  async ({ appId, deviceId, clearState }) => {
    const steps: FlowStep[] = [];
    if (clearState) {
      steps.push({ command: "clearState", params: appId });
    }
    steps.push({ command: "launchApp", params: appId });

    const { yaml, result } = await maestro.executeSteps(appId, steps, deviceId);
    const output = [
      `**Flow YAML:**\n\`\`\`yaml\n${yaml}\`\`\``,
      `**Exit code:** ${result.exitCode}`,
      result.stdout ? `**Output:**\n${result.stdout}` : "",
      result.stderr ? `**Stderr:**\n${result.stderr}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    return result.exitCode === 0 ? ok(output) : fail(output);
  },
);

// ── Tool: tap ──────────────────────────────────────────────────────────────

server.tool(
  "tap",
  "Tap on a UI element by text, ID, or coordinates. Works with native and WebView/H5 elements",
  {
    appId: z.string().describe("App package/bundle ID"),
    target: z.string().describe("Text label, accessibility ID, or resource-id of the element to tap"),
    deviceId: z.string().optional().describe("Target device ID"),
    isId: z.boolean().optional().describe("If true, treat target as a resource-id / test-id"),
    point: z
      .object({ x: z.number(), y: z.number() })
      .optional()
      .describe("Tap at exact screen coordinates (percentage 0-100 or pixels)"),
    retryCount: z.number().optional().describe("Number of retries if element not found"),
  },
  async ({ appId, target, deviceId, isId, point, retryCount }) => {
    const steps: FlowStep[] = [];

    if (point) {
      steps.push({ command: "tapOn", params: { point: `${point.x},${point.y}` } });
    } else if (isId) {
      const tapParams: Record<string, unknown> = { id: target };
      if (retryCount) tapParams.retryTapIfNoChange = retryCount;
      steps.push({ command: "tapOn", params: tapParams });
    } else {
      const tapParams: Record<string, unknown> = { text: target };
      if (retryCount) tapParams.retryTapIfNoChange = retryCount;
      steps.push({ command: "tapOn", params: tapParams });
    }

    const { yaml, result } = await maestro.executeSteps(appId, steps, deviceId);
    const output = `**Flow:**\n\`\`\`yaml\n${yaml}\`\`\`\n\n**Exit:** ${result.exitCode}\n${result.stdout}\n${result.stderr}`;
    return result.exitCode === 0 ? ok(output) : fail(output);
  },
);

// ── Tool: input_text ───────────────────────────────────────────────────────

server.tool(
  "input_text",
  "Type text into the currently focused input field (native or WebView/H5)",
  {
    appId: z.string().describe("App package/bundle ID"),
    text: z.string().describe("Text to input"),
    deviceId: z.string().optional().describe("Target device ID"),
  },
  async ({ appId, text, deviceId }) => {
    const steps: FlowStep[] = [{ command: "inputText", params: text }];
    const { yaml, result } = await maestro.executeSteps(appId, steps, deviceId);
    const output = `**Flow:**\n\`\`\`yaml\n${yaml}\`\`\`\n\n**Exit:** ${result.exitCode}\n${result.stdout}\n${result.stderr}`;
    return result.exitCode === 0 ? ok(output) : fail(output);
  },
);

// ── Tool: swipe ────────────────────────────────────────────────────────────

server.tool(
  "swipe",
  "Perform a swipe gesture on the device screen",
  {
    appId: z.string().describe("App package/bundle ID"),
    direction: z
      .enum(["up", "down", "left", "right"])
      .optional()
      .describe("Swipe direction (simple swipe)"),
    start: z
      .object({ x: z.number(), y: z.number() })
      .optional()
      .describe("Start point (percentage 0-100)"),
    end: z
      .object({ x: z.number(), y: z.number() })
      .optional()
      .describe("End point (percentage 0-100)"),
    duration: z.number().optional().describe("Swipe duration in ms"),
    deviceId: z.string().optional().describe("Target device ID"),
  },
  async ({ appId, direction, start, end, duration, deviceId }) => {
    const steps: FlowStep[] = [];

    if (direction) {
      steps.push({ command: "swipe", params: { direction, duration } });
    } else if (start && end) {
      steps.push({
        command: "swipe",
        params: {
          start: `${start.x}%,${start.y}%`,
          end: `${end.x}%,${end.y}%`,
          duration,
        },
      });
    } else {
      return fail("Provide either 'direction' or both 'start' and 'end' points.");
    }

    const { yaml, result } = await maestro.executeSteps(appId, steps, deviceId);
    const output = `**Flow:**\n\`\`\`yaml\n${yaml}\`\`\`\n\n**Exit:** ${result.exitCode}\n${result.stdout}\n${result.stderr}`;
    return result.exitCode === 0 ? ok(output) : fail(output);
  },
);

// ── Tool: scroll ───────────────────────────────────────────────────────────

server.tool(
  "scroll",
  "Scroll the screen or scroll until a specific element is visible",
  {
    appId: z.string().describe("App package/bundle ID"),
    deviceId: z.string().optional().describe("Target device ID"),
    direction: z.enum(["up", "down", "left", "right"]).optional().describe("Scroll direction (default: down)"),
    scrollUntilVisible: z.string().optional().describe("Keep scrolling until this text/element becomes visible"),
  },
  async ({ appId, deviceId, direction, scrollUntilVisible }) => {
    const steps: FlowStep[] = [];

    if (scrollUntilVisible) {
      steps.push({
        command: "scrollUntilVisible",
        params: {
          element: scrollUntilVisible,
          direction: direction ?? "DOWN",
        },
      });
    } else {
      steps.push({ command: "scroll" });
    }

    const { yaml, result } = await maestro.executeSteps(appId, steps, deviceId);
    const output = `**Flow:**\n\`\`\`yaml\n${yaml}\`\`\`\n\n**Exit:** ${result.exitCode}\n${result.stdout}\n${result.stderr}`;
    return result.exitCode === 0 ? ok(output) : fail(output);
  },
);

// ── Tool: assert_visible ───────────────────────────────────────────────────

server.tool(
  "assert_visible",
  "Assert that a UI element is visible on screen (native or WebView/H5)",
  {
    appId: z.string().describe("App package/bundle ID"),
    target: z.string().describe("Text, accessibility ID, or resource-id to assert"),
    isId: z.boolean().optional().describe("If true, treat target as a resource-id"),
    visible: z.boolean().optional().describe("Assert visible (true, default) or not visible (false)"),
    deviceId: z.string().optional().describe("Target device ID"),
  },
  async ({ appId, target, isId, visible, deviceId }) => {
    const shouldBeVisible = visible !== false;
    const command = shouldBeVisible ? "assertVisible" : "assertNotVisible";
    const params = isId ? { id: target } : target;
    const steps: FlowStep[] = [{ command, params }];

    const { yaml, result } = await maestro.executeSteps(appId, steps, deviceId);
    const output = `**Flow:**\n\`\`\`yaml\n${yaml}\`\`\`\n\n**Exit:** ${result.exitCode}\n${result.stdout}\n${result.stderr}`;
    return result.exitCode === 0 ? ok(output) : fail(output);
  },
);

// ── Tool: press_key ────────────────────────────────────────────────────────

server.tool(
  "press_key",
  "Press a device key (back, home, enter, volume up/down, etc.)",
  {
    appId: z.string().describe("App package/bundle ID"),
    key: z
      .enum(["back", "home", "enter", "volume_up", "volume_down", "power", "tab", "backspace", "lock"])
      .describe("Key to press"),
    deviceId: z.string().optional().describe("Target device ID"),
  },
  async ({ appId, key, deviceId }) => {
    const steps: FlowStep[] = [{ command: "pressKey", params: key }];
    const { yaml, result } = await maestro.executeSteps(appId, steps, deviceId);
    const output = `**Flow:**\n\`\`\`yaml\n${yaml}\`\`\`\n\n**Exit:** ${result.exitCode}\n${result.stdout}\n${result.stderr}`;
    return result.exitCode === 0 ? ok(output) : fail(output);
  },
);

// ── Tool: erase_text ───────────────────────────────────────────────────────

server.tool(
  "erase_text",
  "Erase characters from the currently focused text field",
  {
    appId: z.string().describe("App package/bundle ID"),
    count: z.number().optional().describe("Number of characters to erase (default: all)"),
    deviceId: z.string().optional().describe("Target device ID"),
  },
  async ({ appId, count, deviceId }) => {
    const steps: FlowStep[] = [{ command: "eraseText", params: count }];
    const { yaml, result } = await maestro.executeSteps(appId, steps, deviceId);
    const output = `**Flow:**\n\`\`\`yaml\n${yaml}\`\`\`\n\n**Exit:** ${result.exitCode}\n${result.stdout}\n${result.stderr}`;
    return result.exitCode === 0 ? ok(output) : fail(output);
  },
);

// ── Tool: open_link ────────────────────────────────────────────────────────

server.tool(
  "open_link",
  "Open a deep link or URL in the device (useful for navigating to H5 pages or specific app screens)",
  {
    appId: z.string().describe("App package/bundle ID"),
    url: z.string().describe("URL or deep link to open"),
    deviceId: z.string().optional().describe("Target device ID"),
  },
  async ({ appId, url, deviceId }) => {
    const steps: FlowStep[] = [{ command: "openLink", params: url }];
    const { yaml, result } = await maestro.executeSteps(appId, steps, deviceId);
    const output = `**Flow:**\n\`\`\`yaml\n${yaml}\`\`\`\n\n**Exit:** ${result.exitCode}\n${result.stdout}\n${result.stderr}`;
    return result.exitCode === 0 ? ok(output) : fail(output);
  },
);

// ── Tool: set_location ─────────────────────────────────────────────────────

server.tool(
  "set_location",
  "Set the GPS location on the device",
  {
    appId: z.string().describe("App package/bundle ID"),
    latitude: z.number().describe("Latitude"),
    longitude: z.number().describe("Longitude"),
    deviceId: z.string().optional().describe("Target device ID"),
  },
  async ({ appId, latitude, longitude, deviceId }) => {
    const steps: FlowStep[] = [
      { command: "setLocation", params: { latitude: String(latitude), longitude: String(longitude) } },
    ];
    const { yaml, result } = await maestro.executeSteps(appId, steps, deviceId);
    const output = `**Flow:**\n\`\`\`yaml\n${yaml}\`\`\`\n\n**Exit:** ${result.exitCode}\n${result.stdout}\n${result.stderr}`;
    return result.exitCode === 0 ? ok(output) : fail(output);
  },
);

// ── Tool: take_screenshot ──────────────────────────────────────────────────

server.tool(
  "take_screenshot",
  "Capture a screenshot of the current device screen",
  {
    deviceId: z.string().optional().describe("Target device ID"),
  },
  async ({ deviceId }) => {
    const { path, result } = await maestro.takeScreenshot(deviceId);
    if (result.exitCode === 0) {
      return ok(`Screenshot saved to: ${path}\n\n${result.stdout}`);
    }
    return fail(`Failed to take screenshot.\n${result.stderr}\n${result.stdout}`);
  },
);

// ── Tool: run_flow ─────────────────────────────────────────────────────────

server.tool(
  "run_flow",
  "Execute a complete Maestro flow from a YAML string or file path",
  {
    yamlContent: z.string().optional().describe("YAML flow content (provide this OR filePath)"),
    filePath: z.string().optional().describe("Path to a .yaml flow file (provide this OR yamlContent)"),
    deviceId: z.string().optional().describe("Target device ID"),
  },
  async ({ yamlContent, filePath, deviceId }) => {
    if (!yamlContent && !filePath) {
      return fail("Provide either yamlContent or filePath.");
    }

    let flowPath = filePath;
    let tmpDir: string | undefined;

    if (yamlContent && !filePath) {
      const { mkdtemp, writeFile } = await import("node:fs/promises");
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");
      tmpDir = await mkdtemp(join(tmpdir(), "maestro-mcp-flow-"));
      flowPath = join(tmpDir, "flow.yaml");
      await writeFile(flowPath, yamlContent, "utf-8");
    }

    const result = await maestro.runFlow(flowPath!, deviceId);

    if (tmpDir) {
      const { rm } = await import("node:fs/promises");
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }

    const output = `**Exit:** ${result.exitCode}\n${result.stdout}\n${result.stderr}`;
    return result.exitCode === 0 ? ok(output) : fail(output);
  },
);

// ── Tool: run_flow_on_multiple_devices ─────────────────────────────────────

server.tool(
  "run_flow_on_multiple_devices",
  "Execute the same Maestro flow on multiple devices in parallel (multi-device concurrent support)",
  {
    appId: z.string().describe("App package/bundle ID"),
    steps: z
      .array(
        z.object({
          command: z.string().describe("Maestro command name"),
          params: z.any().optional().describe("Command parameters"),
        }),
      )
      .describe("Array of flow steps to execute"),
    deviceIds: z.array(z.string()).describe("List of device IDs to run on concurrently"),
  },
  async ({ appId, steps, deviceIds }) => {
    const { yaml, results } = await maestro.executeStepsMultiDevice(
      appId,
      steps as FlowStep[],
      deviceIds,
    );

    const lines = [`**Flow YAML:**\n\`\`\`yaml\n${yaml}\`\`\`\n`];
    for (const [deviceId, result] of Object.entries(results)) {
      lines.push(`### Device: ${deviceId}`);
      lines.push(`- Exit code: ${result.exitCode}`);
      if (result.stdout) lines.push(`- Output: ${result.stdout.slice(0, 500)}`);
      if (result.stderr) lines.push(`- Stderr: ${result.stderr.slice(0, 500)}`);
      lines.push("");
    }

    const allSuccess = Object.values(results).every((r) => r.exitCode === 0);
    return allSuccess ? ok(lines.join("\n")) : fail(lines.join("\n"));
  },
);

// ── Tool: execute_flow_steps ───────────────────────────────────────────────

server.tool(
  "execute_flow_steps",
  "Build and execute a multi-step Maestro flow from a list of commands. Supports all Maestro commands including WebView/H5 interactions",
  {
    appId: z.string().describe("App package/bundle ID"),
    steps: z
      .array(
        z.object({
          command: z
            .string()
            .describe(
              "Maestro command: launchApp, stopApp, killApp, tapOn, doubleTapOn, longPressOn, " +
              "inputText, eraseText, swipe, scroll, scrollUntilVisible, back, hideKeyboard, " +
              "pressKey, openLink, assertVisible, assertNotVisible, assertTrue, " +
              "copyTextFrom, pasteText, setLocation, setAirplaneMode, toggleAirplaneMode, " +
              "setOrientation, clearState, clearKeychain, takeScreenshot, " +
              "waitForAnimationToEnd, extendedWaitUntil, repeat, evalScript, runScript, " +
              "startRecording, stopRecording, setPermissions",
            ),
          params: z.any().optional().describe("Command parameters (string, object, or omit for no-param commands)"),
        }),
      )
      .describe("Ordered list of flow steps"),
    deviceId: z.string().optional().describe("Target device ID"),
  },
  async ({ appId, steps, deviceId }) => {
    const { yaml, result } = await maestro.executeSteps(appId, steps as FlowStep[], deviceId);
    const output = [
      `**Flow YAML:**\n\`\`\`yaml\n${yaml}\`\`\``,
      `**Exit code:** ${result.exitCode}`,
      result.stdout ? `**Output:**\n${result.stdout}` : "",
      result.stderr ? `**Stderr:**\n${result.stderr}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    return result.exitCode === 0 ? ok(output) : fail(output);
  },
);

// ── Tool: get_ui_hierarchy ─────────────────────────────────────────────────

server.tool(
  "get_ui_hierarchy",
  "Get the current UI element hierarchy of the device screen (useful for finding element selectors)",
  {
    deviceId: z.string().optional().describe("Target device ID"),
  },
  async ({ deviceId }) => {
    const result = await maestro.getHierarchy(deviceId);
    if (result.exitCode === 0) {
      return ok(result.stdout);
    }
    return fail(`Failed to get hierarchy.\n${result.stderr}\n${result.stdout}`);
  },
);

// ── Tool: maestro_command ──────────────────────────────────────────────────

server.tool(
  "maestro_command",
  "Run any raw Maestro CLI command for advanced usage",
  {
    args: z.array(z.string()).describe('CLI arguments, e.g. ["test", "flow.yaml"] or ["--device", "emulator-5554", "test", "flow.yaml"]'),
  },
  async ({ args }) => {
    const result = await maestro.rawCommand(args);
    const output = `**Command:** maestro ${args.join(" ")}\n**Exit:** ${result.exitCode}\n\n${result.stdout}\n${result.stderr}`;
    return result.exitCode === 0 ? ok(output) : fail(output);
  },
);

// ── Tool: long_press ───────────────────────────────────────────────────────

server.tool(
  "long_press",
  "Long press on a UI element",
  {
    appId: z.string().describe("App package/bundle ID"),
    target: z.string().describe("Text or ID of the element"),
    isId: z.boolean().optional().describe("Treat target as resource-id"),
    deviceId: z.string().optional().describe("Target device ID"),
  },
  async ({ appId, target, isId, deviceId }) => {
    const params = isId ? { id: target } : target;
    const steps: FlowStep[] = [{ command: "longPressOn", params }];
    const { yaml, result } = await maestro.executeSteps(appId, steps, deviceId);
    const output = `**Flow:**\n\`\`\`yaml\n${yaml}\`\`\`\n\n**Exit:** ${result.exitCode}\n${result.stdout}\n${result.stderr}`;
    return result.exitCode === 0 ? ok(output) : fail(output);
  },
);

// ── Tool: double_tap ───────────────────────────────────────────────────────

server.tool(
  "double_tap",
  "Double tap on a UI element",
  {
    appId: z.string().describe("App package/bundle ID"),
    target: z.string().describe("Text or ID of the element"),
    isId: z.boolean().optional().describe("Treat target as resource-id"),
    deviceId: z.string().optional().describe("Target device ID"),
  },
  async ({ appId, target, isId, deviceId }) => {
    const params = isId ? { id: target } : target;
    const steps: FlowStep[] = [{ command: "doubleTapOn", params }];
    const { yaml, result } = await maestro.executeSteps(appId, steps, deviceId);
    const output = `**Flow:**\n\`\`\`yaml\n${yaml}\`\`\`\n\n**Exit:** ${result.exitCode}\n${result.stdout}\n${result.stderr}`;
    return result.exitCode === 0 ? ok(output) : fail(output);
  },
);

// ── Tool: copy_text ────────────────────────────────────────────────────────

server.tool(
  "copy_text",
  "Copy text content from a UI element",
  {
    appId: z.string().describe("App package/bundle ID"),
    target: z.string().describe("Text or ID of the element to copy from"),
    isId: z.boolean().optional().describe("Treat target as resource-id"),
    deviceId: z.string().optional().describe("Target device ID"),
  },
  async ({ appId, target, isId, deviceId }) => {
    const params = isId ? { id: target } : target;
    const steps: FlowStep[] = [{ command: "copyTextFrom", params }];
    const { yaml, result } = await maestro.executeSteps(appId, steps, deviceId);
    const output = `**Flow:**\n\`\`\`yaml\n${yaml}\`\`\`\n\n**Exit:** ${result.exitCode}\n${result.stdout}\n${result.stderr}`;
    return result.exitCode === 0 ? ok(output) : fail(output);
  },
);

// ── Tool: set_permissions ──────────────────────────────────────────────────

server.tool(
  "set_permissions",
  "Set app permissions (e.g., notifications, location, camera, etc.)",
  {
    appId: z.string().describe("App package/bundle ID"),
    permissions: z
      .record(z.string(), z.enum(["allow", "deny", "unset"]))
      .describe('Permission map, e.g. {"notifications": "allow", "location": "deny"}'),
    deviceId: z.string().optional().describe("Target device ID"),
  },
  async ({ appId, permissions, deviceId }) => {
    const steps: FlowStep[] = [{ command: "setPermissions", params: permissions }];
    const { yaml, result } = await maestro.executeSteps(appId, steps, deviceId);
    const output = `**Flow:**\n\`\`\`yaml\n${yaml}\`\`\`\n\n**Exit:** ${result.exitCode}\n${result.stdout}\n${result.stderr}`;
    return result.exitCode === 0 ? ok(output) : fail(output);
  },
);

// ── Tool: hide_keyboard ────────────────────────────────────────────────────

server.tool(
  "hide_keyboard",
  "Hide the on-screen keyboard",
  {
    appId: z.string().describe("App package/bundle ID"),
    deviceId: z.string().optional().describe("Target device ID"),
  },
  async ({ appId, deviceId }) => {
    const steps: FlowStep[] = [{ command: "hideKeyboard" }];
    const { yaml, result } = await maestro.executeSteps(appId, steps, deviceId);
    const output = `**Flow:**\n\`\`\`yaml\n${yaml}\`\`\`\n\n**Exit:** ${result.exitCode}\n${result.stdout}\n${result.stderr}`;
    return result.exitCode === 0 ? ok(output) : fail(output);
  },
);

// ── Tool: wait_for_animation ───────────────────────────────────────────────

server.tool(
  "wait_for_animation",
  "Wait for all animations to complete before proceeding",
  {
    appId: z.string().describe("App package/bundle ID"),
    timeout: z.number().optional().describe("Max wait time in ms"),
    deviceId: z.string().optional().describe("Target device ID"),
  },
  async ({ appId, timeout, deviceId }) => {
    const params = timeout ? { timeout } : undefined;
    const steps: FlowStep[] = [{ command: "waitForAnimationToEnd", params }];
    const { yaml, result } = await maestro.executeSteps(appId, steps, deviceId);
    const output = `**Flow:**\n\`\`\`yaml\n${yaml}\`\`\`\n\n**Exit:** ${result.exitCode}\n${result.stdout}\n${result.stderr}`;
    return result.exitCode === 0 ? ok(output) : fail(output);
  },
);

// ── Tool: stop_app ─────────────────────────────────────────────────────────

server.tool(
  "stop_app",
  "Stop / kill a running app",
  {
    appId: z.string().describe("App package/bundle ID"),
    deviceId: z.string().optional().describe("Target device ID"),
  },
  async ({ appId, deviceId }) => {
    const steps: FlowStep[] = [{ command: "stopApp", params: appId }];
    const { yaml, result } = await maestro.executeSteps(appId, steps, deviceId);
    const output = `**Flow:**\n\`\`\`yaml\n${yaml}\`\`\`\n\n**Exit:** ${result.exitCode}\n${result.stdout}\n${result.stderr}`;
    return result.exitCode === 0 ? ok(output) : fail(output);
  },
);

// ── Tool: set_orientation ──────────────────────────────────────────────────

server.tool(
  "set_orientation",
  "Set the device screen orientation",
  {
    appId: z.string().describe("App package/bundle ID"),
    orientation: z.enum(["portrait", "landscape"]).describe("Screen orientation"),
    deviceId: z.string().optional().describe("Target device ID"),
  },
  async ({ appId, orientation, deviceId }) => {
    const steps: FlowStep[] = [
      { command: "setOrientation", params: orientation.toUpperCase() },
    ];
    const { yaml, result } = await maestro.executeSteps(appId, steps, deviceId);
    const output = `**Flow:**\n\`\`\`yaml\n${yaml}\`\`\`\n\n**Exit:** ${result.exitCode}\n${result.stdout}\n${result.stderr}`;
    return result.exitCode === 0 ? ok(output) : fail(output);
  },
);

// ── Boot ───────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Maestro MCP Server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
