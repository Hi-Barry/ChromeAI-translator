/**
 * Background Service Worker - 处理翻译API调用
 * 支持 OpenAI API 格式及兼容服务（如 SiliconFlow、Azure 等）
 */

// 加载共享配置模块
importScripts('config.js');

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
 * 使用流式请求翻译（适用于思考模型开启思考模式时，避免超时）
 * 解析 SSE (Server-Sent Events) 格式，只提取 content，忽略 reasoning_content
 */
async function translateWithStreaming(url, headers, requestBody, maxTimeout = 120000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), maxTimeout);

  try {
    const streamingBody = { ...requestBody, stream: true };

    console.log('[AI Translator] Streaming request:', {
      url,
      model: requestBody.model
    });

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(streamingBody),
      signal: controller.signal
    });

    if (!response.ok) {
      clearTimeout(timeoutId);
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error.message || errorData.error.code || JSON.stringify(errorData.error);
        } else if (errorData.message) {
          errorMessage = errorData.message;
        }
      } catch (e) {
        // 无法解析错误响应体，使用默认消息
      }
      throw new Error(errorMessage);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // 保留可能不完整的最后一行

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;

        const data = trimmed.substring(6);
        if (data === '[DONE]') break;

        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta;
          if (delta?.content) {
            content += delta.content;
          }
          // 忽略 delta.reasoning_content（思考过程，翻译不需要）
        } catch (e) {
          // 跳过无法解析的 SSE 数据行
        }
      }
    }

    clearTimeout(timeoutId);

    if (!content || content.trim() === '') {
      throw new Error('翻译结果为空');
    }

    return content.trim();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(getFriendlyErrorMessage(error));
    }
    throw error;
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

  // 检测供应商和模型能力
  const provider = detectProvider(apiBaseUrl);
  const isThinkingModel = modelSupportsThinking(actualModel);
  // 思考模型且未关闭思考模式时，模型会输出大量 reasoning_content，容易超时，需用流式请求
  const needsStreaming = isThinkingModel && !disableThinking;

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

  // 根据供应商和模型能力添加思考模式参数
  // SiliconFlow: enable_thinking (boolean)
  // Anthropic: thinking: { type: 'disabled' }
  // 其他 OpenAI 兼容: enable_thinking (部分支持)
  if (isThinkingModel) {
    if (disableThinking) {
      // 关闭思考模式：根据供应商使用不同参数格式
      switch (provider) {
        case 'siliconflow':
          requestBody.enable_thinking = false;
          break;
        case 'anthropic':
          requestBody.thinking = { type: 'disabled' };
          break;
        default:
          // 其他 OpenAI 兼容 API 也尝试 enable_thinking
          requestBody.enable_thinking = false;
          break;
      }
      console.log(`[AI Translator] Thinking mode disabled for ${actualModel} (provider: ${provider})`);
    } else if (provider === 'siliconflow') {
      // SiliconFlow 显式启用思考模式
      requestBody.enable_thinking = true;
      console.log(`[AI Translator] Thinking mode enabled for ${actualModel} (streaming)`);
    }
  }

  const url = `${apiBaseUrl}/chat/completions`;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  };

  // 思考模型开启思考模式时，使用流式请求避免超时
  if (needsStreaming) {
    return await translateWithStreaming(url, headers, requestBody);
  }

  // ==================== 非流式请求路径 ====================
  const maxRetries = 2;
  let lastError = null;
  // 思考模型（已关闭思考）给更长的超时，普通模型30秒
  const timeout = isThinkingModel ? 60000 : 30000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // 指数退避：第一次重试等1秒，第二次等2秒
    if (attempt > 0) {
      const delay = attempt * 1000;
      console.log(`[AI Translator] Retry attempt ${attempt}/${maxRetries}, waiting ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    // 使用 AbortController 添加超时
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      console.log('[AI Translator] Request:', {
        url,
        model: actualModel,
        textLength: text.length,
        attempt: attempt + 1,
        streaming: false
      });

      const response = await fetch(url, {
        method: 'POST',
        headers,
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

      // 只取 content，忽略 reasoning_content（思考过程）
      const translation = data.choices[0].message.content;
      if (!translation || translation.trim() === '') {
        throw new Error('翻译结果为空');
      }

      return translation.trim();
    } catch (error) {
      clearTimeout(timeoutId);

      // AbortError 是超时错误，不重试
      if (error.name === 'AbortError') {
        throw new Error(getFriendlyErrorMessage(error));
      }

      // HTTP 4xx/5xx 错误不重试
      if (error.message.startsWith('HTTP')) {
        throw new Error(getFriendlyErrorMessage(error));
      }

      // 网络错误，记录并准备重试
      lastError = error;
      console.error(`[AI Translator] Network error (attempt ${attempt + 1}/${maxRetries + 1}):`, error.message);
    }
  }

  // 所有重试都失败了
  console.error('[AI Translator] All retries failed:', lastError);
  throw new Error(getFriendlyErrorMessage(lastError));
}

/**
 * 测试API连接
 */
async function testConnection(config) {
  const { apiKey, apiBaseUrl } = config;
  
  if (!apiKey) {
    throw new Error('API密钥未设置');
  }
  
  if (!isValidUrl(apiBaseUrl)) {
    throw new Error('API Base URL 格式无效');
  }
  
  const url = `${apiBaseUrl}/models`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(error.error?.message || `HTTP ${response.status}`);
    }
    
    return { success: true, message: '连接成功' };
  } catch (error) {
    clearTimeout(timeoutId);
    throw new Error(getFriendlyErrorMessage(error));
  }
}

// 监听来自 content script 或 options 页面的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'translate') {
    handleTranslation(request.text, sender.tab?.id)
      .then(result => sendResponse({ success: true, translation: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // 保持消息通道开放
  }
  
  if (request.action === 'testConnection') {
    testConnection(request.config)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

/**
 * 处理翻译请求
 */
async function handleTranslation(text, tabId) {
  const config = await loadConfig();
  return await translateWithAPI(text, config);
}

// 监听快捷键命令
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-translation') {
    try {
      // 获取当前活动标签页
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        // 向 content script 发送消息，触发翻译选中的文本
        chrome.tabs.sendMessage(tab.id, { action: 'trigger-translation' });
      }
    } catch (error) {
      console.error('[AI Translator] Command handler error:', error);
    }
  }
});

console.log('[AI Translator] Background service worker loaded');
