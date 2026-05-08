/**
 * 共享配置模块 - 统一管理默认配置
 * 避免 DEFAULT_CONFIG 在多个文件中重复定义
 */

// ==================== 翻译模式枚举 ====================
const TRANSLATION_MODE = {
  LOCAL: 'local',     // Chrome 内置离线翻译 (TranslateKit，无需网络)
  REMOTE: 'remote'    // 远程大语言模型 API（需配置 API Key）
};

// ==================== Chrome 内置 AI 翻译语言码映射 ====================
// 将用户配置的语种代码（zh-CN 等）转换为内置 AI 使用的 BCP 47 短码
const BUILTIN_AI_LANG_MAP = {
  'zh-CN': 'zh',
  'zh-TW': 'zh-Hant',
  'en': 'en',
  'ja': 'ja',
  'ko': 'ko',
  'fr': 'fr',
  'de': 'de',
  'es': 'es',
  'ru': 'ru'
};

// 默认配置
const DEFAULT_CONFIG = {
  // 翻译模式：用户首选模式，实际使用请调用 getEffectiveMode()
  translationMode: TRANSLATION_MODE.REMOTE,
  apiKey: '',
  apiBaseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  customModel: '',
  targetLanguage: 'zh-CN',
  systemPrompt: '你是一个专业的翻译助手。请将用户提供的文本翻译成目标语言，只返回翻译结果，不要添加解释或其他内容。',
  disableThinking: true,
  // 翻译弹窗字体大小（px）
  fontSize: 14,
  // 翻译弹窗宽度（px）
  popupWidth: 280,
  // 翻译弹窗边框颜色（默认与翻译文字颜色一致#1a365d）
  popupBorderColor: '#1a365d',
  // 翻译弹窗边框宽度（px）
  popupBorderWidth: 2
};

// 支持思考模式的模型正则模式
// 匹配已知会输出 reasoning_content 的推理/思考模型
const THINKING_MODEL_PATTERNS = [
  /qwen3[\.\-]/i,                        // Qwen3-*, Qwen3.5-*
  /glm[\-\.\/\s]*(4\.[5-9]|5)/i,         // GLM-4.5+, GLM-5（不含 glm-4-9b 等旧模型）
  /deepseek[\-\.\/\s]*(r1|reasoner)/i,   // DeepSeek-R1, DeepSeek-Reasoner
  /deepseek[\-\.\/\s]*v3[\.\-]2/i,       // DeepSeek-V3.2
  /v3[\.\-]1[\-\.]terminus/i,            // V3.1-Terminus
  /hunyuan[\-\.\/\s]*a13b/i,             // Hunyuan-A13B
  /\bo1[\-\s\/]/i,                        // OpenAI o1-mini, o1-preview 等
  /\bo1$/i,                               // OpenAI o1
];

// 错误消息映射（用户友好的错误提示）
const ERROR_MESSAGES = {
  '401': 'API 密钥无效，请检查设置',
  '403': 'API 密钥权限不足',
  '404': 'API 地址或模型不存在',
  '429': '请求过于频繁，请稍后重试',
  '500': 'API 服务暂时不可用',
  '502': 'API 服务网关错误',
  '503': 'API 服务暂时不可用',
  'ENOTFOUND': '无法连接到 API 服务器，请检查网络',
  'ETIMEDOUT': '连接超时，请检查网络',
  'ECONNREFUSED': '服务器拒绝连接',
  'abort': '请求超时，请检查网络连接'
};

// Chrome 内置 AI 翻译（TranslateKit）相关配置
// 语言包管理页面
const ON_DEVICE_TRANSLATION_INTERNALS = 'chrome://on-device-translation-internals/';

// Chrome 内置 AI 翻译相关错误消息
const BUILTIN_AI_ERRORS = {
  'API_NOT_AVAILABLE': 'Chrome 内置翻译 API 不可用。请确保：\n1) Chrome 版本 ≥ 131\n2) 已开启 chrome://flags/#translation-api',
  'PACK_NOT_INSTALLED': '离线翻译语言包未安装。请在扩展设置页点击「安装语言包」下载。',
  'TIMEOUT': '翻译超时，请重试',
  'EMPTY_RESULT': '翻译结果为空，请重试',
  'UNSUPPORTED_LANGUAGE': '当前目标语言暂不支持离线翻译'
};

/**
 * 获取用户友好的错误消息
 */
function getFriendlyErrorMessage(error) {
  // 检查 HTTP 状态码
  for (const [code, msg] of Object.entries(ERROR_MESSAGES)) {
    if (error.message.includes(code) || error.message.includes(`${code}:`)) {
      return msg;
    }
  }
  
  // 检查网络错误
  if (error.name === 'AbortError' || error.message.includes('abort')) {
    return ERROR_MESSAGES['abort'];
  }
  
  // 默认返回原始错误消息
  return error.message;
}

/**
 * 检查模型是否支持思考模式
 */
function modelSupportsThinking(modelName) {
  return THINKING_MODEL_PATTERNS.some(pattern => pattern.test(modelName));
}

/**
 * 检测API供应商（基于 Base URL）
 * 用于决定思考模式参数格式等供应商差异
 */
function detectProvider(apiBaseUrl) {
  const url = apiBaseUrl.toLowerCase();
  if (url.includes('siliconflow')) return 'siliconflow';
  if (url.includes('anthropic')) return 'anthropic';
  if (url.includes('deepseek')) return 'deepseek';
  return 'openai-compatible';
}

/**
 * 将用户配置的语种代码映射为 Chrome 内置 AI 的 BCP 47 短码
 * @param {string} langCode - 用户配置的语种（如 'zh-CN', 'en'）
 * @returns {string} BCP 47 短码（如 'zh', 'en'）
 */
function mapToBuiltInAILanguage(langCode) {
  const mapped = BUILTIN_AI_LANG_MAP[langCode];
  if (mapped) return mapped;
  // 尝试取连字符前的部分
  const base = langCode.split('-')[0];
  return base || 'zh';
}

/**
 * 获取实际生效的翻译模式
 * 
 * 规则：
 * 1. 如果用户选择的模式是 LOCAL → 直接使用 LOCAL
 * 2. 如果用户选择的模式是 REMOTE 但未配置 API Key → 自动降级为 LOCAL
 * 3. 如果用户选择的模式是 REMOTE 且已配置 API Key → 使用 REMOTE
 * 
 * @param {Object} config - 用户配置（含 apiKey 和 translationMode）
 * @returns {string} TRANSLATION_MODE.LOCAL 或 TRANSLATION_MODE.REMOTE
 */
function getEffectiveMode(config) {
  if (!config) {
    return TRANSLATION_MODE.LOCAL;
  }

  // 用户选择了本地模式 → 直接本地
  if (config.translationMode === TRANSLATION_MODE.LOCAL) {
    return TRANSLATION_MODE.LOCAL;
  }

  // 用户选择了远程模式，但未配置 API Key → 自动降级
  if (!config.apiKey || config.apiKey.trim() === '') {
    return TRANSLATION_MODE.LOCAL;
  }

  // 用户选择了远程模式且已配置 Key
  return TRANSLATION_MODE.REMOTE;
}

/**
 * 从 chrome.storage.sync 获取完整配置（合并默认值）
 * 在 content script 和 background script 中均可使用
 */
async function loadConfig() {
  try {
    const result = await chrome.storage.sync.get(DEFAULT_CONFIG);
    return result;
  } catch (error) {
    console.error('[AI Translator] Failed to load config:', error);
    return { ...DEFAULT_CONFIG };
  }
}

// 导出配置（由于 Chrome Extension 不支持 ES Module，使用全局变量）
if (typeof window !== 'undefined') {
  window.TRANSLATION_MODE = TRANSLATION_MODE;
  window.BUILTIN_AI_LANG_MAP = BUILTIN_AI_LANG_MAP;
  window.ON_DEVICE_TRANSLATION_INTERNALS = ON_DEVICE_TRANSLATION_INTERNALS;
  window.DEFAULT_CONFIG = DEFAULT_CONFIG;
  window.THINKING_MODEL_PATTERNS = THINKING_MODEL_PATTERNS;
  window.ERROR_MESSAGES = ERROR_MESSAGES;
  window.BUILTIN_AI_ERRORS = BUILTIN_AI_ERRORS;
  window.getFriendlyErrorMessage = getFriendlyErrorMessage;
  window.modelSupportsThinking = modelSupportsThinking;
  window.detectProvider = detectProvider;
  window.mapToBuiltInAILanguage = mapToBuiltInAILanguage;
  window.getEffectiveMode = getEffectiveMode;
  window.loadConfig = loadConfig;
}
