# Maestro MCP Server

**[English](./README_EN.md)** | **[中文](./README_ZH.md)**

---

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that enables AI assistants to control **Android** and **iOS** devices and apps — including in-app **H5 / WebView** pages — through the [Maestro](https://maestro.dev/) mobile automation framework.

```
┌─────────────┐       MCP (stdio)       ┌──────────────────┐      CLI      ┌─────────────────┐
│  AI Client   │ ◄───────────────────► │  Maestro MCP     │ ◄──────────► │  Maestro CLI     │
│  (Claude,    │                        │  Server          │              │                  │
│   ChatGPT,   │                        │                  │              │  ┌──────┐        │
│   Cursor...) │                        │  28 tools        │              │  │ ADB  │ Android│
│              │                        │  Multi-device    │              │  ├──────┤        │
│              │                        │  WebView/H5      │              │  │Simctl│ iOS    │
└─────────────┘                        └──────────────────┘              └─────────────────┘
```

## Features

- **28 MCP tools** covering all major Maestro actions
- **Multi-device concurrent execution** — run the same flow on multiple devices simultaneously
- **WebView / H5 support** — Maestro natively handles WebView elements with no extra configuration
- **Cross-platform** — Android devices/emulators + iOS simulators
- **Full Maestro command coverage** — tap, swipe, scroll, input, assert, deep links, permissions, screenshots, and more
- **Raw CLI access** — escape hatch for any Maestro command not covered by a dedicated tool

## Prerequisites

### 1. Install Maestro CLI

```bash
curl -fsSL "https://get.maestro.mobile.dev" | bash
```

> Requires **Java 17+**. See the [official installation guide](https://docs.maestro.dev/getting-started/installing-maestro) for details.

Verify installation:

```bash
maestro --version
```

### 2. Device Setup

**Android** — start an emulator or connect a physical device via USB:

```bash
# List connected devices
adb devices
```

> See [Maestro Android setup](https://docs.maestro.dev/get-started/supported-platform/android)

**iOS** — boot an iOS simulator:

```bash
# List simulators
xcrun simctl list devices
# Boot a simulator
xcrun simctl boot "iPhone 16"
```

> See [Maestro iOS setup](https://docs.maestro.dev/get-started/supported-platform/ios)

### 3. Install Node.js

Node.js **18+** is required. Download from [nodejs.org](https://nodejs.org/).

## Installation

```bash
git clone https://github.com/fitz3897-dotcom/maestro-mcp-server.git
cd maestro-mcp-server
npm install
npm run build
```

## Available Tools

| Tool | Description |
|------|-------------|
| `check_environment` | Verify Maestro CLI installation and version |
| `list_devices` | List all connected Android devices and iOS simulators |
| `launch_app` | Launch an app by package/bundle ID |
| `stop_app` | Stop a running app |
| `tap` | Tap on an element by text, ID, or coordinates |
| `double_tap` | Double tap on a UI element |
| `long_press` | Long press on a UI element |
| `input_text` | Type text into the focused input field |
| `erase_text` | Erase characters from the focused text field |
| `swipe` | Perform swipe gestures (direction or coordinates) |
| `scroll` | Scroll the screen or scroll until an element is visible |
| `press_key` | Press device keys (back, home, enter, etc.) |
| `assert_visible` | Assert element visibility on screen |
| `open_link` | Open a URL or deep link |
| `set_location` | Set GPS coordinates |
| `set_permissions` | Set app permissions (camera, location, etc.) |
| `set_orientation` | Set screen orientation (portrait/landscape) |
| `hide_keyboard` | Hide the on-screen keyboard |
| `wait_for_animation` | Wait for animations to complete |
| `take_screenshot` | Capture a screenshot |
| `copy_text` | Copy text from a UI element |
| `get_ui_hierarchy` | Get the current UI element tree |
| `run_flow` | Execute a complete YAML flow (string or file) |
| `execute_flow_steps` | Build & execute a multi-step flow from a command list |
| `run_flow_on_multiple_devices` | Execute the same flow on multiple devices concurrently |
| `maestro_command` | Run any raw Maestro CLI command |

## WebView / H5 Support

Maestro **natively** handles WebView elements on both Android and iOS. No special configuration is needed. The same commands (`tap`, `input_text`, `assert_visible`, etc.) work for both native and WebView/H5 elements.

Maestro uses Chrome DevTools Protocol and JavaScript injection to interact with web content inside apps. For details, see [Maestro Web Views documentation](https://docs.maestro.dev/platform-support/web-views).

**Example — interact with an H5 page inside an app:**

```
AI: Use tap to click the "Shop Now" button inside the H5 page
→ tool: tap(appId="com.example.app", target="Shop Now")

AI: Type a search query in the H5 search box
→ tool: tap(appId="com.example.app", target="Search...")
→ tool: input_text(appId="com.example.app", text="wireless headphones")
```

## Multi-Device Concurrent Execution

The `run_flow_on_multiple_devices` tool runs identical flows on multiple devices **in parallel**:

```
AI: Run the login flow on all three devices simultaneously
→ tool: run_flow_on_multiple_devices(
    appId="com.example.app",
    steps=[
      {"command": "launchApp", "params": "com.example.app"},
      {"command": "tapOn", "params": "Sign In"},
      {"command": "inputText", "params": "user@test.com"},
      {"command": "tapOn", "params": "Next"},
      {"command": "inputText", "params": "password123"},
      {"command": "tapOn", "params": "Login"}
    ],
    deviceIds=["emulator-5554", "emulator-5556", "ABCDE12345"]
  )
```

You can also use Maestro's native sharding via the `maestro_command` tool:

```
# Shard-all: run all tests on all devices
→ tool: maestro_command(args=["--shard-all", "3", "test", ".maestro/"])

# Shard-split: split tests across devices
→ tool: maestro_command(args=["--shard-split", "3", "test", ".maestro/"])
```

---

# AI Tool Integration Guide

Below is a step-by-step guide for connecting this MCP server to popular AI tools.

---

## Claude Desktop

[Claude Desktop](https://claude.ai/download) has native MCP support.

### Configuration

Edit the Claude Desktop config file:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "maestro": {
      "command": "node",
      "args": ["/absolute/path/to/maestro-mcp-server/dist/index.js"],
      "env": {
        "PATH": "/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin"
      }
    }
  }
}
```

> **Important**: The `PATH` env must include the directories containing `maestro`, `adb`, and `xcrun` binaries.

### Usage

Restart Claude Desktop. You'll see a hammer icon indicating MCP tools are available. Then simply ask:

> "Launch the Settings app on my Android emulator and take a screenshot"

For more details, see the [Claude Desktop MCP guide](https://modelcontextprotocol.io/quickstart/user).

---

## Claude Code (CLI)

[Claude Code](https://docs.anthropic.com/en/docs/claude-code) supports MCP servers natively.

### Configuration

```bash
claude mcp add maestro -- node /absolute/path/to/maestro-mcp-server/dist/index.js
```

Or add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "maestro": {
      "command": "node",
      "args": ["/absolute/path/to/maestro-mcp-server/dist/index.js"],
      "env": {
        "PATH": "/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin"
      }
    }
  }
}
```

### Usage

```
> List all connected devices and launch the Settings app
> Tap on "Display" and scroll down to "Dark mode"
```

For more details, see the [Claude Code MCP documentation](https://docs.anthropic.com/en/docs/claude-code/mcp).

---

## Cursor

[Cursor](https://cursor.com/) supports MCP servers in its AI assistant.

### Configuration

Open Cursor Settings → Features → MCP Servers → Add New MCP Server:

- **Name**: `maestro`
- **Type**: `stdio`
- **Command**: `node /absolute/path/to/maestro-mcp-server/dist/index.js`

Or add to `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "maestro": {
      "command": "node",
      "args": ["/absolute/path/to/maestro-mcp-server/dist/index.js"],
      "env": {
        "PATH": "/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin"
      }
    }
  }
}
```

### Usage

In Cursor's Composer (Agent mode), ask:

> "Check if Maestro is installed, list devices, then launch com.android.settings"

For more details, see the [Cursor MCP documentation](https://docs.cursor.com/context/model-context-protocol).

---

## Windsurf (Codeium)

[Windsurf](https://codeium.com/windsurf) supports MCP servers via its Cascade AI.

### Configuration

Open Windsurf → Cascade → Hammer icon → Configure → Add Server → Manual:

Edit `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "maestro": {
      "command": "node",
      "args": ["/absolute/path/to/maestro-mcp-server/dist/index.js"],
      "env": {
        "PATH": "/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin"
      }
    }
  }
}
```

### Usage

In Cascade, ask:

> "Use Maestro to test the login flow of my app on the connected Android device"

For more details, see the [Windsurf MCP documentation](https://docs.codeium.com/windsurf/mcp).

---

## ChatGPT (OpenAI)

OpenAI has added [MCP support for ChatGPT](https://openai.com/index/mcp-in-chatgpt/) with remote MCP servers.

> **Note**: ChatGPT currently supports **remote (HTTP)** MCP servers. To use this stdio-based server with ChatGPT, you need to wrap it with an HTTP transport or use a proxy like [mcp-remote](https://www.npmjs.com/package/mcp-remote).

### Setup with mcp-remote

```bash
npx mcp-remote --stdio "node /absolute/path/to/maestro-mcp-server/dist/index.js"
```

For more details, see the [OpenAI MCP documentation](https://platform.openai.com/docs/guides/tools-mcp).

---

## VS Code (GitHub Copilot)

VS Code supports MCP servers through GitHub Copilot's agent mode.

### Configuration

Add to your VS Code settings (`.vscode/settings.json`) or user settings:

```json
{
  "mcp": {
    "servers": {
      "maestro": {
        "command": "node",
        "args": ["/absolute/path/to/maestro-mcp-server/dist/index.js"],
        "env": {
          "PATH": "/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin"
        }
      }
    }
  }
}
```

Or add a `.vscode/mcp.json` file in your project:

```json
{
  "servers": {
    "maestro": {
      "command": "node",
      "args": ["/absolute/path/to/maestro-mcp-server/dist/index.js"],
      "env": {
        "PATH": "/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin"
      }
    }
  }
}
```

### Usage

In Copilot Chat (Agent mode), ask:

> "@maestro list the connected devices and launch the calculator app"

For more details, see the [VS Code MCP documentation](https://code.visualstudio.com/docs/copilot/chat/mcp-servers).

---

## Cline

[Cline](https://github.com/cline/cline) is a VS Code extension with MCP support.

### Configuration

Open Cline → MCP Servers → Configure MCP Servers:

```json
{
  "mcpServers": {
    "maestro": {
      "command": "node",
      "args": ["/absolute/path/to/maestro-mcp-server/dist/index.js"],
      "env": {
        "PATH": "/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin"
      }
    }
  }
}
```

### Usage

> "Use the Maestro tools to open the app, navigate to settings, and toggle dark mode"

For more details, see the [Cline MCP documentation](https://docs.cline.bot/mcp-servers/configuring-mcp-servers).

---

## Trae

[Trae](https://www.trae.ai/) supports MCP for its AI agent.

### Configuration

Open Trae → Settings → MCP Servers → Add Server:

- **Type**: stdio
- **Command**: `node`
- **Args**: `/absolute/path/to/maestro-mcp-server/dist/index.js`

### Usage

> "Check the Maestro environment, list devices, and run a login test on the first Android device"

For more details, see the [Trae MCP documentation](https://docs.trae.ai/docs/mcp-servers).

---

## Custom MCP Client

You can integrate this server into any MCP-compatible client using the [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk):

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["/absolute/path/to/maestro-mcp-server/dist/index.js"],
});

const client = new Client({ name: "my-client", version: "1.0.0" });
await client.connect(transport);

// List available tools
const tools = await client.listTools();
console.log(tools);

// Call a tool
const result = await client.callTool({
  name: "list_devices",
  arguments: {},
});
console.log(result);
```

For more details, see the [MCP specification](https://spec.modelcontextprotocol.io/) and the [TypeScript SDK documentation](https://github.com/modelcontextprotocol/typescript-sdk).

---

## Common Use Cases

### 1. E2E Testing via AI

> "Launch my app, log in with test credentials, navigate to the profile page, and verify the username is displayed"

### 2. Multi-Device Compatibility Testing

> "Run this login flow on all three connected devices simultaneously and compare the results"

### 3. WebView / H5 Page Interaction

> "Open the in-app browser, navigate to the checkout page, fill in the shipping form, and submit"

### 4. Automated Screenshots

> "Take screenshots of the app's main screens: home, profile, settings, and notifications"

### 5. Deep Link Testing

> "Open the deep link myapp://product/12345 and verify the product details page is shown"

## Troubleshooting

### "maestro CLI not found"

Ensure Maestro is installed and available in your `PATH`. The `env.PATH` in the MCP config must include the directory where `maestro` is installed (usually `~/.maestro/bin`):

```json
{
  "env": {
    "PATH": "/Users/yourname/.maestro/bin:/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin"
  }
}
```

### "No devices found"

- **Android**: Ensure `adb` is running — `adb start-server`
- **iOS**: Ensure a simulator is booted — `xcrun simctl boot "iPhone 16"`
- Run `check_environment` and `list_devices` to diagnose

### "Timeout" errors

Some flows take longer than the default timeout. Use the `maestro_command` tool with custom timeout or adjust your flow to be more targeted.

### WebView elements not detected

- Ensure the WebView is fully loaded before interacting
- Use `wait_for_animation` before tapping WebView elements
- For Android, ensure WebView debugging is enabled in the app
- See [Maestro WebView troubleshooting](https://docs.maestro.dev/platform-support/web-views)

## Testing

The project includes **121 unit tests** across 3 test suites, using [Vitest](https://vitest.dev/).

### Run Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch
```

### Test Suites

| Suite | Tests | What it covers |
|-------|-------|----------------|
| `tests/yaml-builder.test.ts` | 32 | Pure-function tests for YAML generation: `escapeYaml` (special characters, empty strings), `formatValue` (strings, numbers, booleans, objects, null), `formatStep` (no-param, string, number, boolean, flat object, nested object, array params), `buildYaml` (header, separator, single/multi-step, complete login flow) |
| `tests/maestro-client.test.ts` | 28 | `MaestroClient` with mocked `child_process`: `checkInstallation` (installed/not found/empty stderr), `listDevices` (Android adb parsing, iOS simctl JSON parsing, both failing, malformed JSON, missing state field), `runFlow` (with/without device, failure), `executeSteps` (YAML generation + execution, device passthrough, failure), `executeStepsMultiDevice` (parallel execution, partial failures), `runSharded` (split/all strategies), `takeScreenshot` (default/device/custom path), `getHierarchy`, `launchStudio`, `rawCommand` |
| `tests/mcp-tools.test.ts` | 61 | Integration tests for all **28 MCP tools** via `InMemoryTransport`: tool registration count and names, argument validation (text/id/coordinates/direction), branch logic (clearState, scrollUntilVisible, assertNotVisible, orientation uppercase), error paths (swipe without params, run_flow without input, multi-device partial failure, check_environment not installed, list_devices empty), mock call verification for correct Maestro commands |

### Test Architecture

```
Tests mock at two levels:

1. maestro-client.test.ts  →  mocks child_process (execFile, spawn)
                               to verify CLI argument construction
                               and output parsing

2. mcp-tools.test.ts       →  mocks MaestroClient methods
                               to verify tool logic, argument mapping,
                               and MCP protocol compliance
                               (uses InMemoryTransport, no real I/O)
```

## References

- [Maestro GitHub](https://github.com/mobile-dev-inc/Maestro)
- [Maestro Documentation](https://docs.maestro.dev/)
- [Maestro CLI Reference](https://docs.maestro.dev/cli/cloud-and-cli-reference)
- [Maestro Flow Commands](https://docs.maestro.dev/api-reference/commands)
- [MCP Specification](https://spec.modelcontextprotocol.io/)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)

## License

MIT
