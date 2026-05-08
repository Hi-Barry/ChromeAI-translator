/**
 * Options Page Logic - 设置页面逻辑
 */

// DOM 元素
const elements = {
  apiKey: document.getElementById('apiKey'),
  apiBaseUrl: document.getElementById('apiBaseUrl'),
  model: document.getElementById('model'),
  customModel: document.getElementById('customModel'),
  customModelGroup: document.querySelector('.custom-model-group'),
  targetLanguage: document.getElementById('targetLanguage'),
  systemPrompt: document.getElementById('systemPrompt'),
  disableThinking: document.getElementById('disableThinking'),
  fontSize: document.getElementById('fontSize'),
  fontSizeValue: document.getElementById('fontSizeValue'),
  popupWidth: document.getElementById('popupWidth'),
  popupWidthValue: document.getElementById('popupWidthValue'),
  popupBorderColor: document.getElementById('popupBorderColor'),
  popupBorderColorValue: document.getElementById('popupBorderColorValue'),
  popupBorderWidth: document.getElementById('popupBorderWidth'),
  popupBorderWidthValue: document.getElementById('popupBorderWidthValue'),
  testBtn: document.getElementById('testBtn'),
  saveBtn: document.getElementById('saveBtn'),
  resetBtn: document.getElementById('resetBtn'),
  status: document.getElementById('status'),
  // 翻译模式相关
  modeLocal: document.getElementById('modeLocal'),
  modeRemote: document.getElementById('modeRemote'),
  modeHint: document.getElementById('modeHint'),
  builtInAIStatus: document.getElementById('builtInAIStatus'),
  // 语言包相关
  langPackStatusIcon: document.getElementById('langPackStatusIcon'),
  langPackStatusText: document.getElementById('langPackStatusText'),
  installLangPackBtn: document.getElementById('installLangPackBtn'),
  checkLangPackBtn: document.getElementById('checkLangPackBtn'),
  langPackHint: document.getElementById('langPackHint')
};

// ==================== Range 滑块实时预览 ====================

elements.fontSize.addEventListener('input', () => {
  elements.fontSizeValue.textContent = elements.fontSize.value + 'px';
});

elements.popupWidth.addEventListener('input', () => {
  elements.popupWidthValue.textContent = elements.popupWidth.value + 'px';
});

elements.popupBorderWidth.addEventListener('input', () => {
  elements.popupBorderWidthValue.textContent = elements.popupBorderWidth.value + 'px';
});

// 颜色选择器实时预览
elements.popupBorderColor.addEventListener('input', () => {
  elements.popupBorderColorValue.textContent = elements.popupBorderColor.value;
});

// ==================== 预设 URL ====================

function initPresetUrls() {
  document.querySelectorAll('.preset-url').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const url = e.target.dataset.url;
      if (url) {
        elements.apiBaseUrl.value = url;
        showStatus(`已设置 API 地址: ${url}`, 'info');
      }
    });
  });
}

// ==================== 状态消息 ====================

function showStatus(message, type = 'success') {
  elements.status.textContent = message;
  elements.status.className = `status status-${type}`;
  elements.status.style.display = 'block';
  
  setTimeout(() => {
    elements.status.style.display = 'none';
  }, 4000);
}

// ==================== Chrome 内置 AI 和语言包状态检测 ====================

/**
 * 检测 Chrome 内置翻译 API 和语言包状态
 */
async function checkLanguagePackStatus() {
  elements.langPackStatusIcon.textContent = '⏳';
  elements.langPackStatusText.textContent = '正在检测...';
  elements.installLangPackBtn.style.display = 'none';
  elements.checkLangPackBtn.style.display = 'none';

  // 1. 检查 API 是否可用
  const hasNew = typeof window.Translator !== 'undefined' && typeof window.Translator.create === 'function';
  const hasOld = !!(window.ai?.translator?.create);
  const TranslatorAPI = hasNew ? window.Translator : (hasOld ? window.ai.translator : null);

  if (!TranslatorAPI) {
    elements.langPackStatusIcon.textContent = '❌';
    elements.langPackStatusText.textContent = 'Chrome 内置翻译 API 不可用';
    elements.langPackHint.textContent = '请确保：1) Chrome 版本 ≥ 131  2) 已开启 chrome://flags/#translation-api';
    return;
  }

  elements.langPackStatusIcon.textContent = '✅';
  elements.langPackStatusText.textContent = 'API 已就绪';

  // 2. 检查语言包状态
  if (!TranslatorAPI.availability) {
    elements.langPackStatusText.textContent = 'API 已就绪（无法检测语言包状态，旧版 API）';
    elements.langPackHint.textContent = '如果翻译一直卡住，请尝试访问 chrome://on-device-translation-internals/ 手动安装。';
    elements.installLangPackBtn.style.display = 'inline-block';
    return;
  }

  try {
    const targetLang = elements.targetLanguage.value;
    const targetBCP = mapToBuiltInAILanguage(targetLang);

    const status = await TranslatorAPI.availability({
      sourceLanguage: 'en',
      targetLanguage: targetBCP
    });

    if (status === 'readily' || status === 'available') {
      elements.langPackStatusIcon.textContent = '✅';
      elements.langPackStatusText.textContent = '语言包已安装 (en ↔ ' + targetBCP + ')，可离线使用';
      elements.langPackHint.textContent = '翻译模型已就绪，选中文本即可离线翻译。';
      elements.installLangPackBtn.style.display = 'none';
    } else if (status === 'after-download' || status === 'downloadable') {
      elements.langPackStatusIcon.textContent = '📥';
      elements.langPackStatusText.textContent = '语言包未安装 (en ↔ ' + targetBCP + ')，需要下载';
      elements.langPackHint.textContent = '首次使用需下载语言包（约200MB，一次性），之后永久离线使用。';
      elements.installLangPackBtn.style.display = 'inline-block';
    } else if (status === 'unavailable') {
      elements.langPackStatusIcon.textContent = '⚠️';
      elements.langPackStatusText.textContent = '语言对 (en ↔ ' + targetBCP + ') 暂不支持';
      elements.langPackHint.textContent = '当前语言对暂无离线翻译包支持。';
    } else {
      elements.langPackStatusIcon.textContent = '❓';
      elements.langPackStatusText.textContent = '未知状态: ' + status;
      elements.installLangPackBtn.style.display = 'inline-block';
    }
  } catch (e) {
    elements.langPackStatusIcon.textContent = '⚠️';
    elements.langPackStatusText.textContent = '检测失败: ' + e.message;
    elements.langPackHint.textContent = '请尝试手动访问 chrome://on-device-translation-internals/ 查看语言包状态。';
    elements.installLangPackBtn.style.display = 'inline-block';
  }

  elements.checkLangPackBtn.style.display = 'inline-block';
}

/**
 * 打开语言包安装页面
 */
function installLanguagePack() {
  chrome.tabs.create({ url: 'chrome://on-device-translation-internals/' });
}

/**
 * 检查 API 基本可用性（轻量版，页面加载时运行）
 */
function checkBuiltInAIAvailability() {
  const hasNew = typeof window.Translator !== 'undefined' && typeof window.Translator.create === 'function';
  const hasOld = !!(window.ai?.translator?.create);

  if (hasNew || hasOld) {
    showBuiltInAIStatus('available', '✅ Chrome 内置翻译 API 可用');
    // 进一步检测语言包
    checkLanguagePackStatus();
  } else {
    showBuiltInAIStatus('unavailable',
      '⚠️ Chrome 内置翻译 API 不可用。请确保：\n' +
      '1) Chrome 版本 ≥ 131\n' +
      '2) 已开启 chrome://flags/#translation-api');
    elements.langPackStatusIcon.textContent = '❌';
    elements.langPackStatusText.textContent = 'API 不可用，无法检测语言包';
  }
}

function showBuiltInAIStatus(type, message) {
  elements.builtInAIStatus.style.display = 'block';
  elements.builtInAIStatus.textContent = message;
  elements.builtInAIStatus.className = `builtin-ai-status builtin-ai-${type}`;
}

// ==================== 配置加载 ====================

async function loadConfig() {
  try {
    const config = await chrome.storage.sync.get(DEFAULT_CONFIG);
    
    elements.apiKey.value = config.apiKey || '';
    elements.apiBaseUrl.value = config.apiBaseUrl || DEFAULT_CONFIG.apiBaseUrl;
    elements.model.value = config.model || DEFAULT_CONFIG.model;
    elements.customModel.value = config.customModel || '';
    elements.targetLanguage.value = config.targetLanguage || DEFAULT_CONFIG.targetLanguage;
    elements.systemPrompt.value = config.systemPrompt || DEFAULT_CONFIG.systemPrompt;
    elements.disableThinking.checked = config.disableThinking !== undefined ? config.disableThinking : DEFAULT_CONFIG.disableThinking;
    
    // 翻译模式
    const mode = config.translationMode || DEFAULT_CONFIG.translationMode;
    if (mode === TRANSLATION_MODE.LOCAL) {
      elements.modeLocal.checked = true;
    } else {
      elements.modeRemote.checked = true;
    }
    updateModeHint(config.apiKey || '');

    // 界面设置
    elements.fontSize.value = config.fontSize || DEFAULT_CONFIG.fontSize;
    elements.fontSizeValue.textContent = (config.fontSize || DEFAULT_CONFIG.fontSize) + 'px';
    elements.popupWidth.value = config.popupWidth || DEFAULT_CONFIG.popupWidth;
    elements.popupWidthValue.textContent = (config.popupWidth || DEFAULT_CONFIG.popupWidth) + 'px';
    elements.popupBorderColor.value = config.popupBorderColor || DEFAULT_CONFIG.popupBorderColor;
    elements.popupBorderColorValue.textContent = config.popupBorderColor || DEFAULT_CONFIG.popupBorderColor;
    elements.popupBorderWidth.value = config.popupBorderWidth || DEFAULT_CONFIG.popupBorderWidth;
    elements.popupBorderWidthValue.textContent = (config.popupBorderWidth || DEFAULT_CONFIG.popupBorderWidth) + 'px';
    
    // 检查是否需要显示自定义模型输入框
    toggleCustomModelInput();
    
    console.log('[AI Translator] Config loaded');
  } catch (error) {
    console.error('[AI Translator] Failed to load config:', error);
    showStatus('加载配置失败', 'error');
  }
}

// ==================== 配置保存 ====================

async function saveConfig() {
  const translationMode = elements.modeLocal.checked ? TRANSLATION_MODE.LOCAL : TRANSLATION_MODE.REMOTE;

  const config = {
    translationMode: translationMode,
    apiKey: elements.apiKey.value.trim(),
    apiBaseUrl: elements.apiBaseUrl.value.trim() || DEFAULT_CONFIG.apiBaseUrl,
    model: elements.model.value,
    customModel: elements.customModel.value.trim(),
    targetLanguage: elements.targetLanguage.value,
    systemPrompt: elements.systemPrompt.value.trim() || DEFAULT_CONFIG.systemPrompt,
    disableThinking: elements.disableThinking.checked,
    fontSize: parseInt(elements.fontSize.value, 10),
    popupWidth: parseInt(elements.popupWidth.value, 10),
    popupBorderColor: elements.popupBorderColor.value,
    popupBorderWidth: parseInt(elements.popupBorderWidth.value, 10)
  };

  // 本地模式不需要 API Key
  if (translationMode === TRANSLATION_MODE.REMOTE) {
    if (!config.apiKey) {
      showStatus('远程翻译模式需要配置 API 密钥', 'error');
      elements.apiKey.focus();
      return;
    }
  }

  try {
    await chrome.storage.sync.set(config);
    showStatus('设置已保存！', 'success');
    console.log('[AI Translator] Config saved, translationMode:', translationMode);
  } catch (error) {
    console.error('[AI Translator] Failed to save config:', error);
    showStatus('保存失败: ' + error.message, 'error');
  }
}

// ==================== 重置配置 ====================

async function resetConfig() {
  if (!confirm('确定要重置所有设置为默认值吗？')) {
    return;
  }

  try {
    await chrome.storage.sync.set(DEFAULT_CONFIG);
    loadConfig();
    showStatus('已重置为默认设置', 'success');
    console.log('[AI Translator] Config reset');
  } catch (error) {
    console.error('[AI Translator] Failed to reset config:', error);
    showStatus('重置失败: ' + error.message, 'error');
  }
}

// ==================== 自定义模型切换 ====================

function toggleCustomModelInput() {
  const isCustom = elements.model.value === 'custom';
  elements.customModelGroup.style.display = isCustom ? 'block' : 'none';
}

// ==================== 测试连接 ====================

async function testApiConnection() {
  const apiKey = elements.apiKey.value.trim();
  const apiBaseUrl = elements.apiBaseUrl.value.trim() || DEFAULT_CONFIG.apiBaseUrl;
  const model = elements.model.value;
  const customModel = elements.customModel.value.trim();
  
  if (!apiKey) {
    showStatus('请先输入API密钥', 'error');
    elements.apiKey.focus();
    return;
  }

  const actualModel = model === 'custom' ? customModel : model;

  if (!actualModel) {
    showStatus('请选择或输入模型', 'error');
    return;
  }

  showStatus('正在测试连接...', 'info');
  elements.testBtn.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'testConnection',
      config: { apiKey, apiBaseUrl }
    });

    if (response && response.success) {
      showStatus('✅ API连接成功！', 'success');
    } else {
      const errorMsg = response?.error || '未知错误';
      showStatus('❌ 连接失败: ' + errorMsg, 'error');
    }
  } catch (error) {
    console.error('[AI Translator] Test connection error:', error);
    showStatus('❌ 连接失败: ' + error.message, 'error');
  } finally {
    elements.testBtn.disabled = false;
  }
}

/**
 * 更新翻译模式提示信息
 * 根据当前选择的模式和 API Key 状态显示相应提示
 */
function updateModeHint(apiKey) {
  const isLocal = elements.modeLocal.checked;
  const hasKey = apiKey && apiKey.trim() !== '';

  if (isLocal) {
    elements.modeHint.textContent = '✅ 当前使用 Chrome 内置离线 AI 翻译，无需联网，无需 API 密钥。首次使用需下载翻译模型。';
    elements.modeHint.className = 'help-text';
  } else if (!hasKey) {
    elements.modeHint.textContent = '⚠️ 当前未配置 API 密钥，将自动降级为 Chrome 内置离线 AI 翻译。请在下方的 API 配置区域填写密钥以启用 LLM 翻译。';
    elements.modeHint.className = 'help-text';
  } else {
    elements.modeHint.textContent = '✅ 已配置 API 密钥，将使用大语言模型进行翻译。切换到离线翻译可保护隐私、无需联网。';
    elements.modeHint.className = 'help-text';
  }
}

// ==================== 事件监听 ====================

elements.saveBtn.addEventListener('click', saveConfig);
elements.resetBtn.addEventListener('click', resetConfig);
elements.testBtn.addEventListener('click', testApiConnection);
elements.model.addEventListener('change', toggleCustomModelInput);

// 语言包相关事件
elements.installLangPackBtn.addEventListener('click', installLanguagePack);
elements.checkLangPackBtn.addEventListener('click', checkLanguagePackStatus);

// 目标语言切换时重新检测语言包
elements.targetLanguage.addEventListener('change', () => {
  if (elements.modeLocal.checked) {
    checkLanguagePackStatus();
  }
});

// 翻译模式切换联动
elements.modeLocal.addEventListener('change', () => {
  if (elements.modeLocal.checked) {
    updateModeHint(elements.apiKey.value);
    checkLanguagePackStatus();
  }
});

elements.modeRemote.addEventListener('change', () => {
  if (elements.modeRemote.checked) {
    updateModeHint(elements.apiKey.value);
  }
});

// API Key 输入时实时更新提示
elements.apiKey.addEventListener('input', () => {
  updateModeHint(elements.apiKey.value);
});

// 页面加载时读取配置
document.addEventListener('DOMContentLoaded', () => {
  loadConfig();
  initPresetUrls();
  // 延迟检测内置 AI 可用性（等 DOM 渲染完成）
  setTimeout(checkBuiltInAIAvailability, 500);
});

console.log('[AI Translator] Options page loaded');
