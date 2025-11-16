/**
 * TreeDB Main Application Entry
 * 主应用程序入口文件
 * 使用新的优化架构
 */

import { ApplicationBootstrap } from './core/application-bootstrap.js';
import { showToast } from './utils/utils.js';

/**
 * 主应用程序初始化
 */
async function initializeApp() {
  console.log('🚀 TreeDB v2.0.0 - 启动中...');

  // 创建应用实例
  const app = new ApplicationBootstrap();

  try {
    // 初始化应用
    await app.initialize();

    // 设置全局错误处理
    setupGlobalErrorHandling();

    // 设置页面卸载处理
    setupPageUnloadHandling(app);

    console.log('✅ TreeDB 启动成功！');

    // 显示欢迎信息
    if (document.visibilityState === 'visible') {
      showToast('欢迎使用 TreeDB 树形数据库管理工具', 'success');
    }

  } catch (error) {
    console.error('❌ TreeDB 启动失败:', error);
    showToast('应用程序启动失败，请刷新页面重试', 'error');

    // 尝试显示错误详情
    const errorContainer = document.getElementById('error-container');
    if (errorContainer) {
      errorContainer.style.display = 'block';
      errorContainer.innerHTML = `
        <h3>启动错误</h3>
        <p>${error.message}</p>
        <pre>${error.stack}</pre>
        <button onclick="location.reload()" class="btn btn-primary">
          重新加载
        </button>
      `;
    }
  }

  return app;
}

/**
 * 设置全局错误处理
 */
function setupGlobalErrorHandling() {
  // 捕获未处理的Promise错误
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    showToast('发生未预期的错误，请查看控制台', 'error');
  });

  // 捕获全局错误
  window.onerror = (message, source, lineno, colno, error) => {
    console.error('Global error:', { message, source, lineno, colno, error });
    return false; // 不阻止默认错误处理
  };
}

/**
 * 设置页面卸载处理
 * @param {ApplicationBootstrap} app - 应用实例
 */
function setupPageUnloadHandling(app) {
  // 页面卸载时清理资源
  window.addEventListener('beforeunload', async (event) => {
    // 检查是否有未保存的更改
    const detailsRenderer = app.getComponent('details');
    if (detailsRenderer && detailsRenderer.isEditMode) {
      event.preventDefault();
      event.returnValue = '您有未保存的更改，确定要离开吗？';
    }

    // 清理应用资源
    try {
      await app.destroy();
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  });

  // 页面隐藏时暂停某些操作
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      // 暂停自动刷新等操作
      console.log('📱 Page hidden, pausing background tasks');
    } else {
      // 恢复操作
      console.log('📱 Page visible, resuming tasks');
    }
  });
}

/**
 * 检查浏览器兼容性
 */
function checkBrowserCompatibility() {
  const requiredFeatures = [
    'Promise',
    'Map',
    'Set',
    'Array.prototype.includes',
    'Object.assign',
    'fetch'
  ];

  const missingFeatures = requiredFeatures.filter(feature => {
    if (feature.includes('.')) {
      const [obj, prop] = feature.split('.');
      return !window[obj][prop];
    }
    return !window[feature];
  });

  if (missingFeatures.length > 0) {
    const message = `您的浏览器不支持以下功能：${missingFeatures.join(', ')}\n` +
                   '请升级到最新版本的现代浏览器。';
    alert(message);
    return false;
  }

  return true;
}

/**
 * 应用启动
 */
(async () => {
  'use strict';

  // 检查浏览器兼容性
  if (!checkBrowserCompatibility()) {
    return;
  }

  // 等待DOM准备就绪
  if (document.readyState === 'loading') {
    await new Promise(resolve => {
      document.addEventListener('DOMContentLoaded', resolve);
    });
  }

  // 初始化应用
  const app = await initializeApp();

  // 暴露到全局供调试使用
  if (typeof window !== 'undefined') {
    window.TreedbApp = app;
  }
})();