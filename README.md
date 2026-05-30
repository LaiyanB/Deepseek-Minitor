# DeepSeek Usage Monitor / DeepSeek 用量监控

[English](#english) | [中文](#中文)

---

## English

A lightweight Windows desktop tray application for monitoring DeepSeek API usage in real-time.

### Features

- Real-time API usage monitoring via local HTTP proxy
- System tray integration with minimal footprint
- Token usage tracking and cost estimation
- Support for all DeepSeek models (chat, reasoner, coder, etc.)
- Configurable auto-start with Windows
- Multi-language support (English/Chinese)

### Prerequisites

- Windows 10/11
- Node.js 18+
- npm

### Installation

```bash
git clone https://github.com/LaiyanB/Deepseek-Minitor.git
cd Deepseek-Minitor
npm install
```

### Usage

```bash
# Build and start
npm start

# Development mode
npm run dev

# Run tests
npm test

# Build only
npm run build

# Smoke test (headless CI)
npm run smoke
```

### Configuration

The app stores configuration in:
- Windows: `%APPDATA%/deepseek-usage-monitor/config.json`

Configure your API key and proxy settings through the app's settings panel.

### How It Works

1. The app runs a local HTTP proxy server
2. Configure your DeepSeek API client to use this proxy
3. The monitor intercepts API calls and tracks usage
4. Real-time statistics are displayed in the system tray

### License

MIT

---

## 中文

一款轻量级的 Windows 桌面托盘应用，用于实时监控 DeepSeek API 使用情况。

### 功能特性

- 通过本地 HTTP 代理实时监控 API 使用
- 系统托盘集成，占用资源极少
- Token 用量追踪和费用估算
- 支持所有 DeepSeek 模型（chat、reasoner、coder 等）
- 可配置开机自启动
- 多语言支持（英文/中文）

### 系统要求

- Windows 10/11
- Node.js 18+
- npm

### 安装

```bash
git clone https://github.com/LaiyanB/Deepseek-Minitor.git
cd Deepseek-Minitor
npm install
```

### 使用方法

```bash
# 构建并启动
npm start

# 开发模式
npm run dev

# 运行测试
npm test

# 仅构建
npm run build

# 冒烟测试（无头 CI）
npm run smoke
```

### 配置

应用配置存储在：
- Windows: `%APPDATA%/deepseek-usage-monitor/config.json`

通过应用的设置面板配置 API 密钥和代理设置。

### 工作原理

1. 应用运行一个本地 HTTP 代理服务器
2. 配置你的 DeepSeek API 客户端使用此代理
3. 监控器拦截 API 调用并追踪使用情况
4. 实时统计数据显示在系统托盘中

### 许可证

MIT
