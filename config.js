/**
 * 共享配置模块 - 统一管理默认配置
 * 避免 DEFAULT_CONFIG 在多个文件中重复定义
 */

// 默认配置
const DEFAULT_CONFIG = {
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
  popupWidth: 280
};

// 支持思考模式的模型列表（DeepSeek 等推理模型）
const MODELS_SUPPORT_THINKING = [
  'deepseek-reasoner',
  'deepseek-r1',
  'deepseek-r1-distill',
  'o1',
  'o1-mini',
  'o1-preview'
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
  return MODELS_SUPPORT_THINKING.some(m => modelName.toLowerCase().includes(m));
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
  window.DEFAULT_CONFIG = DEFAULT_CONFIG;
  window.MODELS_SUPPORT_THINKING = MODELS_SUPPORT_THINKING;
  window.ERROR_MESSAGES = ERROR_MESSAGES;
  window.getFriendlyErrorMessage = getFriendlyErrorMessage;
  window.modelSupportsThinking = modelSupportsThinking;
  window.loadConfig = loadConfig;
}
