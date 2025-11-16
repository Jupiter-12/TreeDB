/**
 * Utils Module - 工具模块
 * 负责通用工具函数
 * 单一职责：提供通用工具功能
 */

import {
  THEME_STORAGE_KEY,
  CONTROL_PANEL_STORAGE_KEY,
  LAYOUT_MIN_WIDTH,
  LAYOUT_MAX_WIDTH,
  LAYOUT_STORAGE_KEY
} from './core.js';


// ==================== Modal Dialogs ====================

/**
 * 显示模态对话框
 * @param {string} title - 标题
 * @param {string} content - 内容HTML
 * @returns {Function} - 关闭函数
 */
export function showModal(title, content) {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>${title}</h2>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-body">${content}</div>
    </div>
  `;
  document.body.appendChild(modal);

  // 初始状态
  modal.style.opacity = '0';
  requestAnimationFrame(() => {
    modal.style.opacity = '1';
  });

  const close = () => {
    modal.style.opacity = '0';
    setTimeout(() => modal.remove(), 300);
  };

  modal.querySelector('.modal-close').addEventListener('click', close);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  return close;
}

/**
 * 显示确认对话框
 * @param {string} message - 消息
 * @param {Function} onConfirm - 确认回调
 * @param {Function} [onCancel] - 取消回调
 * @returns {boolean} - 是否确认
 */
export function showConfirmation(message, onConfirm, onCancel = null) {
  const confirmed = window.confirm(message);
  if (confirmed && onConfirm) onConfirm();
  else if (!confirmed && onCancel) onCancel();
  return confirmed;
}

// ==================== Theme Management ====================

/**
 * 加载存储的主题偏好
 * @returns {string} - 主题名称
 */
export function loadStoredThemePreference() {
  try {
    const item = localStorage.getItem(THEME_STORAGE_KEY);
    return item !== null ? item : 'light';
  } catch (e) {
    return 'light';
  }
}

/**
 * 应用主题
 * @param {string} theme - 主题名称
 */
export function applyThemePreference(theme) {
  if (theme === 'dark') {
    document.documentElement.classList.add('dark-theme');
  } else {
    document.documentElement.classList.remove('dark-theme');
  }
}

/**
 * 持久化主题偏好
 * @param {string} theme - 主题名称
 */
export function persistThemePreference(theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (e) {
    console.warn('Failed to persist theme preference:', e);
  }
}

/**
 * 初始化主题
 */
export function initializeTheme() {
  const savedTheme = loadStoredThemePreference();
  const themeToggle = document.getElementById('theme-toggle');

  if (themeToggle) {
    themeToggle.checked = savedTheme === 'dark';
    themeToggle.addEventListener('change', (e) => {
      const newTheme = e.target.checked ? 'dark' : 'light';
      applyThemePreference(newTheme);
      persistThemePreference(newTheme);
    });
  }

  applyThemePreference(savedTheme);
}

// ==================== Layout Management ====================

/**
 * 更新布局宽度
 * @param {number} width - 新宽度
 */
export function updateLayoutWidth(width) {
  const clampedWidth = Math.min(Math.max(width, LAYOUT_MIN_WIDTH), LAYOUT_MAX_WIDTH);
  const treeContainer = document.getElementById('tree-container');
  const detailsContainer = document.getElementById('details-container');

  if (treeContainer) treeContainer.style.width = clampedWidth + 'px';
  if (detailsContainer) detailsContainer.style.left = clampedWidth + 'px';

  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, clampedWidth);
  } catch (e) {
    console.warn('Failed to persist layout width:', e);
  }

  return clampedWidth;
}

/**
 * 加载存储的布局宽度
 * @returns {number|null} - 布局宽度
 */
export function loadStoredLayoutWidth() {
  try {
    const width = localStorage.getItem(LAYOUT_STORAGE_KEY);
    return width ? parseInt(width) : null;
  } catch (e) {
    return null;
  }
}

/**
 * 设置布局调整功能
 * @param {Object} state - 应用状态
 */
export function setupLayoutResize(state) {
  const resizeHandle = document.getElementById('layout-resize-handle');
  if (!resizeHandle) return;

  resizeHandle.addEventListener('mousedown', (e) => {
    state.isResizing = true;
    state.startX = e.clientX;
    state.startWidth = state.layoutWidth;
    document.body.style.cursor = 'ew-resize';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!state.isResizing) return;

    const deltaX = e.clientX - state.startX;
    const newWidth = state.startWidth + deltaX;
    state.layoutWidth = updateLayoutWidth(newWidth);
  });

  document.addEventListener('mouseup', () => {
    if (state.isResizing) {
      state.isResizing = false;
      document.body.style.cursor = '';
    }
  });
}

// ==================== Control Panel Management ====================

/**
 * 切换控制面板
 * @param {Object} state - 应用状态
 */
export function toggleControlPanel(state) {
  state.controlPanelCollapsed = !state.controlPanelCollapsed;
  const controlPanel = document.getElementById('control-panel');
  if (controlPanel) {
    controlPanel.classList.toggle('collapsed', state.controlPanelCollapsed);
  }

  try {
    localStorage.setItem(CONTROL_PANEL_STORAGE_KEY, state.controlPanelCollapsed);
  } catch (e) {
    console.warn('Failed to persist control panel state:', e);
  }
}

/**
 * 加载存储的控制面板状态
 * @returns {boolean|null} - 是否折叠
 */
export function loadStoredControlPanelState() {
  try {
    const state = localStorage.getItem(CONTROL_PANEL_STORAGE_KEY);
    return state !== null ? state === 'true' : null;
  } catch (e) {
    return null;
  }
}

// ==================== Tab Management ====================

/**
 * 切换标签页
 * @param {string} tabName - 标签页名称
 */
export function switchTab(tabName) {
  // 更新标签按钮
  document.querySelectorAll('.tab-button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  // 更新标签内容
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `tab-${tabName}`);
  });
}

/**
 * 设置标签切换功能
 */
export function setupTabSwitching() {
  const tabs = document.querySelectorAll('.tab-button');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      switchTab(tabName);
    });
  });
}

// ==================== Event Bus ====================

/**
 * 简单的事件总线
 */
export class EventBus {
  constructor() {
    this.events = new Map();
  }

  /**
   * 订阅事件
   * @param {string} event - 事件名
   * @param {Function} handler - 处理函数
   * @returns {Function} - 取消订阅函数
   */
  on(event, handler) {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event).push(handler);

    return () => {
      const handlers = this.events.get(event);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
        }
      }
    };
  }

  /**
   * 触发事件
   * @param {string} event - 事件名
   * @param {*} data - 事件数据
   */
  emit(event, data) {
    const handlers = this.events.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(data));
    }
  }

  /**
   * 取消所有事件订阅
   */
  clear() {
    this.events.clear();
  }
}

// 创建全局事件总线
export const eventBus = new EventBus();