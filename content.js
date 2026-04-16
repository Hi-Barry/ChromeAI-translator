/**
 * Content Script - 监听文本选择并显示翻译浮动卡片
 */

// 防止重复初始化
if (window.translatorContentScriptLoaded) {
  console.log('[AI Translator] Content script already loaded');
} else {
  window.translatorContentScriptLoaded = true;
  console.log('[AI Translator] Content script loaded');

  // 当前选中的文本
  let selectedText = '';
  let currentPopup = null;
  // 防抖定时器
  let mouseUpTimer = null;

  // 用户偏好配置（从 chrome.storage.sync 加载）
  let userConfig = {
    fontSize: DEFAULT_CONFIG.fontSize,
    popupWidth: DEFAULT_CONFIG.popupWidth
  };

  // ==================== LRU 缓存实现 ====================
  const MAX_CACHE_SIZE = 100;
  const translationCache = new Map();

  function setCache(key, value) {
    if (translationCache.has(key)) {
      translationCache.delete(key);
    }
    if (translationCache.size >= MAX_CACHE_SIZE) {
      const firstKey = translationCache.keys().next().value;
      translationCache.delete(firstKey);
    }
    translationCache.set(key, value);
  }

  function getCache(key) {
    return translationCache.get(key);
  }

  // ==================== 弹窗尺寸管理 ====================
  // 弹窗宽度 & 字体大小统一使用 chrome.storage.sync 持久化
  const MIN_POPUP_WIDTH = 200;
  const MAX_POPUP_WIDTH = 800;
  const MIN_FONT_SIZE = 10;
  const MAX_FONT_SIZE = 28;

  /**
   * 从 chrome.storage.sync 加载 UI 偏好配置
   */
  async function loadUIConfig() {
    try {
      const result = await chrome.storage.sync.get({
        fontSize: DEFAULT_CONFIG.fontSize,
        popupWidth: DEFAULT_CONFIG.popupWidth
      });
      userConfig.fontSize = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, result.fontSize));
      userConfig.popupWidth = Math.max(MIN_POPUP_WIDTH, Math.min(MAX_POPUP_WIDTH, result.popupWidth));

      // 如果弹窗已存在，实时更新样式
      applyPopupStyles();
    } catch (e) {
      console.error('[AI Translator] Failed to load UI config:', e);
    }
  }

  /**
   * 实时更新已有弹窗的样式
   */
  function applyPopupStyles() {
    const popup = document.getElementById('ai-translator-popup');
    if (popup) {
      popup.style.width = userConfig.popupWidth + 'px';
      const textEl = popup.querySelector('.translated-text');
      if (textEl) {
        textEl.style.fontSize = userConfig.fontSize + 'px';
        textEl.style.lineHeight = '1.7';
      }
    }
  }

  // 监听 storage 变化（用户在设置页修改后实时生效）
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
      if (changes.fontSize) {
        userConfig.fontSize = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, changes.fontSize.newValue));
      }
      if (changes.popupWidth) {
        userConfig.popupWidth = Math.max(MIN_POPUP_WIDTH, Math.min(MAX_POPUP_WIDTH, changes.popupWidth.newValue));
      }
      applyPopupStyles();
    }
  });

  // ==================== 拖拽调整宽度 ====================
  let isDragging = false;
  let dragStartX = 0;
  let dragStartWidth = 0;
  let dragCurrentWidth = 0;

  function handleResizeMouseDown(e) {
    if (e.button !== 0) return;
    const popup = document.getElementById('ai-translator-popup');
    if (!popup) return;
    isDragging = true;
    dragStartX = e.clientX;
    dragStartWidth = popup.offsetWidth;
    dragCurrentWidth = dragStartWidth;
    e.preventDefault();
    e.stopPropagation();
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleResizeMouseMove);
    document.addEventListener('mouseup', handleResizeMouseUp);
  }

  function handleResizeMouseMove(e) {
    if (!isDragging) return;
    const popup = document.getElementById('ai-translator-popup');
    if (!popup) return;
    const deltaX = e.clientX - dragStartX;
    let newWidth = dragStartWidth - deltaX;
    newWidth = Math.max(MIN_POPUP_WIDTH, Math.min(MAX_POPUP_WIDTH, newWidth));
    popup.style.width = newWidth + 'px';
    dragCurrentWidth = newWidth;
  }

  function handleResizeMouseUp() {
    if (!isDragging) return;
    isDragging = false;
    document.body.style.userSelect = '';
    document.removeEventListener('mousemove', handleResizeMouseMove);
    document.removeEventListener('mouseup', handleResizeMouseUp);
    // 持久化到 chrome.storage.sync
    userConfig.popupWidth = dragCurrentWidth;
    chrome.storage.sync.set({ popupWidth: dragCurrentWidth });
  }

  // ==================== 文本选择处理 ====================
  function getSelectedText() {
    const selection = window.getSelection();
    return selection.toString().trim();
  }

  function hasExistingPopup() {
    return document.getElementById('ai-translator-popup') !== null;
  }

  function closeExistingPopup() {
    const existing = document.getElementById('ai-translator-popup');
    if (existing) {
      existing.remove();
      currentPopup = null;
    }
    if (mouseUpTimer !== null) {
      clearTimeout(mouseUpTimer);
      mouseUpTimer = null;
    }
    selectedText = '';
    document.removeEventListener('click', handleOutsideClick);
  }

  // ==================== 弹窗创建与管理 ====================
  function createTranslatorPopup(originalText) {
    closeExistingPopup();

    const popup = document.createElement('div');
    popup.id = 'ai-translator-popup';
    popup.className = 'ai-translator-popup';
    popup.style.width = userConfig.popupWidth + 'px';

    popup.innerHTML = `
      <div class="translator-resize-handle" id="translator-resize-handle"></div>
      <button class="translator-copy-btn" id="translator-copy-btn" title="复制翻译结果">📋</button>
      <div class="translator-text translated-text" style="font-size: ${userConfig.fontSize}px; line-height: 1.7;">正在翻译...</div>
    `;

    document.body.appendChild(popup);
    currentPopup = popup;

    const resizeHandle = popup.querySelector('#translator-resize-handle');
    if (resizeHandle) {
      resizeHandle.addEventListener('mousedown', handleResizeMouseDown);
    }

    // 复制按钮事件
    const copyBtn = popup.querySelector('#translator-copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const textEl = popup.querySelector('.translated-text');
        if (textEl) {
          navigator.clipboard.writeText(textEl.textContent).then(() => {
            copyBtn.textContent = '✓';
            copyBtn.classList.add('copied');
            setTimeout(() => {
              copyBtn.textContent = '📋';
              copyBtn.classList.remove('copied');
            }, 1200);
          }).catch(() => {
            // Fallback: 使用现代 Clipboard API 的 write 方法
            const text = textEl.textContent;
            const blob = new Blob([text], { type: 'text/plain' });
            navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })]).then(() => {
              copyBtn.textContent = '✓';
              copyBtn.classList.add('copied');
              setTimeout(() => {
                copyBtn.textContent = '📋';
                copyBtn.classList.remove('copied');
              }, 1200);
            }).catch(() => {
              // 最终 fallback：选中文本复制
              const range = document.createRange();
              range.selectNodeContents(textEl);
              const sel = window.getSelection();
              sel.removeAllRanges();
              sel.addRange(range);
              document.execCommand('copy');
              sel.removeAllRanges();
              copyBtn.textContent = '✓';
              setTimeout(() => { copyBtn.textContent = '📋'; }, 1200);
            });
          });
        }
      });
    }

    // 点击弹窗外部关闭
    document.addEventListener('click', handleOutsideClick);

    return popup;
  }

  function handleOutsideClick(event) {
    const popup = document.getElementById('ai-translator-popup');
    if (popup && !popup.contains(event.target)) {
      const selection = window.getSelection();
      const clickedText = selection.toString().trim();
      
      if (clickedText && isClickInSelection(event)) {
        return;
      }
      
      closeExistingPopup();
      document.removeEventListener('click', handleOutsideClick);
    }
  }

  function isClickInSelection(event) {
    const selection = window.getSelection();
    if (selection.rangeCount === 0) return false;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    return (
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom
    );
  }

  // ==================== 文本格式化 ====================
  function safeFormatText(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>')
      .replace(/  +/g, match => '&nbsp;'.repeat(match.length));
  }

  // ==================== 翻译请求 ====================
  async function requestTranslation(text) {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'translate',
        text: text
      });

      if (response.success === false) {
        throw new Error(response.error);
      }

      return response.translation;
    } catch (error) {
      console.error('[AI Translator] Translation error:', error);
      throw error;
    }
  }

  function updateTranslationResult(translation) {
    const popup = document.getElementById('ai-translator-popup');
    if (!popup) return;

    const translatedTextEl = popup.querySelector('.translated-text');
    if (translatedTextEl) {
      translatedTextEl.innerHTML = safeFormatText(translation);
    }
  }

  function showTranslationError(error) {
    const popup = document.getElementById('ai-translator-popup');
    if (!popup) return;

    const translatedTextEl = popup.querySelector('.translated-text');
    if (translatedTextEl) {
      translatedTextEl.innerHTML = `<span class="translator-error">❌ ${safeFormatText(error.message)}</span>`;
    }
  }

  // ==================== 事件处理 ====================
  function handleMouseUp(event) {
    const existingPopup = document.getElementById('ai-translator-popup');
    if (existingPopup && existingPopup.contains(event.target)) {
      return;
    }

    if (mouseUpTimer !== null) {
      clearTimeout(mouseUpTimer);
    }

    mouseUpTimer = setTimeout(() => {
      mouseUpTimer = null;
      const text = getSelectedText();

      if (!text || text.length < 2) {
        return;
      }

      if (text === selectedText) {
        return;
      }

      selectedText = text;
      console.log('[AI Translator] Selected text:', text.substring(0, 50) + (text.length > 50 ? '...' : ''));

      const cachedResult = getCache(text);
      if (cachedResult) {
        console.log('[AI Translator] Cache hit');
        createTranslatorPopup(text);
        updateTranslationResult(cachedResult);
        return;
      }

      createTranslatorPopup(text);

      requestTranslation(text)
        .then(translation => {
          setCache(text, translation);
          updateTranslationResult(translation);
        })
        .catch(error => {
          showTranslationError(error);
        });
    }, 200);
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      closeExistingPopup();
      return;
    }
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'trigger-translation') {
      const text = getSelectedText();
      if (text && text.length >= 2) {
        selectedText = text;

        const cachedResult = getCache(text);
        if (cachedResult) {
          console.log('[AI Translator] Cache hit (shortcut)');
          createTranslatorPopup(text);
          updateTranslationResult(cachedResult);
          sendResponse({ success: true, cached: true });
          return true;
        }

        createTranslatorPopup(text);
        requestTranslation(text)
          .then(translation => {
            setCache(text, translation);
            updateTranslationResult(translation);
          })
          .catch(error => {
            showTranslationError(error);
          });
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'No text selected' });
      }
      return true;
    }
    return false;
  });

  // 绑定事件监听器
  document.addEventListener('mouseup', handleMouseUp);
  document.addEventListener('keydown', handleKeyDown);

  // 初始化时加载 UI 偏好配置
  loadUIConfig();

  console.log('[AI Translator] Event listeners attached');
}
