# Maestro MCP Server

**[English](./README_EN.md)** | **[中文](./README_ZH.md)**

---

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that enables AI assistants to control **Android** and **iOS** devices and apps — including in-app **H5 / WebView** pages — via the [Maestro](https://maestro.dev/) mobile automation framework.

一个 [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) 服务器，让 AI 助手通过 [Maestro](https://maestro.dev/) 移动自动化框架控制 **Android** 和 **iOS** 设备与应用 —— 包括应用内的 **H5 / WebView** 页面。

```
┌─────────────┐       MCP (stdio)       ┌──────────────────┐      CLI      ┌─────────────────┐
│  AI Client   │ ◄───────────────────► │  Maestro MCP     │ ◄──────────► │  Maestro CLI     │
│  (Claude,    │                        │  Server          │              │                  │
│   ChatGPT,   │                        │                  │              │  ┌──────┐        │
│   Cursor...) │                        │  26 tools        │              │  │ ADB  │ Android│
│              │                        │  Multi-device    │              │  ├──────┤        │
│              │                        │  WebView/H5      │              │  │Simctl│ iOS    │
└─────────────┘                        └──────────────────┘              └─────────────────┘
```

## Quick Start | 快速开始

```bash
# Install Maestro CLI | 安装 Maestro CLI
curl -fsSL "https://get.maestro.mobile.dev" | bash

# Clone & build | 克隆并构建
git clone https://github.com/fitz3897-dotcom/maestro-mcp-server.git
cd maestro-mcp-server
npm install
npm run build
```

## Documentation | 文档

| | English | 中文 |
|---|---------|------|
| Full README | [README_EN.md](./README_EN.md) | [README_ZH.md](./README_ZH.md) |
| Features | [Features](./README_EN.md#features) | [功能特性](./README_ZH.md#功能特性) |
| Tool List | [Available Tools](./README_EN.md#available-tools) | [工具列表](./README_ZH.md#工具列表) |
| AI Integration | [Integration Guide](./README_EN.md#ai-tool-integration-guide) | [AI 工具接入指南](./README_ZH.md#ai-工具接入指南) |
| Troubleshooting | [Troubleshooting](./README_EN.md#troubleshooting) | [常见问题](./README_ZH.md#常见问题) |
| Testing | [Testing](./README_EN.md#testing) | [测试](./README_ZH.md#测试) |

## Testing | 测试

```bash
npm test        # run all 115 tests
npm run test:watch  # watch mode
```

| Suite | Tests | Coverage |
|-------|-------|----------|
| `yaml-builder.test.ts` | 32 | YAML generation (escapeYaml, formatValue, formatStep, buildYaml) |
| `maestro-client.test.ts` | 28 | MaestroClient with mocked child_process |
| `mcp-tools.test.ts` | 55 | All 26 MCP tools via InMemoryTransport |

## License

MIT
