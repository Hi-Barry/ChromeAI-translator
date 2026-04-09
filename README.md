# 🌐 AI翻译助手

一个基于 Chrome Extension Manifest V3 的浏览器翻译插件，支持使用 OpenAI API 兼容的大语言模型进行实时翻译。

## ✨ 功能特点

- **🖱️ 鼠标选择翻译**：选中任意网页文本，自动在右上角弹出翻译结果
- **🎨 极简现代UI**：清爽白色卡片设计，优雅动画效果
- **⚡ 快捷键支持**：`Ctrl+Shift+T` 触发翻译，`Esc` 关闭窗口
- **🔧 可自定义配置**：支持自定义 API 密钥、模型、目标语言和 System Prompt
- **🌐 多模型支持**：兼容所有 OpenAI API 格式的模型（OpenAI、Azure OpenAI、Gemini、DeepSeek 等）
- **🔍 连接测试**：设置页面一键测试 API 连接是否正常
- **🧠 智能思考模式**：自动检测推理模型，按需关闭思考模式

## 📁 文件结构

```
chrome-translator/
├── manifest.json          # 扩展配置文件（Manifest V3）
├── config.js              # 共享配置模块（默认配置、错误消息映射、模型检测）
├── background.js          # Service Worker - 处理API调用、快捷键命令
├── content.js             # 内容脚本 - 监听文本选择、LRU缓存、显示弹窗
├── translator-popup.css   # 翻译弹窗样式
├── options.html           # 设置页面
├── options.js             # 设置页面逻辑（含连接测试）
├── options.css            # 设置页面样式
├── icons/                 # 图标资源
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
└── README.md              # 本文件
```

## 🚀 安装步骤

### 1. 准备图标

在 `icons/` 目录下添加以下尺寸的 PNG 图标：
- `icon-16.png` (16x16 像素)
- `icon-48.png` (48x48 像素)
- `icon-128.png` (128x128 像素)

可以使用在线工具生成图标，如：
- [Favicon.io](https://favicon.io/)
- [Canva](https://www.canva.com/)

### 2. 加载扩展到 Chrome

1. 打开 Chrome 浏览器，访问 `chrome://extensions/`
2. 开启右上角的"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择本项目文件夹
5. 扩展将自动安装并显示在工具栏

### 3. 配置设置

1. 点击扩展图标，选择"选项"（或右键扩展图标 → 选项）
2. 在设置页面配置以下信息：
   - **API 密钥**：你的 OpenAI API 密钥
   - **API Base URL**：默认使用 OpenAI 官方 API，可修改为第三方服务
   - **模型**：选择要使用的 AI 模型
   - **目标语言**：设置翻译目标语言
   - **System Prompt**：自定义翻译风格和行为

## ⚙️ 配置说明

### API 配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| API 密钥 | OpenAI 或兼容服务的 API Key | - |
| API Base URL | API 服务端点 | `https://api.openai.com/v1` |

支持的 API 服务：
- OpenAI 官方 API
- Azure OpenAI
- Google Gemini (OpenAI 兼容模式)
- 其他兼容 OpenAI API 格式的服务

### 模型选择

| 模型 | 说明 |
|------|------|
| gpt-4o | 最新多模态模型，速度快质量高 |
| gpt-4o-mini | GPT-4o 轻量版，性价比高 |
| deepseek-chat | DeepSeek 通用对话模型 |
| deepseek-reasoner | DeepSeek 推理模型（支持思考模式开关） |
| 自定义 | 输入其他模型名称 |

> 💡 **思考模式**：DeepSeek Reasoner 等推理模型默认会输出思考过程，可在设置中关闭以获得更快的翻译响应。

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Shift+T` | 触发翻译（需先选中文本） |
| `Esc` | 关闭翻译弹窗 |

快捷键可在 `chrome://extensions/shortcuts` 中修改。

## 🛠️ 技术架构

### 核心技术

- **Manifest V3**：Chrome 扩展最新版本
- **Content Script**：注入网页监听文本选择事件
- **Service Worker**：后台处理 API 调用
- **Chrome Storage**：本地存储用户配置

### 消息传递流程

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Content    │────▶│   Service    │────▶│   OpenAI    │
│  Script     │     │   Worker     │     │    API      │
└─────────────┘     └──────────────┘     └─────────────┘
       │                   │                     │
       │                   │◀────────────────────│
       │◀──────────────────│                     │
       │                   │                     │
┌──────▼───────────────────▼─────────────────────▼──────┐
│                   显示翻译结果                        │
└───────────────────────────────────────────────────────┘
```

## 🔒 安全说明

⚠️ **重要提示**：本扩展采用纯前端架构，API 密钥存储在浏览器的 `chrome.storage` 中。

- 适合**个人使用**，不建议公开分发
- 密钥仅在本地浏览器中存储
- 所有 API 请求通过 HTTPS 发送

如需更高安全性，建议：
1. 自建后端服务代理 API 请求
2. 使用浏览器扩展的加密存储功能

## 📝 使用示例

### 基础使用

1. 在任意网页选中文本
2. 松开鼠标，右上角自动弹出翻译窗口
3. 查看原文和翻译结果
4. 按 `Esc` 或点击关闭按钮关闭窗口

### 自定义翻译风格

在设置页面修改 System Prompt：

```
你是一位专业的技术文档翻译专家。请将以下文本翻译成简体中文，
保持专业术语的准确性，并使用流畅自然的表达方式。
```

## 🐛 故障排除

### 翻译失败

1. 检查 API 密钥是否正确设置
2. 确认网络连接正常
3. 查看控制台错误信息（F12 → Console）

### 扩展无法加载

1. 确认所有必要文件存在
2. 检查图标文件是否已添加
3. 验证 manifest.json 格式正确

### 快捷键不生效

1. 访问 `chrome://extensions/shortcuts`
2. 检查是否有快捷键冲突
3. 重新设置快捷键

## 📋 更新日志

### v1.1.0 (2026-04-09)

- 🔧 **共享配置模块**：新增 `config.js`，消除 `DEFAULT_CONFIG` 重复定义
- 🧠 **智能思考模式**：`disableThinking` 参数仅对支持思考的模型生效，避免污染其他模型请求
- 🗂️ **LRU 缓存**：翻译缓存实现 LRU 策略，限制最大 100 条，防止内存泄漏
- 🔍 **连接测试**：设置页面新增「测试连接」按钮，可一键验证 API 配置
- 💬 **友好错误消息**：常见 API 错误码映射为中文提示
- ⌨️ **快捷键实现**：`Ctrl+Shift+T` 快捷键实际生效
- 🎨 **文本格式保留**：翻译结果保留换行格式，不再丢失排版
- 🌐 **新增模型**：支持 DeepSeek Chat / Reasoner，新增 DeepSeek 预设 URL
- 💾 **localStorage 降级**：当 localStorage 不可用时自动降级为内存存储
- ✅ **输入校验**：保存时验证自定义模型名称是否填写

### v1.0.0 (2026-04-03)

- 🎉 初始版本发布

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📧 联系方式

如有问题或建议，请通过以下方式联系：
- 提交 GitHub Issue

---

**注意**：本扩展需要有效的 OpenAI API 密钥或兼容服务的 API 密钥才能正常使用。API 调用可能会产生费用，请注意使用额度。

---

# 🌐 AI Translator

A Chrome Extension based on Manifest V3 that provides real-time translation using OpenAI API-compatible large language models.

## ✨ Features

- **🖱️ Text Selection Translation**: Select any text on a webpage, translation appears in top-right corner
- **🎨 Minimalist Modern UI**: Clean white card design with smooth animations
- **⚡ Keyboard Shortcuts**: `Ctrl+Shift+T` to trigger translation, `Esc` to close
- **🔧 Customizable**: API key, model, target language, and System Prompt
- **🌐 Multi-Model Support**: Compatible with all OpenAI API format models (OpenAI, Azure OpenAI, Gemini, etc.)

## 📁 File Structure

```
chrome-translator/
├── manifest.json          # Extension configuration (Manifest V3)
├── config.js              # Shared config (defaults, error mapping, model detection)
├── background.js          # Service Worker - API calls, keyboard commands
├── content.js             # Content Script - text selection, LRU cache, popup
├── translator-popup.css   # Popup styles
├── options.html           # Settings page
├── options.js             # Settings logic (with connection test)
├── options.css            # Settings styles
├── icons/                 # Icon resources
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
└── README.md              # This file
```

## 🚀 Installation

### 1. Prepare Icons

Add PNG icons to `icons/` directory:
- `icon-16.png` (16x16 pixels)
- `icon-48.png` (48x48 pixels)
- `icon-128.png` (128x128 pixels)

Use online tools like:
- [Favicon.io](https://favicon.io/)
- [Canva](https://www.canva.com/)

### 2. Load Extension in Chrome

1. Open Chrome, visit `chrome://extensions/`
2. Enable "Developer mode" (top-right)
3. Click "Load unpacked"
4. Select this project folder
5. Extension will install and appear in toolbar

### 3. Configure

1. Click extension icon → "Options" (or right-click → Options)
2. Configure on settings page:
   - **API Key**: Your OpenAI API key
   - **API Base URL**: Default OpenAI API, can change to third-party
   - **Model**: AI model to use
   - **Target Language**: Translation target
   - **System Prompt**: Custom translation style

## ⚙️ Configuration

### API Settings

| Setting | Description | Default |
|---------|-------------|---------|
| API Key | OpenAI or compatible service API Key | - |
| API Base URL | API endpoint | `https://api.openai.com/v1` |

Supported services:
- OpenAI Official API
- Azure OpenAI
- Google Gemini (OpenAI compatible mode)
- Other OpenAI-compatible services

### Model Options

| Model | Description |
|-------|-------------|
| gpt-4o | Latest multimodal, fast & high quality |
| gpt-4o-mini | Lightweight, cost-effective |
| gpt-4-turbo | Optimized GPT-4 |
| gpt-3.5-turbo | Budget-friendly |
| Custom | Enter other model names |

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+T` | Trigger translation (select text first) |
| `Esc` | Close translation popup |

Modify at `chrome://extensions/shortcuts`.

## 🛠️ Architecture

### Core Technologies

- **Manifest V3**: Latest Chrome extension version
- **Content Script**: Inject into webpage, listen for text selection
- **Service Worker**: Handle API calls in background
- **Chrome Storage**: Local user configuration storage

### Message Flow

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Content    │────▶│   Service    │────▶│   OpenAI    │
│  Script     │     │   Worker     │     │    API      │
└─────────────┘     └──────────────┘     └─────────────┘
       │                   │                     │
       │                   │◀────────────────────│
       │◀──────────────────│                     │
       │                   │                     │
┌──────▼───────────────────▼─────────────────────▼──────┐
│                   Display Translation                 │
└───────────────────────────────────────────────────────┘
```

## 🔒 Security

⚠️ **Important**: This extension is pure frontend, API keys stored in browser's `chrome.storage`.

- **Personal use recommended**, not for public distribution
- Keys stored only in local browser
- All API requests via HTTPS

For higher security:
1. Build backend proxy for API requests
2. Use encrypted storage for extension

## 📝 Usage

### Basic Usage

1. Select text on any webpage
2. Release mouse, translation popup appears in top-right
3. View original and translated text
4. Press `Esc` or click close button

### Custom Translation Style

Modify System Prompt in settings:

```
You are a professional technical document translator. Translate the following 
text into Simplified Chinese, maintaining accuracy of technical terminology 
and using natural, fluent expression.
```

## 🐛 Troubleshooting

### Translation Failed

1. Check API key is correct
2. Verify network connection
3. Check console errors (F12 → Console)

### Extension Won't Load

1. Ensure all required files exist
2. Check icon files are added
3. Verify manifest.json format

### Shortcuts Not Working

1. Visit `chrome://extensions/shortcuts`
2. Check for conflicts
3. Reconfigure shortcut

## 📄 License

MIT License

## 🤝 Contributing

Issues and Pull Requests welcome!

## 📧 Contact

For issues or suggestions:
- Submit GitHub Issue

---

**Note**: Requires valid OpenAI API key or compatible service API key. API calls may incur charges, please monitor usage.