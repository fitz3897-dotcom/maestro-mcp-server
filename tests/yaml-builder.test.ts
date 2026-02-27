/**
 * Unit tests for YAML builder functions.
 * These are pure functions — no mocking or I/O needed.
 */

import { describe, it, expect } from "vitest";
import {
  buildYaml,
  formatStep,
  formatValue,
  escapeYaml,
  type FlowStep,
} from "../src/maestro-client.js";

// ── escapeYaml ─────────────────────────────────────────────────────────────

describe("escapeYaml", () => {
  it("returns plain strings unchanged", () => {
    expect(escapeYaml("hello")).toBe("hello");
  });

  it("escapes double quotes", () => {
    expect(escapeYaml('say "hi"')).toBe('say \\"hi\\"');
  });

  it("escapes backslashes", () => {
    expect(escapeYaml("path\\to\\file")).toBe("path\\\\to\\\\file");
  });

  it("escapes both backslashes and quotes together", () => {
    expect(escapeYaml('a\\"b')).toBe('a\\\\\\"b');
  });

  it("handles empty string", () => {
    expect(escapeYaml("")).toBe("");
  });

  it("handles string with only special characters", () => {
    expect(escapeYaml('"\\"')).toBe('\\"\\\\\\\"');
  });
});

// ── formatValue ────────────────────────────────────────────────────────────

describe("formatValue", () => {
  it("wraps strings in escaped quotes", () => {
    expect(formatValue("hello")).toBe('"hello"');
  });

  it("escapes quotes inside strings", () => {
    expect(formatValue('say "hi"')).toBe('"say \\"hi\\""');
  });

  it("converts numbers to string", () => {
    expect(formatValue(42)).toBe("42");
    expect(formatValue(3.14)).toBe("3.14");
    expect(formatValue(0)).toBe("0");
    expect(formatValue(-1)).toBe("-1");
  });

  it("converts booleans to string", () => {
    expect(formatValue(true)).toBe("true");
    expect(formatValue(false)).toBe("false");
  });

  it("JSON stringifies objects", () => {
    expect(formatValue({ a: 1 })).toBe('{"a":1}');
  });

  it("JSON stringifies arrays", () => {
    expect(formatValue([1, 2, 3])).toBe("[1,2,3]");
  });

  it("JSON stringifies null", () => {
    expect(formatValue(null)).toBe("null");
  });
});

// ── formatStep ─────────────────────────────────────────────────────────────

describe("formatStep", () => {
  it("formats command without params", () => {
    expect(formatStep({ command: "scroll" })).toBe("- scroll");
  });

  it("formats command with undefined params", () => {
    expect(formatStep({ command: "hideKeyboard", params: undefined })).toBe(
      "- hideKeyboard",
    );
  });

  it("formats command with null params", () => {
    expect(formatStep({ command: "hideKeyboard", params: null })).toBe(
      "- hideKeyboard",
    );
  });

  it("formats command with string params", () => {
    expect(formatStep({ command: "tapOn", params: "Login" })).toBe(
      '- tapOn: "Login"',
    );
  });

  it("escapes special characters in string params", () => {
    expect(formatStep({ command: "tapOn", params: 'Say "Hello"' })).toBe(
      '- tapOn: "Say \\"Hello\\""',
    );
  });

  it("formats command with number params", () => {
    expect(formatStep({ command: "eraseText", params: 5 })).toBe(
      "- eraseText: 5",
    );
  });

  it("formats command with boolean params", () => {
    expect(formatStep({ command: "setAirplaneMode", params: true })).toBe(
      "- setAirplaneMode: true",
    );
    expect(formatStep({ command: "setAirplaneMode", params: false })).toBe(
      "- setAirplaneMode: false",
    );
  });

  it("formats command with flat object params", () => {
    const result = formatStep({
      command: "tapOn",
      params: { text: "Login" },
    });
    expect(result).toBe('- tapOn:\n      text: "Login"');
  });

  it("formats command with multi-key object params", () => {
    const result = formatStep({
      command: "swipe",
      params: { direction: "up", duration: 500 },
    });
    expect(result).toContain("- swipe:");
    expect(result).toContain('      direction: "up"');
    expect(result).toContain("      duration: 500");
  });

  it("formats command with nested object params", () => {
    const result = formatStep({
      command: "tapOn",
      params: { point: { x: 50, y: 100 } },
    });
    expect(result).toContain("- tapOn:");
    expect(result).toContain("      point:");
    expect(result).toContain("        x: 50");
    expect(result).toContain("        y: 100");
  });

  it("formats command with mixed nested and flat params", () => {
    const result = formatStep({
      command: "swipe",
      params: { start: { x: 10, y: 20 }, duration: 300 },
    });
    expect(result).toContain("- swipe:");
    expect(result).toContain("      start:");
    expect(result).toContain("        x: 10");
    expect(result).toContain("        y: 20");
    expect(result).toContain("      duration: 300");
  });

  it("formats command with array params via JSON.stringify", () => {
    const result = formatStep({
      command: "custom",
      params: [1, 2, 3],
    });
    expect(result).toBe("- custom: [1,2,3]");
  });
});

// ── buildYaml ──────────────────────────────────────────────────────────────

describe("buildYaml", () => {
  it("builds YAML with appId header and separator", () => {
    const yaml = buildYaml("com.example.app", []);
    expect(yaml).toBe("appId: com.example.app\n---\n");
  });

  it("builds YAML with a single step", () => {
    const yaml = buildYaml("com.test.app", [
      { command: "launchApp", params: "com.test.app" },
    ]);
    expect(yaml).toBe(
      'appId: com.test.app\n---\n- launchApp: "com.test.app"\n',
    );
  });

  it("builds YAML with multiple steps", () => {
    const steps: FlowStep[] = [
      { command: "launchApp", params: "com.test.app" },
      { command: "tapOn", params: "Login" },
      { command: "inputText", params: "user@test.com" },
      { command: "tapOn", params: "Submit" },
    ];
    const yaml = buildYaml("com.test.app", steps);
    const lines = yaml.split("\n");
    expect(lines[0]).toBe("appId: com.test.app");
    expect(lines[1]).toBe("---");
    expect(lines[2]).toBe('- launchApp: "com.test.app"');
    expect(lines[3]).toBe('- tapOn: "Login"');
    expect(lines[4]).toBe('- inputText: "user@test.com"');
    expect(lines[5]).toBe('- tapOn: "Submit"');
  });

  it("builds YAML with no-param commands", () => {
    const yaml = buildYaml("com.test.app", [
      { command: "scroll" },
      { command: "hideKeyboard" },
    ]);
    expect(yaml).toContain("- scroll");
    expect(yaml).toContain("- hideKeyboard");
  });

  it("builds YAML with object-param commands", () => {
    const yaml = buildYaml("com.test.app", [
      { command: "tapOn", params: { id: "btn_login" } },
    ]);
    expect(yaml).toContain("- tapOn:");
    expect(yaml).toContain('      id: "btn_login"');
  });

  it("builds a complete login flow YAML", () => {
    const steps: FlowStep[] = [
      { command: "clearState", params: "com.example.app" },
      { command: "launchApp", params: "com.example.app" },
      { command: "tapOn", params: { id: "email_input" } },
      { command: "inputText", params: "test@example.com" },
      { command: "tapOn", params: { id: "password_input" } },
      { command: "inputText", params: "secret123" },
      { command: "tapOn", params: "Sign In" },
      { command: "assertVisible", params: "Welcome" },
    ];
    const yaml = buildYaml("com.example.app", steps);

    expect(yaml).toContain("appId: com.example.app");
    expect(yaml).toContain("---");
    expect(yaml).toContain('- clearState: "com.example.app"');
    expect(yaml).toContain('- launchApp: "com.example.app"');
    expect(yaml).toContain('      id: "email_input"');
    expect(yaml).toContain('- inputText: "test@example.com"');
    expect(yaml).toContain('- inputText: "secret123"');
    expect(yaml).toContain('- tapOn: "Sign In"');
    expect(yaml).toContain('- assertVisible: "Welcome"');
  });

  it("ends with a newline", () => {
    const yaml = buildYaml("com.test", [{ command: "scroll" }]);
    expect(yaml.endsWith("\n")).toBe(true);
  });
});
