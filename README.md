# 🌐 AI翻译助手

一个基于 Chrome Extension Manifest V3 的浏览器翻译插件，支持使用 OpenAI API 兼容的大语言模型进行实时翻译。

## ✨ 功能特点

- **🖱️ 鼠标选择翻译**：选中任意网页文本，自动在右上角弹出翻译结果
- **🎨 极简现代UI**：清爽白色卡片设计，优雅动画效果
- **⚡ 快捷键支持**：`Ctrl+Shift+T` 触发翻译，`Esc` 关闭窗口
- **🔧 可自定义配置**：支持自定义 API 密钥、模型、目标语言和 System Prompt
- **🌐 多模型支持**：兼容所有 OpenAI API 格式的模型（OpenAI、Azure OpenAI、Gemini 等）

## 📁 文件结构

```
chrome-translator/
├── manifest.json          # 扩展配置文件（Manifest V3）
├── background.js          # Service Worker - 处理API调用
├── content.js             # 内容脚本 - 监听文本选择和显示弹窗
├── translator-popup.css   # 翻译弹窗样式
├── options.html           # 设置页面
├── options.js             # 设置页面逻辑
├── options.css            # 设置页面样式
├── icons/                 # 图标资源（需自行添加）
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
| gpt-4-turbo | GPT-4 优化版 |
| gpt-3.5-turbo | 经济实惠的选择 |
| 自定义 | 输入其他模型名称 |

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

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📧 联系方式

如有问题或建议，请通过以下方式联系：
- 提交 GitHub Issue
- 发送邮件到 [your-email@example.com]

---

**注意**：本扩展需要有效的 OpenAI API 密钥或兼容服务的 API 密钥才能正常使用。API 调用可能会产生费用，请注意使用额度。