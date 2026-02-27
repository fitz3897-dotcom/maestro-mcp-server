/**
 * Integration tests for all 26 MCP tools.
 * Creates a real McpServer with InMemoryTransport, using a mock MaestroClient.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { z } from "zod";

// ── Create mock MaestroClient ──────────────────────────────────────────────

function createMockMaestro() {
  return {
    checkInstallation: vi.fn().mockResolvedValue({
      installed: true,
      version: "1.38.1",
    }),
    listDevices: vi.fn().mockResolvedValue({
      android: [
        { id: "emulator-5554", status: "device" },
        { id: "PIXEL6", status: "device" },
      ],
      ios: [
        { id: "5B6D-UUID", name: "iPhone 16 (iOS-17-5)", status: "booted" },
      ],
    }),
    executeSteps: vi.fn().mockResolvedValue({
      yaml: "appId: com.test\n---\n- launchApp: com.test\n",
      result: { stdout: "Test passed", stderr: "", exitCode: 0 },
    }),
    executeStepsMultiDevice: vi.fn().mockResolvedValue({
      yaml: "appId: com.test\n---\n- launchApp: com.test\n",
      results: {
        "emulator-5554": { stdout: "OK", stderr: "", exitCode: 0 },
        PIXEL6: { stdout: "OK", stderr: "", exitCode: 0 },
      },
    }),
    runFlow: vi
      .fn()
      .mockResolvedValue({ stdout: "Flow done", stderr: "", exitCode: 0 }),
    takeScreenshot: vi.fn().mockResolvedValue({
      path: "/tmp/screenshot.png",
      result: { stdout: "Screenshot taken", stderr: "", exitCode: 0 },
    }),
    getHierarchy: vi.fn().mockResolvedValue({
      stdout: "<hierarchy><node text='Hello'/></hierarchy>",
      stderr: "",
      exitCode: 0,
    }),
    rawCommand: vi
      .fn()
      .mockResolvedValue({ stdout: "raw output", stderr: "", exitCode: 0 }),
  };
}

// ── Build MCP server with all 26 tools ─────────────────────────────────────

function buildServer(maestro: ReturnType<typeof createMockMaestro>) {
  const server = new McpServer({
    name: "test-maestro-mcp",
    version: "1.0.0",
  });

  function ok(text: string) {
    return { content: [{ type: "text" as const, text }] };
  }
  function fail(text: string) {
    return { content: [{ type: "text" as const, text }], isError: true };
  }

  // 1. check_environment
  server.tool("check_environment", "Check Maestro CLI", {}, async () => {
    const info = await maestro.checkInstallation();
    if (info.installed) return ok(`Maestro is installed. Version: ${info.version}`);
    return fail(`Maestro is NOT installed. ${info.error}`);
  });

  // 2. list_devices
  server.tool("list_devices", "List devices", {}, async () => {
    const devices = await maestro.listDevices();
    const lines: string[] = ["## Android Devices"];
    if (devices.android.length === 0) {
      lines.push("  (none detected)");
    } else {
      for (const d of devices.android) lines.push(`  - ${d.id}  [${d.status}]`);
    }
    lines.push("\n## iOS Simulators");
    if (devices.ios.length === 0) {
      lines.push("  (none detected)");
    } else {
      for (const d of devices.ios) lines.push(`  - ${d.id}  ${d.name}  [${d.status}]`);
    }
    return ok(lines.join("\n"));
  });

  // 3. launch_app
  server.tool(
    "launch_app", "Launch app",
    { appId: z.string(), deviceId: z.string().optional(), clearState: z.boolean().optional() },
    async ({ appId, deviceId, clearState }) => {
      const steps: any[] = [];
      if (clearState) steps.push({ command: "clearState", params: appId });
      steps.push({ command: "launchApp", params: appId });
      const { yaml, result } = await maestro.executeSteps(appId, steps, deviceId);
      const output = `YAML:\n${yaml}\nExit: ${result.exitCode}\n${result.stdout}`;
      return result.exitCode === 0 ? ok(output) : fail(output);
    },
  );

  // 4. tap
  server.tool(
    "tap", "Tap element",
    {
      appId: z.string(), target: z.string(), deviceId: z.string().optional(),
      isId: z.boolean().optional(),
      point: z.object({ x: z.number(), y: z.number() }).optional(),
      retryCount: z.number().optional(),
    },
    async ({ appId, target, deviceId, isId, point, retryCount }) => {
      const steps: any[] = [];
      if (point) {
        steps.push({ command: "tapOn", params: { point: `${point.x},${point.y}` } });
      } else if (isId) {
        const p: any = { id: target };
        if (retryCount) p.retryTapIfNoChange = retryCount;
        steps.push({ command: "tapOn", params: p });
      } else {
        const p: any = { text: target };
        if (retryCount) p.retryTapIfNoChange = retryCount;
        steps.push({ command: "tapOn", params: p });
      }
      const { result } = await maestro.executeSteps(appId, steps, deviceId);
      return result.exitCode === 0 ? ok("tapped") : fail("tap failed");
    },
  );

  // 5. input_text
  server.tool(
    "input_text", "Input text",
    { appId: z.string(), text: z.string(), deviceId: z.string().optional() },
    async ({ appId, text, deviceId }) => {
      const { result } = await maestro.executeSteps(appId, [{ command: "inputText", params: text }], deviceId);
      return result.exitCode === 0 ? ok("text input") : fail("input failed");
    },
  );

  // 6. swipe
  server.tool(
    "swipe", "Swipe",
    {
      appId: z.string(),
      direction: z.enum(["up", "down", "left", "right"]).optional(),
      start: z.object({ x: z.number(), y: z.number() }).optional(),
      end: z.object({ x: z.number(), y: z.number() }).optional(),
      duration: z.number().optional(),
      deviceId: z.string().optional(),
    },
    async ({ appId, direction, start, end, deviceId }) => {
      if (!direction && !(start && end)) return fail("Provide direction or start+end");
      const { result } = await maestro.executeSteps(appId, [{ command: "swipe", params: direction ? { direction } : { start, end } }], deviceId);
      return result.exitCode === 0 ? ok("swiped") : fail("swipe failed");
    },
  );

  // 7. scroll
  server.tool(
    "scroll", "Scroll",
    {
      appId: z.string(), deviceId: z.string().optional(),
      direction: z.enum(["up", "down", "left", "right"]).optional(),
      scrollUntilVisible: z.string().optional(),
    },
    async ({ appId, deviceId, direction, scrollUntilVisible }) => {
      const steps: any[] = scrollUntilVisible
        ? [{ command: "scrollUntilVisible", params: { element: scrollUntilVisible, direction: direction ?? "DOWN" } }]
        : [{ command: "scroll" }];
      const { result } = await maestro.executeSteps(appId, steps, deviceId);
      return result.exitCode === 0 ? ok("scrolled") : fail("scroll failed");
    },
  );

  // 8. assert_visible
  server.tool(
    "assert_visible", "Assert visible",
    {
      appId: z.string(), target: z.string(), isId: z.boolean().optional(),
      visible: z.boolean().optional(), deviceId: z.string().optional(),
    },
    async ({ appId, target, isId, visible, deviceId }) => {
      const command = visible !== false ? "assertVisible" : "assertNotVisible";
      const params = isId ? { id: target } : target;
      const { result } = await maestro.executeSteps(appId, [{ command, params }], deviceId);
      return result.exitCode === 0 ? ok("asserted") : fail("assert failed");
    },
  );

  // 9. press_key
  server.tool(
    "press_key", "Press key",
    {
      appId: z.string(),
      key: z.enum(["back", "home", "enter", "volume_up", "volume_down", "power", "tab", "backspace", "lock"]),
      deviceId: z.string().optional(),
    },
    async ({ appId, key, deviceId }) => {
      const { result } = await maestro.executeSteps(appId, [{ command: "pressKey", params: key }], deviceId);
      return result.exitCode === 0 ? ok("key pressed") : fail("key press failed");
    },
  );

  // 10. erase_text
  server.tool(
    "erase_text", "Erase text",
    { appId: z.string(), count: z.number().optional(), deviceId: z.string().optional() },
    async ({ appId, count, deviceId }) => {
      const { result } = await maestro.executeSteps(appId, [{ command: "eraseText", params: count }], deviceId);
      return result.exitCode === 0 ? ok("erased") : fail("erase failed");
    },
  );

  // 11. open_link
  server.tool(
    "open_link", "Open link",
    { appId: z.string(), url: z.string(), deviceId: z.string().optional() },
    async ({ appId, url, deviceId }) => {
      const { result } = await maestro.executeSteps(appId, [{ command: "openLink", params: url }], deviceId);
      return result.exitCode === 0 ? ok("link opened") : fail("open link failed");
    },
  );

  // 12. set_location
  server.tool(
    "set_location", "Set location",
    { appId: z.string(), latitude: z.number(), longitude: z.number(), deviceId: z.string().optional() },
    async ({ appId, latitude, longitude, deviceId }) => {
      const { result } = await maestro.executeSteps(
        appId, [{ command: "setLocation", params: { latitude: String(latitude), longitude: String(longitude) } }], deviceId,
      );
      return result.exitCode === 0 ? ok("location set") : fail("set location failed");
    },
  );

  // 13. take_screenshot
  server.tool(
    "take_screenshot", "Take screenshot",
    { deviceId: z.string().optional() },
    async ({ deviceId }) => {
      const { path, result } = await maestro.takeScreenshot(deviceId);
      return result.exitCode === 0 ? ok(`Screenshot: ${path}`) : fail("screenshot failed");
    },
  );

  // 14. run_flow
  server.tool(
    "run_flow", "Run flow",
    { yamlContent: z.string().optional(), filePath: z.string().optional(), deviceId: z.string().optional() },
    async ({ yamlContent, filePath, deviceId }) => {
      if (!yamlContent && !filePath) return fail("Provide yamlContent or filePath.");
      const result = await maestro.runFlow(filePath ?? "/tmp/flow.yaml", deviceId);
      return result.exitCode === 0 ? ok("flow done") : fail("flow failed");
    },
  );

  // 15. run_flow_on_multiple_devices
  server.tool(
    "run_flow_on_multiple_devices", "Multi-device flow",
    {
      appId: z.string(),
      steps: z.array(z.object({ command: z.string(), params: z.any().optional() })),
      deviceIds: z.array(z.string()),
    },
    async ({ appId, steps, deviceIds }) => {
      const { results } = await maestro.executeStepsMultiDevice(appId, steps, deviceIds);
      const allOk = Object.values(results).every((r: any) => r.exitCode === 0);
      return allOk ? ok("all devices OK") : fail("some devices failed");
    },
  );

  // 16. execute_flow_steps
  server.tool(
    "execute_flow_steps", "Execute steps",
    {
      appId: z.string(),
      steps: z.array(z.object({ command: z.string(), params: z.any().optional() })),
      deviceId: z.string().optional(),
    },
    async ({ appId, steps, deviceId }) => {
      const { yaml, result } = await maestro.executeSteps(appId, steps, deviceId);
      return result.exitCode === 0 ? ok(`YAML:\n${yaml}`) : fail("steps failed");
    },
  );

  // 17. get_ui_hierarchy
  server.tool(
    "get_ui_hierarchy", "Get hierarchy",
    { deviceId: z.string().optional() },
    async ({ deviceId }) => {
      const result = await maestro.getHierarchy(deviceId);
      return result.exitCode === 0 ? ok(result.stdout) : fail("hierarchy failed");
    },
  );

  // 18. maestro_command
  server.tool(
    "maestro_command", "Raw command",
    { args: z.array(z.string()) },
    async ({ args }) => {
      const result = await maestro.rawCommand(args);
      return result.exitCode === 0 ? ok(result.stdout) : fail("command failed");
    },
  );

  // 19. long_press
  server.tool(
    "long_press", "Long press",
    { appId: z.string(), target: z.string(), isId: z.boolean().optional(), deviceId: z.string().optional() },
    async ({ appId, target, isId, deviceId }) => {
      const params = isId ? { id: target } : target;
      const { result } = await maestro.executeSteps(appId, [{ command: "longPressOn", params }], deviceId);
      return result.exitCode === 0 ? ok("long pressed") : fail("long press failed");
    },
  );

  // 20. double_tap
  server.tool(
    "double_tap", "Double tap",
    { appId: z.string(), target: z.string(), isId: z.boolean().optional(), deviceId: z.string().optional() },
    async ({ appId, target, isId, deviceId }) => {
      const params = isId ? { id: target } : target;
      const { result } = await maestro.executeSteps(appId, [{ command: "doubleTapOn", params }], deviceId);
      return result.exitCode === 0 ? ok("double tapped") : fail("double tap failed");
    },
  );

  // 21. copy_text
  server.tool(
    "copy_text", "Copy text",
    { appId: z.string(), target: z.string(), isId: z.boolean().optional(), deviceId: z.string().optional() },
    async ({ appId, target, isId, deviceId }) => {
      const params = isId ? { id: target } : target;
      const { result } = await maestro.executeSteps(appId, [{ command: "copyTextFrom", params }], deviceId);
      return result.exitCode === 0 ? ok("text copied") : fail("copy failed");
    },
  );

  // 22. set_permissions
  server.tool(
    "set_permissions", "Set permissions",
    { appId: z.string(), permissions: z.record(z.string(), z.enum(["allow", "deny", "unset"])), deviceId: z.string().optional() },
    async ({ appId, permissions, deviceId }) => {
      const { result } = await maestro.executeSteps(appId, [{ command: "setPermissions", params: permissions }], deviceId);
      return result.exitCode === 0 ? ok("permissions set") : fail("set permissions failed");
    },
  );

  // 23. hide_keyboard
  server.tool(
    "hide_keyboard", "Hide keyboard",
    { appId: z.string(), deviceId: z.string().optional() },
    async ({ appId, deviceId }) => {
      const { result } = await maestro.executeSteps(appId, [{ command: "hideKeyboard" }], deviceId);
      return result.exitCode === 0 ? ok("keyboard hidden") : fail("hide keyboard failed");
    },
  );

  // 24. wait_for_animation
  server.tool(
    "wait_for_animation", "Wait animation",
    { appId: z.string(), timeout: z.number().optional(), deviceId: z.string().optional() },
    async ({ appId, timeout, deviceId }) => {
      const params = timeout ? { timeout } : undefined;
      const { result } = await maestro.executeSteps(appId, [{ command: "waitForAnimationToEnd", params }], deviceId);
      return result.exitCode === 0 ? ok("animation done") : fail("wait failed");
    },
  );

  // 25. stop_app
  server.tool(
    "stop_app", "Stop app",
    { appId: z.string(), deviceId: z.string().optional() },
    async ({ appId, deviceId }) => {
      const { result } = await maestro.executeSteps(appId, [{ command: "stopApp", params: appId }], deviceId);
      return result.exitCode === 0 ? ok("app stopped") : fail("stop failed");
    },
  );

  // 26. set_orientation
  server.tool(
    "set_orientation", "Set orientation",
    { appId: z.string(), orientation: z.enum(["portrait", "landscape"]), deviceId: z.string().optional() },
    async ({ appId, orientation, deviceId }) => {
      const { result } = await maestro.executeSteps(
        appId, [{ command: "setOrientation", params: orientation.toUpperCase() }], deviceId,
      );
      return result.exitCode === 0 ? ok("orientation set") : fail("orientation failed");
    },
  );

  return server;
}

// ── Setup: create MCP client/server pair ───────────────────────────────────

let client: Client;
let mcpServer: McpServer;
let mockMaestro: ReturnType<typeof createMockMaestro>;

beforeAll(async () => {
  mockMaestro = createMockMaestro();
  mcpServer = buildServer(mockMaestro);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test-client", version: "1.0.0" });

  await mcpServer.connect(serverTransport);
  await client.connect(clientTransport);
});

afterAll(async () => {
  await client.close();
  await mcpServer.close();
});

// ── Helper ─────────────────────────────────────────────────────────────────

async function callTool(name: string, args: Record<string, unknown> = {}) {
  return client.callTool({ name, arguments: args });
}

function getText(result: any): string {
  return result.content
    .filter((c: any) => c.type === "text")
    .map((c: any) => c.text)
    .join("\n");
}

// ── Tool listing ───────────────────────────────────────────────────────────

describe("MCP tool listing", () => {
  it("registers all 26 tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.length).toBe(26);
  });

  it("includes all expected tool names", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    const expected = [
      "assert_visible", "check_environment", "copy_text", "double_tap",
      "erase_text", "execute_flow_steps", "get_ui_hierarchy", "hide_keyboard",
      "input_text", "launch_app", "list_devices", "long_press",
      "maestro_command", "open_link", "press_key", "run_flow",
      "run_flow_on_multiple_devices", "scroll", "set_location",
      "set_orientation", "set_permissions", "stop_app", "swipe",
      "take_screenshot", "tap", "wait_for_animation",
    ].sort();
    expect(names).toEqual(expected);
  });
});

// ── check_environment ──────────────────────────────────────────────────────

describe("tool: check_environment", () => {
  it("returns Maestro version when installed", async () => {
    const result = await callTool("check_environment");
    const text = getText(result);
    expect(text).toContain("Maestro is installed");
    expect(text).toContain("1.38.1");
    expect(result.isError).toBeFalsy();
  });

  it("returns error when not installed", async () => {
    mockMaestro.checkInstallation.mockResolvedValueOnce({
      installed: false,
      error: "maestro CLI not found",
    });
    const result = await callTool("check_environment");
    expect(result.isError).toBe(true);
    expect(getText(result)).toContain("NOT installed");
  });
});

// ── list_devices ───────────────────────────────────────────────────────────

describe("tool: list_devices", () => {
  it("lists Android and iOS devices", async () => {
    const result = await callTool("list_devices");
    const text = getText(result);
    expect(text).toContain("Android Devices");
    expect(text).toContain("emulator-5554");
    expect(text).toContain("PIXEL6");
    expect(text).toContain("iOS Simulators");
    expect(text).toContain("5B6D-UUID");
    expect(text).toContain("iPhone 16");
  });

  it("shows (none detected) when no devices", async () => {
    mockMaestro.listDevices.mockResolvedValueOnce({ android: [], ios: [] });
    const result = await callTool("list_devices");
    const text = getText(result);
    expect(text).toContain("(none detected)");
  });
});

// ── launch_app ─────────────────────────────────────────────────────────────

describe("tool: launch_app", () => {
  it("launches app successfully", async () => {
    const result = await callTool("launch_app", { appId: "com.test.app" });
    expect(result.isError).toBeFalsy();
    expect(getText(result)).toContain("YAML:");
    expect(mockMaestro.executeSteps).toHaveBeenCalled();
  });

  it("includes clearState step when requested", async () => {
    await callTool("launch_app", { appId: "com.test.app", clearState: true });
    const lastCall = mockMaestro.executeSteps.mock.calls.at(-1)!;
    expect(lastCall[1]).toEqual([
      { command: "clearState", params: "com.test.app" },
      { command: "launchApp", params: "com.test.app" },
    ]);
  });

  it("passes deviceId", async () => {
    await callTool("launch_app", { appId: "com.test.app", deviceId: "emulator-5554" });
    const lastCall = mockMaestro.executeSteps.mock.calls.at(-1)!;
    expect(lastCall[2]).toBe("emulator-5554");
  });

  it("returns error on failure", async () => {
    mockMaestro.executeSteps.mockResolvedValueOnce({
      yaml: "...", result: { stdout: "", stderr: "App not found", exitCode: 1 },
    });
    const result = await callTool("launch_app", { appId: "com.missing.app" });
    expect(result.isError).toBe(true);
  });
});

// ── tap ────────────────────────────────────────────────────────────────────

describe("tool: tap", () => {
  it("taps by text", async () => {
    const result = await callTool("tap", { appId: "com.test", target: "Login" });
    expect(result.isError).toBeFalsy();
    const call = mockMaestro.executeSteps.mock.calls.at(-1)!;
    expect(call[1][0]).toEqual({ command: "tapOn", params: { text: "Login" } });
  });

  it("taps by id", async () => {
    await callTool("tap", { appId: "com.test", target: "btn_login", isId: true });
    const call = mockMaestro.executeSteps.mock.calls.at(-1)!;
    expect(call[1][0]).toEqual({ command: "tapOn", params: { id: "btn_login" } });
  });

  it("taps by coordinates", async () => {
    await callTool("tap", { appId: "com.test", target: "unused", point: { x: 50, y: 100 } });
    const call = mockMaestro.executeSteps.mock.calls.at(-1)!;
    expect(call[1][0]).toEqual({ command: "tapOn", params: { point: "50,100" } });
  });

  it("includes retryCount when set", async () => {
    await callTool("tap", { appId: "com.test", target: "Flaky", retryCount: 3 });
    const call = mockMaestro.executeSteps.mock.calls.at(-1)!;
    expect(call[1][0].params.retryTapIfNoChange).toBe(3);
  });
});

// ── input_text ─────────────────────────────────────────────────────────────

describe("tool: input_text", () => {
  it("inputs text successfully", async () => {
    const result = await callTool("input_text", { appId: "com.test", text: "hello@test.com" });
    expect(result.isError).toBeFalsy();
    expect(getText(result)).toContain("text input");
  });
});

// ── swipe ──────────────────────────────────────────────────────────────────

describe("tool: swipe", () => {
  it("swipes by direction", async () => {
    const result = await callTool("swipe", { appId: "com.test", direction: "up" });
    expect(result.isError).toBeFalsy();
  });

  it("swipes by coordinates", async () => {
    const result = await callTool("swipe", { appId: "com.test", start: { x: 50, y: 80 }, end: { x: 50, y: 20 } });
    expect(result.isError).toBeFalsy();
  });

  it("fails when neither direction nor coordinates provided", async () => {
    const result = await callTool("swipe", { appId: "com.test" });
    expect(result.isError).toBe(true);
    expect(getText(result)).toContain("direction");
  });
});

// ── scroll ─────────────────────────────────────────────────────────────────

describe("tool: scroll", () => {
  it("scrolls down by default", async () => {
    const result = await callTool("scroll", { appId: "com.test" });
    expect(result.isError).toBeFalsy();
    const call = mockMaestro.executeSteps.mock.calls.at(-1)!;
    expect(call[1][0]).toEqual({ command: "scroll" });
  });

  it("scrolls until element visible", async () => {
    await callTool("scroll", { appId: "com.test", scrollUntilVisible: "Terms" });
    const call = mockMaestro.executeSteps.mock.calls.at(-1)!;
    expect(call[1][0].command).toBe("scrollUntilVisible");
    expect(call[1][0].params.element).toBe("Terms");
  });

  it("uses custom direction for scrollUntilVisible", async () => {
    await callTool("scroll", { appId: "com.test", scrollUntilVisible: "Footer", direction: "up" });
    const call = mockMaestro.executeSteps.mock.calls.at(-1)!;
    expect(call[1][0].params.direction).toBe("up");
  });
});

// ── assert_visible ─────────────────────────────────────────────────────────

describe("tool: assert_visible", () => {
  it("asserts visible by text (default)", async () => {
    await callTool("assert_visible", { appId: "com.test", target: "Welcome" });
    const call = mockMaestro.executeSteps.mock.calls.at(-1)!;
    expect(call[1][0]).toEqual({ command: "assertVisible", params: "Welcome" });
  });

  it("asserts NOT visible", async () => {
    await callTool("assert_visible", { appId: "com.test", target: "Error", visible: false });
    const call = mockMaestro.executeSteps.mock.calls.at(-1)!;
    expect(call[1][0].command).toBe("assertNotVisible");
  });

  it("asserts by id", async () => {
    await callTool("assert_visible", { appId: "com.test", target: "txt_welcome", isId: true });
    const call = mockMaestro.executeSteps.mock.calls.at(-1)!;
    expect(call[1][0].params).toEqual({ id: "txt_welcome" });
  });
});

// ── press_key ──────────────────────────────────────────────────────────────

describe("tool: press_key", () => {
  for (const key of ["back", "home", "enter"] as const) {
    it(`presses ${key} key`, async () => {
      const result = await callTool("press_key", { appId: "com.test", key });
      expect(result.isError).toBeFalsy();
      const call = mockMaestro.executeSteps.mock.calls.at(-1)!;
      expect(call[1][0]).toEqual({ command: "pressKey", params: key });
    });
  }
});

// ── erase_text ─────────────────────────────────────────────────────────────

describe("tool: erase_text", () => {
  it("erases all text by default", async () => {
    const result = await callTool("erase_text", { appId: "com.test" });
    expect(result.isError).toBeFalsy();
  });

  it("erases specific count", async () => {
    await callTool("erase_text", { appId: "com.test", count: 5 });
    const call = mockMaestro.executeSteps.mock.calls.at(-1)!;
    expect(call[1][0].params).toBe(5);
  });
});

// ── open_link ──────────────────────────────────────────────────────────────

describe("tool: open_link", () => {
  it("opens a URL", async () => {
    await callTool("open_link", { appId: "com.test", url: "https://example.com" });
    const call = mockMaestro.executeSteps.mock.calls.at(-1)!;
    expect(call[1][0]).toEqual({ command: "openLink", params: "https://example.com" });
  });

  it("opens a deep link", async () => {
    await callTool("open_link", { appId: "com.test", url: "myapp://product/123" });
    const call = mockMaestro.executeSteps.mock.calls.at(-1)!;
    expect(call[1][0].params).toBe("myapp://product/123");
  });
});

// ── set_location ───────────────────────────────────────────────────────────

describe("tool: set_location", () => {
  it("sets GPS coordinates", async () => {
    const result = await callTool("set_location", { appId: "com.test", latitude: 37.7749, longitude: -122.4194 });
    expect(result.isError).toBeFalsy();
    const call = mockMaestro.executeSteps.mock.calls.at(-1)!;
    expect(call[1][0].params).toEqual({ latitude: "37.7749", longitude: "-122.4194" });
  });
});

// ── take_screenshot ────────────────────────────────────────────────────────

describe("tool: take_screenshot", () => {
  it("takes a screenshot", async () => {
    const result = await callTool("take_screenshot");
    expect(result.isError).toBeFalsy();
    expect(getText(result)).toContain("screenshot.png");
    expect(mockMaestro.takeScreenshot).toHaveBeenCalled();
  });

  it("passes deviceId", async () => {
    await callTool("take_screenshot", { deviceId: "emulator-5554" });
    expect(mockMaestro.takeScreenshot).toHaveBeenCalledWith("emulator-5554");
  });
});

// ── run_flow ───────────────────────────────────────────────────────────────

describe("tool: run_flow", () => {
  it("runs flow from file path", async () => {
    const result = await callTool("run_flow", { filePath: "/tmp/test.yaml" });
    expect(result.isError).toBeFalsy();
    expect(mockMaestro.runFlow).toHaveBeenCalledWith("/tmp/test.yaml", undefined);
  });

  it("runs flow from YAML content", async () => {
    const result = await callTool("run_flow", { yamlContent: "appId: com.test\n---\n- scroll\n" });
    expect(result.isError).toBeFalsy();
  });

  it("fails when neither provided", async () => {
    const result = await callTool("run_flow");
    expect(result.isError).toBe(true);
    expect(getText(result)).toContain("yamlContent or filePath");
  });
});

// ── run_flow_on_multiple_devices ───────────────────────────────────────────

describe("tool: run_flow_on_multiple_devices", () => {
  it("runs flow on multiple devices", async () => {
    const result = await callTool("run_flow_on_multiple_devices", {
      appId: "com.test",
      steps: [{ command: "launchApp", params: "com.test" }],
      deviceIds: ["emulator-5554", "PIXEL6"],
    });
    expect(result.isError).toBeFalsy();
    expect(getText(result)).toContain("all devices OK");
  });

  it("reports failure when some devices fail", async () => {
    mockMaestro.executeStepsMultiDevice.mockResolvedValueOnce({
      yaml: "...",
      results: {
        "dev-A": { stdout: "OK", stderr: "", exitCode: 0 },
        "dev-B": { stdout: "", stderr: "Failed", exitCode: 1 },
      },
    });
    const result = await callTool("run_flow_on_multiple_devices", {
      appId: "com.test",
      steps: [{ command: "tapOn", params: "X" }],
      deviceIds: ["dev-A", "dev-B"],
    });
    expect(result.isError).toBe(true);
  });
});

// ── execute_flow_steps ─────────────────────────────────────────────────────

describe("tool: execute_flow_steps", () => {
  it("executes multi-step flow", async () => {
    const result = await callTool("execute_flow_steps", {
      appId: "com.test",
      steps: [
        { command: "launchApp", params: "com.test" },
        { command: "tapOn", params: "Login" },
        { command: "inputText", params: "user@test.com" },
      ],
    });
    expect(result.isError).toBeFalsy();
    expect(getText(result)).toContain("YAML:");
  });
});

// ── get_ui_hierarchy ───────────────────────────────────────────────────────

describe("tool: get_ui_hierarchy", () => {
  it("returns UI hierarchy", async () => {
    const result = await callTool("get_ui_hierarchy");
    expect(result.isError).toBeFalsy();
    expect(getText(result)).toContain("<hierarchy>");
  });
});

// ── maestro_command ────────────────────────────────────────────────────────

describe("tool: maestro_command", () => {
  it("runs raw command", async () => {
    const result = await callTool("maestro_command", { args: ["--version"] });
    expect(result.isError).toBeFalsy();
    expect(getText(result)).toContain("raw output");
    expect(mockMaestro.rawCommand).toHaveBeenCalledWith(["--version"]);
  });
});

// ── long_press ─────────────────────────────────────────────────────────────

describe("tool: long_press", () => {
  it("long presses by text", async () => {
    await callTool("long_press", { appId: "com.test", target: "Hold Me" });
    const call = mockMaestro.executeSteps.mock.calls.at(-1)!;
    expect(call[1][0]).toEqual({ command: "longPressOn", params: "Hold Me" });
  });

  it("long presses by id", async () => {
    await callTool("long_press", { appId: "com.test", target: "btn_hold", isId: true });
    const call = mockMaestro.executeSteps.mock.calls.at(-1)!;
    expect(call[1][0]).toEqual({ command: "longPressOn", params: { id: "btn_hold" } });
  });
});

// ── double_tap ─────────────────────────────────────────────────────────────

describe("tool: double_tap", () => {
  it("double taps by text", async () => {
    await callTool("double_tap", { appId: "com.test", target: "Image" });
    const call = mockMaestro.executeSteps.mock.calls.at(-1)!;
    expect(call[1][0]).toEqual({ command: "doubleTapOn", params: "Image" });
  });

  it("double taps by id", async () => {
    await callTool("double_tap", { appId: "com.test", target: "img_zoom", isId: true });
    const call = mockMaestro.executeSteps.mock.calls.at(-1)!;
    expect(call[1][0].params).toEqual({ id: "img_zoom" });
  });
});

// ── copy_text ──────────────────────────────────────────────────────────────

describe("tool: copy_text", () => {
  it("copies text by text selector", async () => {
    await callTool("copy_text", { appId: "com.test", target: "Order #12345" });
    const call = mockMaestro.executeSteps.mock.calls.at(-1)!;
    expect(call[1][0]).toEqual({ command: "copyTextFrom", params: "Order #12345" });
  });

  it("copies text by id", async () => {
    await callTool("copy_text", { appId: "com.test", target: "order_number", isId: true });
    const call = mockMaestro.executeSteps.mock.calls.at(-1)!;
    expect(call[1][0].params).toEqual({ id: "order_number" });
  });
});

// ── set_permissions ────────────────────────────────────────────────────────

describe("tool: set_permissions", () => {
  it("sets permissions map", async () => {
    await callTool("set_permissions", {
      appId: "com.test",
      permissions: { notifications: "allow", location: "deny" },
    });
    const call = mockMaestro.executeSteps.mock.calls.at(-1)!;
    expect(call[1][0].params).toEqual({ notifications: "allow", location: "deny" });
  });
});

// ── hide_keyboard ──────────────────────────────────────────────────────────

describe("tool: hide_keyboard", () => {
  it("hides keyboard", async () => {
    const result = await callTool("hide_keyboard", { appId: "com.test" });
    expect(result.isError).toBeFalsy();
    const call = mockMaestro.executeSteps.mock.calls.at(-1)!;
    expect(call[1][0]).toEqual({ command: "hideKeyboard" });
  });
});

// ── wait_for_animation ─────────────────────────────────────────────────────

describe("tool: wait_for_animation", () => {
  it("waits without timeout", async () => {
    await callTool("wait_for_animation", { appId: "com.test" });
    const call = mockMaestro.executeSteps.mock.calls.at(-1)!;
    expect(call[1][0]).toEqual({ command: "waitForAnimationToEnd", params: undefined });
  });

  it("waits with timeout", async () => {
    await callTool("wait_for_animation", { appId: "com.test", timeout: 5000 });
    const call = mockMaestro.executeSteps.mock.calls.at(-1)!;
    expect(call[1][0].params).toEqual({ timeout: 5000 });
  });
});

// ── stop_app ───────────────────────────────────────────────────────────────

describe("tool: stop_app", () => {
  it("stops app", async () => {
    const result = await callTool("stop_app", { appId: "com.test" });
    expect(result.isError).toBeFalsy();
    expect(getText(result)).toContain("app stopped");
    const call = mockMaestro.executeSteps.mock.calls.at(-1)!;
    expect(call[1][0]).toEqual({ command: "stopApp", params: "com.test" });
  });
});

// ── set_orientation ────────────────────────────────────────────────────────

describe("tool: set_orientation", () => {
  it("sets portrait", async () => {
    await callTool("set_orientation", { appId: "com.test", orientation: "portrait" });
    const call = mockMaestro.executeSteps.mock.calls.at(-1)!;
    expect(call[1][0].params).toBe("PORTRAIT");
  });

  it("sets landscape", async () => {
    await callTool("set_orientation", { appId: "com.test", orientation: "landscape" });
    const call = mockMaestro.executeSteps.mock.calls.at(-1)!;
    expect(call[1][0].params).toBe("LANDSCAPE");
  });
});
