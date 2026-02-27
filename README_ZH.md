# Maestro MCP Server

**[English](./README_EN.md)** | **[中文](./README_ZH.md)**

---

一个 [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) 服务器，让 AI 助手通过 [Maestro](https://maestro.dev/) 移动自动化框架控制 **Android** 和 **iOS** 设备与应用 —— 包括应用内的 **H5 / WebView** 页面。

```
┌─────────────┐       MCP (stdio)       ┌──────────────────┐      CLI      ┌─────────────────┐
│  AI 客户端    │ ◄───────────────────► │  Maestro MCP     │ ◄──────────► │  Maestro CLI     │
│  (Claude,    │                        │  Server          │              │                  │
│   ChatGPT,   │                        │                  │              │  ┌──────┐        │
│   Cursor...) │                        │  26 个工具        │              │  │ ADB  │ Android│
│              │                        │  多设备并发        │              │  ├──────┤        │
│              │                        │  WebView/H5      │              │  │Simctl│ iOS    │
└─────────────┘                        └──────────────────┘              └─────────────────┘
```

## 功能特性

- **26 个 MCP 工具** — 覆盖 Maestro 所有主要操作
- **多设备并发执行** — 在多台设备上同时运行相同的操作流程
- **WebView / H5 支持** — Maestro 原生支持 WebView 元素，无需额外配置
- **跨平台** — Android 真机/模拟器 + iOS 模拟器
- **全量 Maestro 命令覆盖** — 点击、滑动、滚动、输入、断言、深度链接、权限管理、截图等
- **原始 CLI 访问** — 通过 `maestro_command` 工具可执行任何 Maestro CLI 命令

## 环境要求

### 1. 安装 Maestro CLI

```bash
curl -fsSL "https://get.maestro.mobile.dev" | bash
```

> 需要 **Java 17+**。详见 [官方安装指南](https://docs.maestro.dev/getting-started/installing-maestro)。

验证安装：

```bash
maestro --version
```

### 2. 设备准备

**Android** — 启动模拟器或通过 USB 连接真机：

```bash
# 列出已连接设备
adb devices
```

> 详见 [Maestro Android 设置](https://docs.maestro.dev/get-started/supported-platform/android)

**iOS** — 启动 iOS 模拟器：

```bash
# 列出模拟器
xcrun simctl list devices
# 启动模拟器
xcrun simctl boot "iPhone 16"
```

> 详见 [Maestro iOS 设置](https://docs.maestro.dev/get-started/supported-platform/ios)

### 3. 安装 Node.js

需要 Node.js **18+**。从 [nodejs.org](https://nodejs.org/) 下载。

## 安装

```bash
git clone https://github.com/anthropics/maestro-mcp-server.git
cd maestro-mcp-server
npm install
npm run build
```

## 工具列表

| 工具 | 说明 |
|------|------|
| `check_environment` | 检查 Maestro CLI 是否安装及其版本 |
| `list_devices` | 列出所有已连接的 Android 设备和 iOS 模拟器 |
| `launch_app` | 通过包名/Bundle ID 启动应用 |
| `stop_app` | 停止正在运行的应用 |
| `tap` | 通过文本、ID 或坐标点击元素 |
| `double_tap` | 双击 UI 元素 |
| `long_press` | 长按 UI 元素 |
| `input_text` | 在当前聚焦的输入框中输入文本 |
| `erase_text` | 删除当前输入框中的字符 |
| `swipe` | 执行滑动手势（方向或坐标） |
| `scroll` | 滚动屏幕或滚动直到某元素可见 |
| `press_key` | 按设备按键（返回、主页、回车等） |
| `assert_visible` | 断言元素在屏幕上是否可见 |
| `open_link` | 打开 URL 或深度链接 |
| `set_location` | 设置 GPS 坐标 |
| `set_permissions` | 设置应用权限（相机、位置等） |
| `set_orientation` | 设置屏幕方向（竖屏/横屏） |
| `hide_keyboard` | 隐藏屏幕键盘 |
| `wait_for_animation` | 等待动画完成 |
| `take_screenshot` | 截取屏幕截图 |
| `copy_text` | 从 UI 元素复制文本 |
| `get_ui_hierarchy` | 获取当前 UI 元素层级树 |
| `run_flow` | 执行完整的 YAML 流程（字符串或文件路径） |
| `execute_flow_steps` | 从命令列表构建并执行多步骤流程 |
| `run_flow_on_multiple_devices` | 在多台设备上并发执行相同流程 |
| `maestro_command` | 执行任意 Maestro CLI 命令 |

## WebView / H5 支持

Maestro **原生**支持 Android 和 iOS 上的 WebView 元素。无需特殊配置。相同的命令（`tap`、`input_text`、`assert_visible` 等）同时适用于原生和 WebView/H5 元素。

Maestro 通过 Chrome DevTools Protocol 和 JavaScript 注入来与应用内的网页内容交互。详见 [Maestro WebView 文档](https://docs.maestro.dev/platform-support/web-views)。

**示例 — 与应用内 H5 页面交互：**

```
AI: 点击 H5 页面中的「立即购买」按钮
→ tool: tap(appId="com.example.app", target="立即购买")

AI: 在 H5 搜索框中输入搜索词
→ tool: tap(appId="com.example.app", target="搜索...")
→ tool: input_text(appId="com.example.app", text="无线耳机")
```

## 多设备并发执行

`run_flow_on_multiple_devices` 工具可在多台设备上**并行**执行相同的操作流程：

```
AI: 在三台设备上同时运行登录流程
→ tool: run_flow_on_multiple_devices(
    appId="com.example.app",
    steps=[
      {"command": "launchApp", "params": "com.example.app"},
      {"command": "tapOn", "params": "登录"},
      {"command": "inputText", "params": "user@test.com"},
      {"command": "tapOn", "params": "下一步"},
      {"command": "inputText", "params": "password123"},
      {"command": "tapOn", "params": "确认登录"}
    ],
    deviceIds=["emulator-5554", "emulator-5556", "ABCDE12345"]
  )
```

也可通过 `maestro_command` 工具使用 Maestro 原生分片能力：

```
# shard-all：在所有设备上运行全部测试
→ tool: maestro_command(args=["--shard-all", "3", "test", ".maestro/"])

# shard-split：将测试拆分到不同设备
→ tool: maestro_command(args=["--shard-split", "3", "test", ".maestro/"])
```

---

# AI 工具接入指南

以下是将此 MCP 服务器连接到主流 AI 工具的详细步骤。

---

## Claude Desktop

[Claude Desktop](https://claude.ai/download) 原生支持 MCP。

### 配置

编辑 Claude Desktop 配置文件：

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

> **重要**：`PATH` 环境变量必须包含 `maestro`、`adb` 和 `xcrun` 所在的目录。

### 使用

重启 Claude Desktop，你会看到一个锤子图标表示 MCP 工具已可用。直接对话即可：

> "在我的 Android 模拟器上启动设置应用并截图"

详见 [Claude Desktop MCP 指南](https://modelcontextprotocol.io/quickstart/user)。

---

## Claude Code (CLI)

[Claude Code](https://docs.anthropic.com/en/docs/claude-code) 原生支持 MCP 服务器。

### 配置

```bash
claude mcp add maestro -- node /absolute/path/to/maestro-mcp-server/dist/index.js
```

或添加到项目的 `.mcp.json`：

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

### 使用

```
> 列出所有连接的设备并启动设置应用
> 点击「显示」然后向下滚动到「深色模式」
```

详见 [Claude Code MCP 文档](https://docs.anthropic.com/en/docs/claude-code/mcp)。

---

## Cursor

[Cursor](https://cursor.com/) 的 AI 助手支持 MCP 服务器。

### 配置

打开 Cursor 设置 → Features → MCP Servers → Add New MCP Server：

- **Name**: `maestro`
- **Type**: `stdio`
- **Command**: `node /absolute/path/to/maestro-mcp-server/dist/index.js`

或添加到项目根目录的 `.cursor/mcp.json`：

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

### 使用

在 Cursor 的 Composer（Agent 模式）中询问：

> "检查 Maestro 是否已安装，列出设备，然后启动 com.android.settings"

详见 [Cursor MCP 文档](https://docs.cursor.com/context/model-context-protocol)。

---

## Windsurf (Codeium)

[Windsurf](https://codeium.com/windsurf) 通过 Cascade AI 支持 MCP 服务器。

### 配置

打开 Windsurf → Cascade → 锤子图标 → Configure → Add Server → Manual：

编辑 `~/.codeium/windsurf/mcp_config.json`：

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

### 使用

在 Cascade 中询问：

> "使用 Maestro 在连接的 Android 设备上测试我的应用的登录流程"

详见 [Windsurf MCP 文档](https://docs.codeium.com/windsurf/mcp)。

---

## ChatGPT (OpenAI)

OpenAI 已为 ChatGPT 添加了 [MCP 支持](https://openai.com/index/mcp-in-chatgpt/)。

> **注意**：ChatGPT 目前支持**远程 (HTTP)** MCP 服务器。要使用本 stdio 服务器，需要通过 HTTP 传输包装或使用代理工具如 [mcp-remote](https://www.npmjs.com/package/mcp-remote)。

### 通过 mcp-remote 配置

```bash
npx mcp-remote --stdio "node /absolute/path/to/maestro-mcp-server/dist/index.js"
```

详见 [OpenAI MCP 文档](https://platform.openai.com/docs/guides/tools-mcp)。

---

## VS Code (GitHub Copilot)

VS Code 通过 GitHub Copilot 的 Agent 模式支持 MCP 服务器。

### 配置

添加到 VS Code 设置（`.vscode/settings.json`）或用户设置：

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

或在项目中添加 `.vscode/mcp.json` 文件：

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

### 使用

在 Copilot Chat（Agent 模式）中询问：

> "@maestro 列出已连接的设备并启动计算器应用"

详见 [VS Code MCP 文档](https://code.visualstudio.com/docs/copilot/chat/mcp-servers)。

---

## Cline

[Cline](https://github.com/cline/cline) 是一个支持 MCP 的 VS Code 扩展。

### 配置

打开 Cline → MCP Servers → Configure MCP Servers：

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

### 使用

> "使用 Maestro 工具打开应用，导航到设置页面，并切换深色模式"

详见 [Cline MCP 文档](https://docs.cline.bot/mcp-servers/configuring-mcp-servers)。

---

## Trae

[Trae](https://www.trae.ai/) 的 AI Agent 支持 MCP。

### 配置

打开 Trae → Settings → MCP Servers → Add Server：

- **Type**: stdio
- **Command**: `node`
- **Args**: `/absolute/path/to/maestro-mcp-server/dist/index.js`

### 使用

> "检查 Maestro 环境，列出设备，并在第一台 Android 设备上运行登录测试"

详见 [Trae MCP 文档](https://docs.trae.ai/docs/mcp-servers)。

---

## 自定义 MCP 客户端

你可以使用 [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) 将此服务器集成到任何 MCP 兼容的客户端中：

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["/absolute/path/to/maestro-mcp-server/dist/index.js"],
});

const client = new Client({ name: "my-client", version: "1.0.0" });
await client.connect(transport);

// 列出可用工具
const tools = await client.listTools();
console.log(tools);

// 调用工具
const result = await client.callTool({
  name: "list_devices",
  arguments: {},
});
console.log(result);
```

详见 [MCP 规范](https://spec.modelcontextprotocol.io/) 和 [TypeScript SDK 文档](https://github.com/modelcontextprotocol/typescript-sdk)。

---

## 常见使用场景

### 1. AI 驱动的端到端测试

> "启动我的应用，使用测试账号登录，导航到个人资料页面，验证用户名是否正确显示"

### 2. 多设备兼容性测试

> "在三台已连接的设备上同时运行这个登录流程，并比较结果"

### 3. WebView / H5 页面交互

> "打开应用内浏览器，导航到结账页面，填写收货地址表单并提交"

### 4. 自动截图

> "分别截取应用的首页、个人资料、设置和通知页面的截图"

### 5. 深度链接测试

> "打开深度链接 myapp://product/12345 并验证商品详情页是否正确显示"

## 常见问题

### "maestro CLI not found"

确保 Maestro 已安装且在 `PATH` 中。MCP 配置中的 `env.PATH` 必须包含 `maestro` 安装目录（通常是 `~/.maestro/bin`）：

```json
{
  "env": {
    "PATH": "/Users/yourname/.maestro/bin:/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin"
  }
}
```

### "No devices found"（未找到设备）

- **Android**：确保 `adb` 正在运行 — `adb start-server`
- **iOS**：确保模拟器已启动 — `xcrun simctl boot "iPhone 16"`
- 运行 `check_environment` 和 `list_devices` 工具进行诊断

### 超时错误

部分流程可能需要较长时间。可使用 `maestro_command` 工具自定义超时时间，或调整流程使其更精简。

### WebView 元素未被识别

- 确保 WebView 已完全加载后再进行交互
- 在点击 WebView 元素之前使用 `wait_for_animation`
- 对于 Android，确保应用中已启用 WebView 调试
- 详见 [Maestro WebView 故障排查](https://docs.maestro.dev/platform-support/web-views)

## 参考资料

- [Maestro GitHub 仓库](https://github.com/mobile-dev-inc/Maestro)
- [Maestro 官方文档](https://docs.maestro.dev/)
- [Maestro CLI 参考](https://docs.maestro.dev/cli/cloud-and-cli-reference)
- [Maestro 流程命令](https://docs.maestro.dev/api-reference/commands)
- [MCP 规范](https://spec.modelcontextprotocol.io/)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)

## 开源协议

MIT
