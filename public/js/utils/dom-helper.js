/**
 * DOM Helper Utilities
 * DOM操作工具类
 * 遵循DRY原则，统一DOM操作模式
 */

/**
 * DOM工具类
 * 提供常用的DOM操作方法，避免代码重复
 */
export class DOMHelper {
  /**
   * 安全地设置元素文本内容
   * @param {Element} element - DOM元素
   * @param {string} text - 文本内容
   */
  static setText(element, text) {
    if (element) {
      element.textContent = text || '';
    }
  }

  /**
   * 安全地设置元素HTML内容
   * @param {Element} element - DOM元素
   * @param {string} html - HTML内容
   */
  static setHTML(element, html) {
    if (element) {
      element.innerHTML = html || '';
    }
  }

  /**
   * 安全地添加事件监听器
   * @param {string|Element} target - 选择器或元素
   * @param {string} event - 事件类型
   * @param {Function} handler - 事件处理函数
   * @param {Object} options - 事件选项
   * @returns {Element|null} 元素引用
   */
  static addListener(target, event, handler, options = {}) {
    const element = typeof target === 'string' ?
      document.querySelector(target) : target;

    if (element) {
      element.addEventListener(event, handler, options);
      return element;
    }
    return null;
  }

  /**
   * 安全地移除事件监听器
   * @param {string|Element} target - 选择器或元素
   * @param {string} event - 事件类型
   * @param {Function} handler - 事件处理函数
   */
  static removeListener(target, event, handler) {
    const element = typeof target === 'string' ?
      document.querySelector(target) : target;

    if (element) {
      element.removeEventListener(event, handler);
    }
  }

  /**
   * 创建元素并设置属性
   * @param {string} tag - 标签名
   * @param {Object} options - 选项
   * @param {string} options.className - CSS类名
   * @param {string} options.id - 元素ID
   * @param {string} options.text - 文本内容
   * @param {string} options.html - HTML内容
   * @param {Object} options.attributes - 属性对象
   * @param {Object} options.dataset - data属性对象
   * @returns {Element} 创建的元素
   */
  static createElement(tag, options = {}) {
    const element = document.createElement(tag);

    if (options.className) {
      element.className = options.className;
    }

    if (options.id) {
      element.id = options.id;
    }

    if (options.text) {
      element.textContent = options.text;
    }

    if (options.html) {
      element.innerHTML = options.html;
    }

    if (options.attributes) {
      Object.entries(options.attributes).forEach(([key, value]) => {
        element.setAttribute(key, value);
      });
    }

    if (options.dataset) {
      Object.entries(options.dataset).forEach(([key, value]) => {
        element.dataset[key] = value;
      });
    }

    return element;
  }

  /**
   * 查找元素
   * @param {string} selector - CSS选择器
   * @param {Element} parent - 父元素，默认为document
   * @returns {Element|null} 找到的元素
   */
  static find(selector, parent = document) {
    return parent.querySelector(selector);
  }

  /**
   * 查找所有匹配的元素
   * @param {string} selector - CSS选择器
   * @param {Element} parent - 父元素，默认为document
   * @returns {NodeList} 找到的元素列表
   */
  static findAll(selector, parent = document) {
    return parent.querySelectorAll(selector);
  }

  /**
   * 显示元素
   * @param {Element|string} element - 元素或选择器
   * @param {string} display - 显示类型，默认为block
   */
  static show(element, display = 'block') {
    const el = typeof element === 'string' ?
      document.querySelector(element) : element;

    if (el) {
      el.style.display = display;
    }
  }

  /**
   * 隐藏元素
   * @param {Element|string} element - 元素或选择器
   */
  static hide(element) {
    const el = typeof element === 'string' ?
      document.querySelector(element) : element;

    if (el) {
      el.style.display = 'none';
    }
  }

  /**
   * 切换元素显示/隐藏
   * @param {Element|string} element - 元素或选择器
   * @param {string} display - 显示时的类型，默认为block
   * @returns {boolean} 当前是否显示
   */
  static toggle(element, display = 'block') {
    const el = typeof element === 'string' ?
      document.querySelector(element) : element;

    if (el) {
      const isHidden = el.style.display === 'none' ||
                      window.getComputedStyle(el).display === 'none';

      el.style.display = isHidden ? display : 'none';
      return !isHidden;
    }
    return false;
  }

  /**
   * 添加CSS类
   * @param {Element|string} element - 元素或选择器
   * @param {...string} classNames - CSS类名
   */
  static addClass(element, ...classNames) {
    const el = typeof element === 'string' ?
      document.querySelector(element) : element;

    if (el) {
      el.classList.add(...classNames);
    }
  }

  /**
   * 移除CSS类
   * @param {Element|string} element - 元素或选择器
   * @param {...string} classNames - CSS类名
   */
  static removeClass(element, ...classNames) {
    const el = typeof element === 'string' ?
      document.querySelector(element) : element;

    if (el) {
      el.classList.remove(...classNames);
    }
  }

  /**
   * 切换CSS类
   * @param {Element|string} element - 元素或选择器
   * @param {string} className - CSS类名
   * @returns {boolean} 是否包含该类
   */
  static toggleClass(element, className) {
    const el = typeof element === 'string' ?
      document.querySelector(element) : element;

    if (el) {
      return el.classList.toggle(className);
    }
    return false;
  }

  /**
   * 检查是否包含CSS类
   * @param {Element|string} element - 元素或选择器
   * @param {string} className - CSS类名
   * @returns {boolean} 是否包含该类
   */
  static hasClass(element, className) {
    const el = typeof element === 'string' ?
      document.querySelector(element) : element;

    if (el) {
      return el.classList.contains(className);
    }
    return false;
  }

  /**
   * 获取元素位置信息
   * @param {Element|string} element - 元素或选择器
   * @returns {DOMRect|null} 位置信息
   */
  static getRect(element) {
    const el = typeof element === 'string' ?
      document.querySelector(element) : element;

    return el ? el.getBoundingClientRect() : null;
  }

  /**
   * 设置元素样式
   * @param {Element|string} element - 元素或选择器
   * @param {Object} styles - 样式对象
   */
  static setStyle(element, styles) {
    const el = typeof element === 'string' ?
      document.querySelector(element) : element;

    if (el) {
      Object.entries(styles).forEach(([property, value]) => {
        el.style[property] = value;
      });
    }
  }

  /**
   * 批量DOM操作（使用DocumentFragment优化性能）
   * @param {Function} operations - 操作函数，接收DocumentFragment参数
   * @param {Element} container - 容器元素
   */
  static batch(operations, container = document.createDocumentFragment()) {
    operations(container);
    return container;
  }

  /**
   * 清空元素内容
   * @param {Element|string} element - 元素或选择器
   */
  static empty(element) {
    const el = typeof element === 'string' ?
      document.querySelector(element) : element;

    if (el) {
      el.innerHTML = '';
    }
  }

  /**
   * 从DOM中移除元素
   * @param {Element|string} element - 元素或选择器
   */
  static remove(element) {
    const el = typeof element === 'string' ?
      document.querySelector(element) : element;

    if (el && el.parentNode) {
      el.parentNode.removeChild(el);
    }
  }

  /**
   * 检查元素是否存在
   * @param {string} selector - CSS选择器
   * @returns {boolean} 是否存在
   */
  static exists(selector) {
    return document.querySelector(selector) !== null;
  }

  /**
   * 等待DOM加载完成
   * @param {Function} callback - 回调函数
   */
  static ready(callback) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', callback);
    } else {
      callback();
    }
  }

  /**
   * 设置事件委托
   * @param {Element|string} container - 容器元素或选择器
   * @param {string} selector - 目标元素选择器
   * @param {string} event - 事件类型
   * @param {Function} handler - 事件处理函数
   */
  static delegate(container, selector, event, handler) {
    const el = typeof container === 'string' ?
      document.querySelector(container) : container;

    if (el) {
      el.addEventListener(event, (e) => {
        if (e.target.matches(selector)) {
          handler(e);
        }
      });
    }
  }
}

/**
 * 快捷方法：创建按钮
 */
DOMHelper.createButton = (text, className = '', onClick = null) => {
  const button = DOMHelper.createElement('button', {
    className: `btn ${className}`,
    text: text
  });

  if (onClick) {
    button.addEventListener('click', onClick);
  }

  return button;
};

/**
 * 快捷方法：创建输入框
 */
DOMHelper.createInput = (type = 'text', placeholder = '', value = '') => {
  return DOMHelper.createElement('input', {
    attributes: {
      type: type,
      placeholder: placeholder,
      value: value
    }
  });
};

/**
 * 快捷方法：创建图标
 */
DOMHelper.createIcon = (iconClass, title = '') => {
  return DOMHelper.createElement('i', {
    className: iconClass,
    attributes: { title: title }
  });
};

// 导出为默认，方便使用
export default DOMHelper;