/**
 * Background Service Worker - 处理翻译API调用
 * 支持两种翻译模式：
 *   1. Chrome 内置离线 AI 翻译（通过注入页面主世界访问 Translator API）
 *   2. OpenAI 兼容远程 API 翻译（LLM）
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
 * 调用远程 LLM API 进行翻译
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
  if (isThinkingModel) {
    if (disableThinking) {
      switch (provider) {
        case 'siliconflow':
          requestBody.enable_thinking = false;
          break;
        case 'anthropic':
          requestBody.thinking = { type: 'disabled' };
          break;
        default:
          requestBody.enable_thinking = false;
          break;
      }
      console.log(`[AI Translator] Thinking mode disabled for ${actualModel} (provider: ${provider})`);
    } else if (provider === 'siliconflow') {
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
  const timeout = isThinkingModel ? 60000 : 30000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = attempt * 1000;
      console.log(`[AI Translator] Retry attempt ${attempt}/${maxRetries}, waiting ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

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

      const responseText = await response.text();
      console.log('[AI Translator] Raw response:', responseText);

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

      if (error.name === 'AbortError') {
        throw new Error(getFriendlyErrorMessage(error));
      }

      if (error.message.startsWith('HTTP')) {
        throw new Error(getFriendlyErrorMessage(error));
      }

      lastError = error;
      console.error(`[AI Translator] Network error (attempt ${attempt + 1}/${maxRetries + 1}):`, error.message);
    }
  }

  console.error('[AI Translator] All retries failed:', lastError);
  throw new Error(getFriendlyErrorMessage(lastError));
}

// ==================== Chrome 内置离线 AI 翻译 ====================

/**
 * 使用 Chrome 内置 AI 进行离线翻译
 * 
 * 通过 chrome.scripting.executeScript 将翻译逻辑注入到页面的 MAIN world 中执行，
 * 因为 Translator API 仅在页面主世界（window 对象上）可用，
 * 在 Service Worker 和 isolated content script 中不可用。
 * 
 * @param {string} text - 要翻译的文本
 * @param {string} targetLanguage - 目标语言代码（如 'zh-CN', 'en'）
 * @param {number} tabId - 当前活动标签页 ID
 * @returns {Promise<string>} 翻译后的文本
 */
async function translateWithBuiltInAI(text, targetLanguage, tabId) {
  if (!text || text.trim() === '') {
    throw new Error('翻译文本不能为空');
  }

  if (!tabId) {
    throw new Error('无法获取当前页面，请重试');
  }

  const targetLang = mapToBuiltInAILanguage(targetLanguage);

  console.log('[AI Translator] Built-in AI translation request:', {
    textLength: text.length,
    targetLanguage: targetLang
  });

  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        world: 'MAIN', // 必须在页面主世界中执行，才能访问 window.Translator
        func: injectBuiltInTranslate,
        args: [text, targetLang]
      },
      (results) => {
        if (chrome.runtime.lastError) {
          console.error('[AI Translator] executeScript error:', chrome.runtime.lastError);
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        const result = results?.[0]?.result;
        if (result?.error) {
          reject(new Error(result.error));
          return;
        }

        if (!result?.translation) {
          reject(new Error(BUILTIN_AI_ERRORS.EMPTY_RESULT));
          return;
        }

        resolve(result.translation);
      }
    );
  });
}

/**
 * 注入到页面主世界执行的翻译函数
 * 
 * 重要：此函数会被序列化后注入到页面中执行，必须完全自包含，
 * 不能引用任何外部变量、闭包或扩展 API。
 * 
 * 支持两种 API 命名空间：
 *   - window.Translator（Chrome 138+ 正式 API）
 *   - window.ai.translator（Chrome 131-137 实验阶段）
 * 
 * @param {string} text - 要翻译的文本
 * @param {string} targetLang - BCP 47 目标语言码（如 'zh', 'en'）
 * @returns {{translation?: string, error?: string}}
 */
function injectBuiltInTranslate(text, targetLang) {
  // 内置超时常量（自包含，不依赖 config.js 的导出）
  var TIMEOUTS = {
    TRANSLATOR_CREATE: 30000,   // Translator 初始化超时
    TRANSLATOR_EXECUTE: 30000,  // 翻译执行超时
    AVAILABILITY_CHECK: 5000    // availability 检查超时
  };

  // 获取 Translator API（兼容新旧命名空间）
  function getTranslatorAPI() {
    if (typeof window.Translator !== 'undefined' && typeof window.Translator.create === 'function') {
      return window.Translator;
    }
    if (window.ai && window.ai.translator && typeof window.ai.translator.create === 'function') {
      return window.ai.translator;
    }
    return null;
  }

  // 带超时的 Promise 包装
  function withTimeout(promise, ms, errorMessage) {
    return Promise.race([
      promise,
      new Promise(function (_, reject) {
        setTimeout(function () { reject(new Error(errorMessage)); }, ms);
      })
    ]);
  }

  /**
   * 格式化错误信息为人类可读的诊断报告
   * @param {Error} err - create() 抛出的原始错误
   * @param {string} diagnosis - availability 返回的诊断值
   * @param {string} sourceLang - 检测到的源语言
   * @returns {string} 格式化的错误消息
   */
  function formatDiagnosticError(err, diagnosis, sourceLang) {
    var errName = err.name || 'Error';
    var errMsg = err.message || '未知错误';

    var parts = [];
    parts.push('离线翻译失败');
    parts.push('');
    parts.push('【技术诊断】');
    parts.push('  API 状态 (availability): ' + diagnosis);
    parts.push('  源语言: ' + sourceLang + ' → 目标语言: ' + targetLang);
    parts.push('  错误类型: ' + errName);
    parts.push('  错误详情: ' + errMsg);

    // 常见错误类型给出针对性建议
    if (errName === 'NotAllowedError' || errMsg.indexOf('user activation') !== -1 || errMsg.indexOf('gesture') !== -1) {
      parts.push('');
      parts.push('【可能原因】需要用户交互授权');
      parts.push('  请先点击页面任意位置，再选中文本进行翻译。');
    } else if (errName === 'NotReadableError') {
      parts.push('');
      parts.push('【可能原因】模型文件正在下载或已损坏');
      parts.push('  请访问 chrome://on-device-translation-internals/ 重新安装语言包。');
    } else if (diagnosis === 'readily' || diagnosis === 'available') {
      parts.push('');
      parts.push('【注意】语言包显示已安装（availability=' + diagnosis + '），但初始化失败。');
      parts.push('  这通常是因为：');
      parts.push('  1) 模型正在加载到内存中（首次使用需 20-30 秒）');
      parts.push('  2) 需要在页面上有用户交互操作');
      parts.push('  请稍等片刻后重试，或访问 chrome://on-device-translation-internals/ 检查。');
    } else if (diagnosis === 'check_failed') {
      parts.push('');
      parts.push('【可能原因】无法检查语言包状态，API 可能未初始化完成');
      parts.push('  请确保已开启 chrome://flags/#translation-api 并重启浏览器。');
    }

    return parts.join('\n');
  }

  return (function () {
    return (async function () {
      try {
        // 1. 检查 API 可用性
        var TranslatorAPI = getTranslatorAPI();
        if (!TranslatorAPI) {
          return {
            error: 'Chrome 内置翻译 API 不可用。请确保：\n1) Chrome 版本 ≥ 131\n2) 已开启 chrome://flags/#translation-api\n3) 非无痕模式'
          };
        }

        // 2. 构建 create() 参数
        //    关键修复：不指定 sourceLanguage，让 API 自动检测源语言。
        //    这样避免了：
        //    - LanguageDetector 检测不准导致 source=target 同语言翻译失败
        //    - 额外的 LanguageDetector 调用消耗 user activation 时间窗口
        var createOptions = {
          targetLanguage: targetLang
        };

        // 3. 尝试 create()，带 monitor 回调跟踪下载进度
        var translator;
        var createErr = null;
        try {
          console.log('[Built-in AI] Calling Translator.create({ targetLanguage: "' + targetLang + '" })');
          translator = await withTimeout(
            TranslatorAPI.create(createOptions),
            TIMEOUTS.TRANSLATOR_CREATE,
            '翻译器初始化超时（' + (TIMEOUTS.TRANSLATOR_CREATE / 1000) + '秒）'
          );
        } catch (err) {
          createErr = err;
          console.error('[Built-in AI] Translator.create() failed:', err.name, err.message);
        }

        // 4. 如果 create() 成功，直接翻译
        if (translator) {
          console.log('[Built-in AI] Translator created, translating...');
          var result = await withTimeout(
            translator.translate(text),
            TIMEOUTS.TRANSLATOR_EXECUTE,
            '翻译执行超时（' + (TIMEOUTS.TRANSLATOR_EXECUTE / 1000) + '秒）'
          );

          if (!result || result.trim() === '') {
            return { error: '翻译结果为空，请重试' };
          }

          return { translation: result.trim() };
        }

        // 5. create() 失败 → 查 availability 做诊断
        var diagnosis = 'unknown';
        if (TranslatorAPI.availability) {
          try {
            diagnosis = await withTimeout(
              TranslatorAPI.availability({ targetLanguage: targetLang }),
              TIMEOUTS.AVAILABILITY_CHECK,
              '可用性检测超时'
            );
          } catch (e) {
            diagnosis = 'check_failed';
            console.error('[Built-in AI] availability check failed:', e.message);
          }
        }

        // 6. 根据 diagnosis 给出精准错误
        if (diagnosis === 'after-download' || diagnosis === 'downloadable') {
          return {
            error: '离线翻译语言包未安装。请在扩展设置页点击「安装语言包」下载。\n\n' +
                   '或直接访问：chrome://on-device-translation-internals/'
          };
        }
        if (diagnosis === 'unavailable') {
          return {
            error: '语言对 (auto → ' + targetLang + ') 暂不支持离线翻译'
          };
        }

        // readily / available / unknown / check_failed → 输出完整诊断报告
        var sourceRef = 'auto';
        return {
          error: formatDiagnosticError(createErr, diagnosis, sourceRef)
        };
      } catch (error) {
        console.error('[Built-in AI] Translation error:', error);
        return { error: '翻译失败：' + (error.message || '未知错误') };
      }
    })();
  })();
}

// ==================== 测试连接 ====================

/**
 * 测试 API 连接（仅适用于远程 LLM 模式）
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

// ==================== 消息监听 ====================

// 监听来自 content script 或 options 页面的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'translate') {
    const tabId = sender.tab?.id;
    handleTranslation(request.text, tabId)
      .then(result => sendResponse({
        success: true,
        translation: result.translation,
        mode: result.mode
      }))
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
 * 根据实际生效的翻译模式路由到 Chrome 内置 AI 或远程 LLM
 * 返回 { translation, mode } 以便下游（如 content.js 缓存）区分模式
 */
async function handleTranslation(text, tabId) {
  const config = await loadConfig();
  const effectiveMode = getEffectiveMode(config);

  console.log('[AI Translator] Translation request:', {
    textLength: text.length,
    effectiveMode,
    userMode: config.translationMode,
    hasApiKey: !!(config.apiKey && config.apiKey.trim() !== ''),
    tabId
  });

  let translation;
  if (effectiveMode === TRANSLATION_MODE.LOCAL) {
    translation = await translateWithBuiltInAI(text, config.targetLanguage, tabId);
  } else {
    translation = await translateWithAPI(text, config);
  }

  return { translation, mode: effectiveMode };
}

// ==================== 快捷键 ====================

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
