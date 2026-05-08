# 🌐 AI翻译助手

一个基于 Chrome Extension Manifest V3 的浏览器翻译插件，支持 **Chrome 内置离线 AI 翻译**和 OpenAI 兼容大语言模型远程翻译。

## ✨ 功能特点

- **📦 Chrome 离线翻译**：使用 Chrome 内置 AI 翻译模型，**无需联网**，翻译完全在本地设备上进行，保护隐私
- **🤖 LLM 远程翻译**：支持 OpenAI API 兼容的大语言模型，翻译质量更高
- **🖱️ 鼠标选择翻译**：选中任意网页文本，自动弹出翻译结果
- **🎨 极简现代UI**：清爽白色卡片设计，优雅动画效果
- **⚡ 快捷键支持**：`Ctrl+Shift+T` 触发翻译，`Esc` 关闭窗口
- **🔧 可自定义配置**：支持自定义目标语言和翻译模式
- **🌐 多模型支持**：兼容所有 OpenAI API 格式的模型（OpenAI、SiliconFlow、DeepSeek 等）
- **🔍 连接测试**：设置页面一键测试 API 连接
- **🧠 智能思考模式**：自动检测推理模型，按需关闭思考模式

## ⚠️ 系统要求

### Chrome 离线翻译模式
- **Chrome 版本 ≥ 131**（建议 138+）
- 需要开启以下 Chrome Flags：
  - `chrome://flags/#translation-api` → **Enabled**
  - `chrome://flags/#language-detection-api` → **Enabled**
- 首次使用会自动下载翻译模型（约 50-100MB，需联网一次）
- 仅支持桌面端 Chrome（Windows / macOS / Linux）

### 远程 LLM 翻译模式
- 有效的 API 密钥（OpenAI 或兼容服务）
- 网络连接

## 📁 文件结构

```
chrome-translator/
├── manifest.json          # 扩展配置文件（Manifest V3）
├── config.js              # 共享配置模块（默认配置、语言码映射、错误消息）
├── background.js          # Service Worker - 翻译调度、API调用、快捷键
├── content.js             # 内容脚本 - 监听文本选择、LRU缓存、显示弹窗
├── translator-popup.css   # 翻译弹窗样式
├── options.html           # 设置页面
├── options.js             # 设置页面逻辑（含连接测试和内置AI检测）
├── options.css            # 设置页面样式
├── icons/                 # 图标资源
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
└── README.md              # 本文件
```

## 🚀 安装步骤

### 1. 准备 Chrome

如需使用离线翻译模式：
1. 打开 `chrome://flags/#translation-api`，设为 **Enabled**
2. 打开 `chrome://flags/#language-detection-api`，设为 **Enabled**
3. 重启 Chrome

### 2. 加载扩展到 Chrome

1. 打开 Chrome 浏览器，访问 `chrome://extensions/`
2. 开启右上角的"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择本项目文件夹
5. 扩展将自动安装并显示在工具栏

### 3. 配置设置

1. 点击扩展图标，选择"选项"（或右键扩展图标 → 选项）
2. 选择翻译模式：
   - **📦 Chrome 离线翻译** — 无需配置，直接使用
   - **🤖 远程翻译** — 需填写 API 配置
3. 远程模式需配置：
   - **API 密钥**：你的 API Key
   - **API Base URL**：API 服务端点
   - **模型**：选择使用的 AI 模型
4. 设置目标语言和翻译偏好

## ⚙️ 配置说明

### 翻译模式

| 模式 | 说明 | 是否需要网络 | 是否需要 API Key |
|------|------|:---:|:---:|
| 📦 Chrome 离线翻译 | 使用 Chrome 内置 AI，翻译在本地设备完成 | 仅首次下载模型 | ❌ |
| 🤖 远程翻译 | 调用远程大语言模型 API | ✅ | ✅ |

> 未配置 API 密钥时，系统自动降级为 Chrome 离线翻译。

### API 配置（远程翻译模式）

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| API 密钥 | OpenAI 或兼容服务的 API Key | - |
| API Base URL | API 服务端点 | `https://api.openai.com/v1` |

支持的 API 服务：
- OpenAI 官方 API
- SiliconFlow
- DeepSeek
- 其他兼容 OpenAI API 格式的服务

### 模型选择

| 模型 | 说明 |
|------|------|
| gpt-4o | 最新多模态模型，速度快质量高 |
| gpt-4o-mini | GPT-4o 轻量版，性价比高 |
| deepseek-chat | DeepSeek 通用对话模型 |
| deepseek-reasoner | DeepSeek 推理模型（支持思考模式开关） |
| 自定义 | 输入其他模型名称 |

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Shift+T` | 触发翻译（需先选中文本） |
| `Esc` | 关闭翻译弹窗 |

快捷键可在 `chrome://extensions/shortcuts` 中修改。

## 🛠️ 技术架构

### 两套翻译路径

**离线翻译（Chrome 内置 AI）：**
```
Content Script  ──►  Service Worker  ──►  chrome.scripting.executeScript
                                           (world: 'MAIN')
                                                  │
                                                  ▼
                                           window.Translator API
                                           (页面主世界，本地 AI 模型)
```

**远程翻译（LLM API）：**
```
Content Script  ──►  Service Worker  ──►  OpenAI 兼容 API (HTTPS)
```

### 核心技术

- **Manifest V3**：Chrome 扩展最新版本
- **Content Script**：注入网页监听文本选择事件
- **Service Worker**：后台翻译调度和 API 调用
- **chrome.scripting.executeScript (MAIN world)**：在页面主世界中调用 `window.Translator` API
- **Chrome Storage**：本地存储用户配置

## 🔒 安全说明

### 离线翻译模式
- ✅ 全部在本地设备完成，**内容不会离开浏览器**
- ✅ 无需 API 密钥
- ✅ 无需联网（除首次下载模型外）

### 远程翻译模式
- ⚠️ API 密钥存储在浏览器的 `chrome.storage` 中
- ⚠️ 翻译文本通过 HTTPS 发送至 API 服务端
- 适合**个人使用**，不建议公开分发

## 📝 使用示例

### 离线翻译
1. 确保 Chrome flags 已开启
2. 选择翻译模式为"Chrome 离线翻译"
3. 选中网页文本，翻译弹窗自动出现
4. 首次使用会下载翻译模型（一次性，约1分钟）

### 远程 LLM 翻译
1. 配置 API 密钥和模型
2. 选择翻译模式为"远程翻译"
3. 选中文本，由大语言模型进行高质量翻译

### 自定义翻译风格（远程模式）

在设置页面修改 System Prompt：

```
你是一位专业的技术文档翻译专家。请将以下文本翻译成简体中文，
保持专业术语的准确性，并使用流畅自然的表达方式。
```

## 🐛 故障排除

### Chrome 离线翻译失败

1. **"API 不可用"** — 确认 `chrome://flags/#translation-api` 已开启并重启 Chrome
2. **"模型未下载"** — 首次使用需联网下载模型，请确保网络连接正常
3. **"需要用户激活"** — 通过快捷键（Ctrl+Shift+T）触发首次翻译
4. **无痕模式** — 离线翻译在无痕模式下不可用
5. **Chrome 版本过低** — 需要 Chrome 131+，建议升级到最新版

### 远程翻译失败

1. 检查 API 密钥是否正确设置
2. 确认网络连接正常
3. 在设置页点击"测试连接"验证 API 配置
4. 查看控制台错误信息（F12 → Console）

### 扩展无法加载

1. 确认所有必要文件存在
2. 检查图标文件是否已添加
3. 验证 manifest.json 格式正确

### 快捷键不生效

1. 访问 `chrome://extensions/shortcuts`
2. 检查是否有快捷键冲突
3. 重新设置快捷键

## 📋 更新日志

### v1.4.0 (2026-05-08)

- 📦 **Chrome 离线翻译**：集成 Chrome 内置 AI 翻译 API（`window.Translator`），替代原有的 Google 在线翻译接口
- 🔒 **真正离线**：翻译完全在本地设备完成，内容不会离开浏览器
- 🎯 **架构升级**：通过 `chrome.scripting.executeScript(world: 'MAIN')` 在页面主世界中调用内置 AI API
- 🔍 **AI 可用性检测**：设置页面实时显示 Chrome 内置 AI 翻译是否可用
- 📝 **语言码适配**：支持 BCP 47 标准语言码（zh-Hant 等）
- 🗑️ **移除 Google 在线 API**：完全删除 `translate.googleapis.com` 调用

### v1.3.0 (2026-04-18)

- 🌐 **新增翻译模式**：Google 免费翻译 API（本地）和远程 LLM 翻译
- 🔄 **自动降级**：未配置 API Key 时自动使用 Google 翻译
- 🎨 **翻译模式切换 UI**：设置页面新增 Radio 卡片组

### v1.1.0 (2026-04-09)

- 🔧 **共享配置模块**：新增 `config.js`
- 🧠 **智能思考模式**：`disableThinking` 参数仅对支持思考的模型生效
- 🗂️ **LRU 缓存**：翻译缓存实现 LRU 策略，最大 100 条
- 🔍 **连接测试**：设置页面新增测试连接按钮
- 🌐 **新增模型**：支持 DeepSeek Chat / Reasoner

### v1.0.0 (2026-04-03)

- 🎉 初始版本发布

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📧 联系方式

如有问题或建议，请通过以下方式联系：
- 提交 GitHub Issue
