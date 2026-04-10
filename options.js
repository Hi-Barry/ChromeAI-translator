/**
 * Options Page Logic - 设置页面逻辑
 */

// 默认配置（独立维护，不依赖外部文件）
const DEFAULT_CONFIG = {
  apiKey: '',
  apiBaseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  customModel: '',
  targetLanguage: 'zh-CN',
  systemPrompt: '你是一个专业的翻译助手。请将用户提供的文本翻译成目标语言，只返回翻译结果，不要添加解释或其他内容。',
  disableThinking: true
};

// DOM元素
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
  document.querySelectorAll('.preset-url').forEach(function(link) {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      var url = e.target.dataset.url;
      if (url) {
        elements.apiBaseUrl.value = url;
        showStatus('已设置 API 地址: ' + url, 'info');
      }
    });
  });
}

/**
 * 显示状态消息
 */
function showStatus(message, type) {
  type = type || 'success';
  elements.status.textContent = message;
  elements.status.className = 'status status-' + type;
  elements.status.style.display = 'block';
  
  setTimeout(function() {
    elements.status.style.display = 'none';
  }, 3000);
}

/**
 * 切换自定义模型输入框显示
 */
function toggleCustomModelInput() {
  if (!elements.customModelGroup) return;
  
  var isCustom = elements.model.value === 'custom';
  elements.customModelGroup.style.display = isCustom ? 'block' : 'none';
  
  // 如果切换到自定义模型，自动聚焦输入框
  if (isCustom && elements.customModel) {
    elements.customModel.focus();
  }
}

/**
 * 加载保存的配置
 */
function loadConfig() {
  chrome.storage.sync.get(DEFAULT_CONFIG, function(config) {
    elements.apiKey.value = config.apiKey || '';
    elements.apiBaseUrl.value = config.apiBaseUrl || DEFAULT_CONFIG.apiBaseUrl;

    // 处理 model 值：如果存储的值在下拉框中不存在，回退到默认值
    var savedModel = config.model || DEFAULT_CONFIG.model;
    var modelSelect = elements.model;
    var optionExists = false;
    for (var i = 0; i < modelSelect.options.length; i++) {
      if (modelSelect.options[i].value === savedModel) {
        optionExists = true;
        break;
      }
    }
    if (optionExists) {
      modelSelect.value = savedModel;
    } else {
      modelSelect.value = DEFAULT_CONFIG.model;
      console.log('[AI Translator] Saved model "' + savedModel + '" not found in options, using default: ' + DEFAULT_CONFIG.model);
    }

    elements.customModel.value = config.customModel || '';
    elements.targetLanguage.value = config.targetLanguage || DEFAULT_CONFIG.targetLanguage;
    elements.systemPrompt.value = config.systemPrompt || DEFAULT_CONFIG.systemPrompt;
    elements.disableThinking.checked = config.disableThinking !== undefined ? config.disableThinking : DEFAULT_CONFIG.disableThinking;
    
    // 检查是否需要显示自定义模型输入框
    toggleCustomModelInput();
    
    console.log('[AI Translator] Config loaded');
  });
}

/**
 * 保存配置
 */
function saveConfig() {
  var config = {
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

  chrome.storage.sync.set(config, function() {
    if (chrome.runtime.lastError) {
      console.error('[AI Translator] Failed to save config:', chrome.runtime.lastError);
      showStatus('保存失败: ' + chrome.runtime.lastError.message, 'error');
    } else {
      showStatus('设置已保存！', 'success');
      console.log('[AI Translator] Config saved');
    }
  });
}

/**
 * 重置为默认配置
 */
function resetConfig() {
  if (!confirm('确定要重置所有设置为默认值吗？')) {
    return;
  }

  chrome.storage.sync.set(DEFAULT_CONFIG, function() {
    loadConfig();
    showStatus('已重置为默认设置', 'success');
    console.log('[AI Translator] Config reset');
  });
}

/**
 * 测试API连接
 */
function testApiConnection() {
  var apiKey = elements.apiKey.value.trim();
  var apiBaseUrl = elements.apiBaseUrl.value.trim() || DEFAULT_CONFIG.apiBaseUrl;
  
  if (!apiKey) {
    showStatus('请先输入API密钥', 'error');
    elements.apiKey.focus();
    return;
  }

  showStatus('正在测试连接...', 'info');
  elements.testBtn.disabled = true;

  chrome.runtime.sendMessage({
    action: 'testConnection',
    config: { apiKey: apiKey, apiBaseUrl: apiBaseUrl }
  }, function(response) {
    elements.testBtn.disabled = false;
    
    if (chrome.runtime.lastError) {
      showStatus('连接失败: ' + chrome.runtime.lastError.message, 'error');
      return;
    }
    
    if (response && response.success) {
      showStatus('✅ API连接成功！', 'success');
    } else {
      var errorMsg = (response && response.error) ? response.error : '未知错误';
      showStatus('❌ 连接失败: ' + errorMsg, 'error');
    }
  });
}

/**
 * 初始化页面
 */
function init() {
  initElements();
  initPresetUrls();
  loadConfig();
}

// 确保 DOM 就绪后再初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

console.log('[AI Translator] Options page loaded');