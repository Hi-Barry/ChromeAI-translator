/**
 * Options Page Logic - 设置页面逻辑
 */

// 确保 DEFAULT_CONFIG 已加载（通过 config.js）
if (typeof DEFAULT_CONFIG === 'undefined') {
  var DEFAULT_CONFIG = {
    apiKey: '',
    apiBaseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    customModel: '',
    targetLanguage: 'zh-CN',
    systemPrompt: '你是一个专业的翻译助手。请将用户提供的文本翻译成目标语言，只返回翻译结果，不要添加解释或其他内容。',
    disableThinking: true
  };
}

// DOM元素（DOMContentLoaded 后初始化）
let elements = {};

/**
 * 初始化 DOM 元素引用
 */
function initElements() {
  elements = {
    apiKey: document.getElementById('apiKey'),
    apiBaseUrl: document.getElementById('apiBaseUrl'),
    model: document.getElementById('model'),
    customModel: document.getElementById('customModel'),
    customModelGroup: document.querySelector('.custom-model-group'),
    targetLanguage: document.getElementById('targetLanguage'),
    systemPrompt: document.getElementById('systemPrompt'),
    disableThinking: document.getElementById('disableThinking'),
    testBtn: document.getElementById('testBtn'),
    saveBtn: document.getElementById('saveBtn'),
    resetBtn: document.getElementById('resetBtn'),
    status: document.getElementById('status')
  };

  // 绑定事件监听
  elements.saveBtn.addEventListener('click', saveConfig);
  elements.resetBtn.addEventListener('click', resetConfig);
  elements.testBtn.addEventListener('click', testApiConnection);
  elements.model.addEventListener('change', toggleCustomModelInput);
}

/**
 * 初始化预设URL点击事件
 */
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

/**
 * 显示状态消息
 */
function showStatus(message, type = 'success') {
  elements.status.textContent = message;
  elements.status.className = `status status-${type}`;
  elements.status.style.display = 'block';
  
  setTimeout(() => {
    elements.status.style.display = 'none';
  }, 3000);
}

/**
 * 加载保存的配置
 */
async function loadConfig() {
  try {
    const config = await chrome.storage.sync.get(DEFAULT_CONFIG);
    
    elements.apiKey.value = config.apiKey || '';
    elements.apiBaseUrl.value = config.apiBaseUrl || DEFAULT_CONFIG.apiBaseUrl;

    // 处理 model 值：如果存储的值在下拉框中不存在，回退到默认值
    const savedModel = config.model || DEFAULT_CONFIG.model;
    const modelSelect = elements.model;
    const optionExists = Array.from(modelSelect.options).some(opt => opt.value === savedModel);
    if (optionExists) {
      modelSelect.value = savedModel;
    } else {
      // 存储的模型不在选项中，回退到默认
      modelSelect.value = DEFAULT_CONFIG.model;
      console.log(`[AI Translator] Saved model "${savedModel}" not found in options, using default: ${DEFAULT_CONFIG.model}`);
    }

    elements.customModel.value = config.customModel || '';
    elements.targetLanguage.value = config.targetLanguage || DEFAULT_CONFIG.targetLanguage;
    elements.systemPrompt.value = config.systemPrompt || DEFAULT_CONFIG.systemPrompt;
    elements.disableThinking.checked = config.disableThinking !== undefined ? config.disableThinking : DEFAULT_CONFIG.disableThinking;
    
    // 检查是否需要显示自定义模型输入框
    toggleCustomModelInput();
    
    console.log('[AI Translator] Config loaded');
  } catch (error) {
    console.error('[AI Translator] Failed to load config:', error);
    showStatus('加载配置失败', 'error');
  }
}

/**
 * 保存配置
 */
async function saveConfig() {
  const config = {
    apiKey: elements.apiKey.value.trim(),
    apiBaseUrl: elements.apiBaseUrl.value.trim() || DEFAULT_CONFIG.apiBaseUrl,
    model: elements.model.value,
    customModel: elements.customModel.value.trim(),
    targetLanguage: elements.targetLanguage.value,
    systemPrompt: elements.systemPrompt.value.trim() || DEFAULT_CONFIG.systemPrompt,
    disableThinking: elements.disableThinking.checked
  };

  // 验证API密钥
  if (!config.apiKey) {
    showStatus('请输入API密钥', 'error');
    elements.apiKey.focus();
    return;
  }

  // 自定义模型验证
  if (config.model === 'custom' && !config.customModel) {
    showStatus('请输入自定义模型名称', 'error');
    elements.customModel.focus();
    return;
  }

  try {
    await chrome.storage.sync.set(config);
    showStatus('设置已保存！', 'success');
    console.log('[AI Translator] Config saved');
  } catch (error) {
    console.error('[AI Translator] Failed to save config:', error);
    showStatus('保存失败: ' + error.message, 'error');
  }
}

/**
 * 重置为默认配置
 */
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

/**
 * 切换自定义模型输入框显示
 */
function toggleCustomModelInput() {
  if (!elements.customModelGroup) return;
  
  const isCustom = elements.model.value === 'custom';
  elements.customModelGroup.style.display = isCustom ? 'block' : 'none';
  
  // 如果切换到自定义模型，自动聚焦输入框
  if (isCustom && elements.customModel) {
    elements.customModel.focus();
  }
  
  console.log('[AI Translator] Custom model input:', isCustom ? 'shown' : 'hidden');
}

/**
 * 测试API连接 - 通过 background script 发送测试请求
 */
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

  // 获取实际使用的模型名称
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
 * 初始化页面
 */
function init() {
  initElements();
  initPresetUrls();
  loadConfig();
}

// 确保 DOM 就绪后再初始化（兼容脚本在 body 底部或 head 中的情况）
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  // DOM 已就绪（脚本在 body 底部时常见）
  init();
}

console.log('[AI Translator] Options page loaded');