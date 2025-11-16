/**
 * Toast Notification System
 * Toast通知系统
 * 优雅的消息提示组件
 */

/**
 * Toast管理器类
 */
export class ToastManager {
  constructor() {
    this.container = null;
    this.toasts = new Map();
    this.toastId = 0;
    this.defaultOptions = {
      duration: 4000,
      position: 'top-right',
      closable: true,
      pauseOnHover: true,
      showProgress: true
    };
    this.init();
  }

  /**
   * 初始化Toast容器
   */
  init() {
    // 创建容器
    this.container = document.createElement('div');
    this.container.className = 'toast-container';
    this.container.setAttribute('aria-live', 'polite');
    this.container.setAttribute('aria-label', '通知消息');
    document.body.appendChild(this.container);
  }

  /**
   * 显示Toast消息
   * @param {string} message - 消息内容
   * @param {string} type - 消息类型：success, error, warning, info
   * @param {Object} options - 配置选项
   */
  show(message, type = 'info', options = {}) {
    const id = ++this.toastId;
    const config = { ...this.defaultOptions, ...options };

    // 创建Toast元素
    const toast = this.createToast(id, message, type, config);

    // 添加到容器
    this.container.appendChild(toast);
    this.toasts.set(id, { element: toast, config, timer: null });

    // 触发动画
    requestAnimationFrame(() => {
      toast.classList.add('toast-show');
    });

    // 设置自动关闭
    if (config.duration > 0) {
      this.setAutoClose(id, config.duration);
    }

    return id;
  }

  /**
   * 创建Toast元素
   */
  createToast(id, message, type, config) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('data-toast-id', id);

    // 图标映射
    const icons = {
      success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>',
      error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>',
      warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>',
      info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>'
    };

    // 构建HTML
    toast.innerHTML = `
      <div class="toast-content">
        <div class="toast-icon">${icons[type] || icons.info}</div>
        <div class="toast-message">${message}</div>
        ${config.closable ? '<button class="toast-close" aria-label="关闭">×</button>' : ''}
      </div>
      ${config.showProgress ? '<div class="toast-progress"><div class="toast-progress-bar"></div></div>' : ''}
    `;

    // 添加事件监听
    if (config.closable) {
      const closeBtn = toast.querySelector('.toast-close');
      closeBtn.addEventListener('click', () => this.hide(id));
    }

    if (config.pauseOnHover) {
      toast.addEventListener('mouseenter', () => this.pauseTimer(id));
      toast.addEventListener('mouseleave', () => this.resumeTimer(id));
    }

    return toast;
  }

  /**
   * 设置自动关闭
   */
  setAutoClose(id, duration) {
    const toast = this.toasts.get(id);
    if (!toast) return;

    const progressBar = toast.element.querySelector('.toast-progress-bar');
    if (progressBar) {
      progressBar.style.transition = `transform ${duration}ms linear`;
      requestAnimationFrame(() => {
        progressBar.style.transform = 'translateX(-100%)';
      });
    }

    toast.timer = setTimeout(() => {
      this.hide(id);
    }, duration);
  }

  /**
   * 暂停计时器
   */
  pauseTimer(id) {
    const toast = this.toasts.get(id);
    if (!toast || !toast.timer) return;

    clearTimeout(toast.timer);
    toast.timer = null;

    const progressBar = toast.element.querySelector('.toast-progress-bar');
    if (progressBar) {
      const transform = window.getComputedStyle(progressBar).transform;
      progressBar.style.transition = 'none';
      progressBar.style.transform = transform;
    }
  }

  /**
   * 恢复计时器
   */
  resumeTimer(id) {
    const toast = this.toasts.get(id);
    if (!toast || toast.timer) return;

    const progressBar = toast.element.querySelector('.toast-progress-bar');
    if (progressBar) {
      const transform = window.getComputedStyle(progressBar).transform;
      const matrix = new DOMMatrix(transform);
      const progress = matrix.m41 / progressBar.offsetWidth * 100;
      const remaining = toast.config.duration * (1 + progress / 100);

      progressBar.style.transition = 'none';
      progressBar.style.transform = `translateX(${progress}px)`;

      requestAnimationFrame(() => {
        progressBar.style.transition = `transform ${remaining}ms linear`;
        progressBar.style.transform = 'translateX(-100%)';
      });

      toast.timer = setTimeout(() => {
        this.hide(id);
      }, remaining);
    }
  }

  /**
   * 隐藏Toast
   */
  hide(id) {
    const toast = this.toasts.get(id);
    if (!toast) return;

    clearTimeout(toast.timer);
    toast.element.classList.remove('toast-show');
    toast.element.classList.add('toast-hide');

    setTimeout(() => {
      if (toast.element.parentNode) {
        toast.element.parentNode.removeChild(toast.element);
      }
      this.toasts.delete(id);
    }, 300);
  }

  /**
   * 清除所有Toast
   */
  clear() {
    this.toasts.forEach((_, id) => this.hide(id));
  }

  /**
   * 销毁管理器
   */
  destroy() {
    this.clear();
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}

// 创建全局实例
export const toastManager = new ToastManager();

// 便捷方法
export const showToast = (message, type = 'info', options = {}) => {
  return toastManager.show(message, type, options);
};

export const showSuccess = (message, options = {}) => {
  return showToast(message, 'success', options);
};

export const showError = (message, options = {}) => {
  return showToast(message, 'error', options);
};

export const showWarning = (message, options = {}) => {
  return showToast(message, 'warning', options);
};

export const showInfo = (message, options = {}) => {
  return showToast(message, 'info', options);
};