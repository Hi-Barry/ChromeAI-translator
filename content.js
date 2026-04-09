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

  // ==================== LRU 缓存实现 ====================
  // 翻译缓存（内存级别，页面刷新后清空）
  // 实现LRU策略，避免内存无限增长
  const MAX_CACHE_SIZE = 100;
  const translationCache = new Map();

  /**
   * 设置缓存（LRU策略：超出限制时删除最旧的条目）
   */
  function setCache(key, value) {
    // 如果已存在，先删除（重新插入会移到最后，成为最新的）
    if (translationCache.has(key)) {
      translationCache.delete(key);
    }
    // 如果超出限制，删除最旧的条目（Map的第一个条目）
    if (translationCache.size >= MAX_CACHE_SIZE) {
      const firstKey = translationCache.keys().next().value;
      translationCache.delete(firstKey);
      console.log('[AI Translator] Cache evicted (LRU):', firstKey.substring(0, 30) + '...');
    }
    translationCache.set(key, value);
  }

  /**
   * 获取缓存
   */
  function getCache(key) {
    return translationCache.get(key);
  }

  // ==================== 弹窗宽度管理 ====================
  // 弹窗宽度（持久化到 localStorage）
  const DEFAULT_POPUP_WIDTH = 280;
  const MIN_POPUP_WIDTH = 200;
  const MAX_POPUP_WIDTH = 800;
  const STORAGE_KEY = 'ai-translator-popup-width';

  // 内存备选存储（当 localStorage 不可用时使用）
  let memoryPopupWidth = DEFAULT_POPUP_WIDTH;

  function getPopupWidth() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const w = parseInt(saved, 10);
      if (w && w >= MIN_POPUP_WIDTH && w <= MAX_POPUP_WIDTH) return w;
    } catch (e) {
      // localStorage 不可用，使用内存存储
    }
    return memoryPopupWidth;
  }

  function savePopupWidth(width) {
    try {
      localStorage.setItem(STORAGE_KEY, String(width));
    } catch (e) {
      // localStorage 不可用，使用内存存储
      memoryPopupWidth = width;
    }
  }

  // ==================== 拖拽调整宽度 ====================
  // 拖拽状态
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
    savePopupWidth(dragCurrentWidth);
  }

  // ==================== 文本选择处理 ====================
  /**
   * 获取选中的文本
   */
  function getSelectedText() {
    const selection = window.getSelection();
    const text = selection.toString().trim();
    return text;
  }

  /**
   * 检查是否已存在翻译弹窗
   */
  function hasExistingPopup() {
    return document.getElementById('ai-translator-popup') !== null;
  }

  /**
   * 关闭现有弹窗
   */
  function closeExistingPopup() {
    const existing = document.getElementById('ai-translator-popup');
    if (existing) {
      existing.remove();
      currentPopup = null;
    }
    // 清除待执行的setTimeout
    if (mouseUpTimer !== null) {
      clearTimeout(mouseUpTimer);
      mouseUpTimer = null;
    }
    // 清除selectedText状态
    selectedText = '';
    // 移除handleOutsideClick监听器
    document.removeEventListener('click', handleOutsideClick);
  }

  // ==================== 弹窗创建与管理 ====================
  /**
   * 创建翻译弹窗
   */
  function createTranslatorPopup(originalText) {
    // 先关闭已存在的弹窗
    closeExistingPopup();

    // 创建弹窗容器 — 仅翻译结果圆角矩形 + 复制按钮
    const popup = document.createElement('div');
    popup.id = 'ai-translator-popup';
    popup.className = 'ai-translator-popup';
    popup.style.width = getPopupWidth() + 'px';

    popup.innerHTML = `
      <div class="translator-resize-handle" id="translator-resize-handle"></div>
      <button class="translator-copy-btn" id="translator-copy-btn" title="复制翻译结果">📋</button>
      <div class="translator-text translated-text">正在翻译...</div>
    `;

    // 添加到页面
    document.body.appendChild(popup);
    currentPopup = popup;

    const resizeHandle = popup.querySelector('#translator-resize-handle');
    if (resizeHandle) {
      resizeHandle.addEventListener("mousedown", handleResizeMouseDown);
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
            // Fallback for older browsers
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
        }
      });
    }

    // 点击弹窗外部关闭
    document.addEventListener('click', handleOutsideClick);

    return popup;
  }

  /**
   * 处理点击弹窗外部的关闭逻辑
   */
  function handleOutsideClick(event) {
    const popup = document.getElementById('ai-translator-popup');
    if (popup && !popup.contains(event.target)) {
      // 检查点击的是否是选中的文本
      const selection = window.getSelection();
      const clickedText = selection.toString().trim();
      
      // 如果点击的是选中的文本，不关闭弹窗
      if (clickedText && isClickInSelection(event)) {
        return;
      }
      
      closeExistingPopup();
      document.removeEventListener('click', handleOutsideClick);
    }
  }

  /**
   * 检查点击位置是否在选中的文本范围内
   */
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
  /**
   * 安全格式化文本（保留换行，转义危险HTML标签）
   * 改进原有的 escapeHtml，保留基本格式
   */
  function safeFormatText(text) {
    return text
      // 转义 HTML 特殊字符
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // 保留换行格式
      .replace(/\n/g, '<br>')
      // 保留连续空格（首行缩进等）
      .replace(/  +/g, match => '&nbsp;'.repeat(match.length));
  }

  // ==================== 翻译请求 ====================
  /**
   * 发送翻译请求到 background script
   */
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

  /**
   * 更新翻译结果显示
   */
  function updateTranslationResult(translation) {
    const popup = document.getElementById('ai-translator-popup');
    if (!popup) return;

    const translatedTextEl = popup.querySelector('.translated-text');
    if (translatedTextEl) {
      // 使用改进的格式化函数，保留换行等格式
      translatedTextEl.innerHTML = safeFormatText(translation);
    }
  }

  /**
   * 显示翻译错误
   */
  function showTranslationError(error) {
    const popup = document.getElementById('ai-translator-popup');
    if (!popup) return;

    const translatedTextEl = popup.querySelector('.translated-text');
    if (translatedTextEl) {
      translatedTextEl.innerHTML = `<span class="translator-error">❌ ${safeFormatText(error.message)}</span>`;
    }
  }

  // ==================== 事件处理 ====================
  /**
   * 处理鼠标释放事件（文本选择完成）
   * 包含防抖逻辑和setTimeout清理
   */
  function handleMouseUp(event) {
    // 如果鼠标在翻译窗口内，不触发翻译
    const existingPopup = document.getElementById('ai-translator-popup');
    if (existingPopup && existingPopup.contains(event.target)) {
      return;
    }

    // 清除之前的定时器（防抖）
    if (mouseUpTimer !== null) {
      clearTimeout(mouseUpTimer);
    }

    // 延迟执行，确保选择已完成
    mouseUpTimer = setTimeout(() => {
      mouseUpTimer = null;
      const text = getSelectedText();

      // 如果没有选中文本，或选中文本太短，不处理
      if (!text || text.length < 2) {
        return;
      }

      // 如果选中的文本和之前一样，不重复处理
      if (text === selectedText) {
        return;
      }

      selectedText = text;
      console.log('[AI Translator] Selected text:', text.substring(0, 50) + (text.length > 50 ? '...' : ''));

      // 检查缓存
      const cachedResult = getCache(text);
      if (cachedResult) {
        console.log('[AI Translator] Cache hit');
        createTranslatorPopup(text);
        updateTranslationResult(cachedResult);
        return;
      }

      // 创建翻译弹窗
      createTranslatorPopup(text);

      // 请求翻译
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

  /**
   * 处理快捷键
   */
  function handleKeyDown(event) {
    // Esc 键关闭弹窗
    if (event.key === 'Escape') {
      closeExistingPopup();
      return;
    }
  }

  /**
   * 监听来自 background script 的消息
   */
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'trigger-translation') {
      // 快捷键触发翻译当前选中的文本
      const text = getSelectedText();
      if (text && text.length >= 2) {
        selectedText = text;

        // 检查缓存
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

  console.log('[AI Translator] Event listeners attached');
}