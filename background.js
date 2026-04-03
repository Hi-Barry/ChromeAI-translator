/**
 * Background Service Worker - 处理翻译API调用
 * 支持 OpenAI API 格式及兼容服务（如 SiliconFlow、Azure 等）
 */

// 默认配置
const DEFAULT_CONFIG = {
  apiBaseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  customModel: '',
  targetLanguage: 'zh-CN',
  systemPrompt: '你是一个专业的翻译助手。请将用户提供的文本翻译成目标语言，只返回翻译结果，不要添加解释或其他内容。',
  disableThinking: true
};

/**
 * 获取存储的配置
 */
async function getConfig() {
  try {
    const result = await chrome.storage.sync.get({
      apiKey: '',
      apiBaseUrl: DEFAULT_CONFIG.apiBaseUrl,
      model: DEFAULT_CONFIG.model,
      customModel: DEFAULT_CONFIG.customModel,
      targetLanguage: DEFAULT_CONFIG.targetLanguage,
      systemPrompt: DEFAULT_CONFIG.systemPrompt,
      disableThinking: DEFAULT_CONFIG.disableThinking
    });
    return result;
  } catch (error) {
    console.error('[AI Translator] Failed to get config:', error);
    return DEFAULT_CONFIG;
  }
}

/**
 * 验证URL格式
 */
function isValidUrl(urlString) {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * 调用API进行翻译
 * 兼容 OpenAI API 格式及 SiliconFlow 等第三方服务
 */
async function translateWithAPI(text, config) {
  const { apiKey, apiBaseUrl, model, customModel, targetLanguage, systemPrompt, disableThinking } = config;

  if (!apiKey) {
    throw new Error('API密钥未设置，请在扩展设置中配置');
  }

  // 验证apiBaseUrl格式
  if (!isValidUrl(apiBaseUrl)) {
    throw new Error('API Base URL 格式无效');
  }

  // 处理自定义模型：如果 model 是 'custom'，使用 customModel 的值
  const actualModel = model === 'custom' ? customModel : model;
  
  if (!actualModel) {
    throw new Error('模型未设置，请选择模型或输入自定义模型ID');
  }

  // 构建系统提示词
  const finalSystemPrompt = systemPrompt.includes('目标语言') || systemPrompt.includes('target language')
    ? systemPrompt
    : `${systemPrompt}\n目标语言：${targetLanguage}`;

  // 构建请求体（最简格式，兼容各种供应商）
  const requestBody = {
    model: actualModel,
    messages: [
      {
        role: 'system',
        content: finalSystemPrompt
      },
      {
        role: 'user',
        content: text
      }
    ]
  };

  // 关闭思考模式（适用于 DeepSeek 等支持思考的模型）
  if (disableThinking) {
    requestBody.thinking = { type: 'disabled' };
  }

  const url = `${apiBaseUrl}/chat/completions`;
  const maxRetries = 2;
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // 指数退避：第一次重试等1秒，第二次等2秒
    if (attempt > 0) {
      const delay = attempt * 1000;
      console.log(`[AI Translator] Retry attempt ${attempt}/${maxRetries}, waiting ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    // 使用 AbortController 添加30秒超时
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      console.log('[AI Translator] Request:', {
        url,
        model: model,
        textLength: text.length,
        attempt: attempt + 1
      });

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // 获取原始响应文本用于调试
      const responseText = await response.text();
      console.log('[AI Translator] Raw response:', responseText);

      // 4xx/5xx 业务错误不重试
      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const errorData = JSON.parse(responseText);
          if (errorData.error) {
            errorMessage = errorData.error.message || errorData.error.code || JSON.stringify(errorData.error);
          } else if (errorData.message) {
            errorMessage = errorData.message;
          }
        } catch (e) {
          if (responseText) {
            errorMessage = responseText.substring(0, 200);
          }
        }
        throw new Error(errorMessage);
      }

      // 解析成功响应
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        throw new Error('无法解析API响应: ' + responseText.substring(0, 100));
      }
      
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        console.error('[AI Translator] Invalid response structure:', data);
        throw new Error('API响应格式无效');
      }

      const translation = data.choices[0].message.content;
      if (!translation || translation.trim() === '') {
        throw new Error('翻译结果为空');
      }

      return translation.trim();
    } catch (error) {
      clearTimeout(timeoutId);

      // AbortError 是超时错误，不重试
      if (error.name === 'AbortError') {
        throw new Error('翻译请求超时，请检查网络连接');
      }

      // HTTP 4xx/5xx 错误不重试
      if (error.message.startsWith('HTTP')) {
        throw error;
      }

      // 网络错误，记录并准备重试
      lastError = error;
      console.error(`[AI Translator] Network error (attempt ${attempt + 1}/${maxRetries + 1}):`, error.message);
    }
  }

  // 所有重试都失败了
  console.error('[AI Translator] All retry attempts failed');
  throw lastError || new Error('翻译请求失败');
}

/**
 * 处理翻译请求
 */
async function handleTranslate(request) {
  try {
    const config = await getConfig();
    const translation = await translateWithAPI(request.text, config);
    return { translation };
  } catch (error) {
    console.error('[AI Translator] Translation error:', error);
    return { error: error.message };
  }
}

/**
 * 监听来自content script的消息
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'translate') {
    handleTranslate(request).then(sendResponse);
    return true; // 保持消息通道开启
  }
  return false;
});

/**
 * 监听快捷键命令
 */
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-translation') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'toggle-translation' });
      }
    });
  }
});

console.log('[AI Translator] Background service worker started');
