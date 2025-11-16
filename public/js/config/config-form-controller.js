/**
 * Configuration Form Controller
 * 配置表单控制器
 * 处理数据库配置表单的所有交互
 */

import { showToast, showSuccess, showError, showWarning, showInfo } from '../ui/toast.js';

export class ConfigFormController {
  constructor(apiClient, formSelector = '#configForm') {
    this.api = apiClient;
    this.form = document.querySelector(formSelector);

    // 表单元素
    this.elements = {
      dbPath: document.querySelector('#configDbPath'),
      tableName: document.querySelector('#configTableName'),
      idField: document.querySelector('#configIdField'),
      parentField: document.querySelector('#configParentField'),
      autoBootstrap: document.querySelector('#configAutoBootstrap'),
      browseBtn: document.querySelector('#configBrowseDb'),
      fetchTablesBtn: document.querySelector('#configFetchTables'),
      refreshBtn: document.querySelector('#configRefresh'),
      tableSelectModal: document.querySelector('#tableSelectModal'),
      tableModalMessage: document.querySelector('#tableModalMessage'),
      tableModalList: document.querySelector('#tableModalList'),
      closeTableModal: document.querySelector('#closeTableModal'),
      cancelTableSelect: document.querySelector('#cancelTableSelect'),
      confirmTableSelect: document.querySelector('#confirmTableSelect')
    };

    // 表选择相关状态
    this.availableTables = [];
    this.selectedTable = null;

    // 调试输出
    console.log('ConfigFormController initialized:', {
      form: !!this.form,
      elements: {
        browseBtn: !!this.elements.browseBtn,
        fetchTablesBtn: !!this.elements.fetchTablesBtn,
        refreshBtn: !!this.elements.refreshBtn
      }
    });

    // 初始化事件监听
    this.initializeEventListeners();
  }

  /**
   * 初始化事件监听器
   */
  initializeEventListeners() {
    // 表单提交
    if (this.form) {
      this.form.addEventListener('submit', (e) => this.handleFormSubmit(e));
    }

    // 浏览数据库文件
    if (this.elements.browseBtn) {
      console.log('Setting up browse button listener...');
      this.elements.browseBtn.addEventListener('click', () => {
        console.log('Browse button clicked!');
        this.browseDatabase();
      });
      this.elements.browseBtn.addEventListener('mousedown', () => {
        console.log('Browse button mousedown!');
      });
    } else {
      console.error('Browse button not found!');
    }

    // 获取表列表
    if (this.elements.fetchTablesBtn) {
      this.elements.fetchTablesBtn.addEventListener('click', () => this.fetchTables());
    }

    // 刷新配置
    if (this.elements.refreshBtn) {
      this.elements.refreshBtn.addEventListener('click', () => this.refreshConfig());
    }

    // 数据库路径变化时清空表列表
    if (this.elements.dbPath) {
      this.elements.dbPath.addEventListener('change', () => {
        this.availableTables = [];
        this.selectedTable = null;
      });
    }

    // 表选择模态框事件
    if (this.elements.closeTableModal) {
      this.elements.closeTableModal.addEventListener('click', () => this.hideTableModal());
    }
    if (this.elements.cancelTableSelect) {
      this.elements.cancelTableSelect.addEventListener('click', () => this.hideTableModal());
    }
    if (this.elements.confirmTableSelect) {
      this.elements.confirmTableSelect.addEventListener('click', () => this.confirmTableSelection());
    }

    // ESC键关闭模态框
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.elements.tableSelectModal.classList.contains('show')) {
        this.hideTableModal();
      }
    });

    // 点击模态框背景关闭
    if (this.elements.tableSelectModal) {
      this.elements.tableSelectModal.addEventListener('click', (e) => {
        if (e.target === this.elements.tableSelectModal) {
          this.hideTableModal();
        }
      });
    }
  }

  /**
   * 处理表单提交
   * @param {Event} e - 提交事件
   */
  async handleFormSubmit(e) {
    e.preventDefault();

    if (!this.form) return;

    const formData = new FormData(this.form);
    const dbPath = formData.get('db_path');

    // 构建完整的数据库路径
    let fullDbPath = dbPath;
    if (dbPath) {
      // 如果是相对路径（不包含驱动器字母），构建相对路径
      if (!dbPath.includes(':') && !dbPath.startsWith('/')) {
        fullDbPath = `data/databases/${dbPath}`;
      }
    }

    const config = {
      DB_PATH: fullDbPath,
      TABLE_NAME: formData.get('table_name'),
      ID_FIELD: formData.get('id_field'),
      PARENT_FIELD: formData.get('parent_field'),
      AUTO_BOOTSTRAP: formData.has('auto_bootstrap')
    };

    try {
      // 显示加载状态
      this.setLoading(true);

      // 验证配置
      await this.validateConfig(config);

      // 应用配置
      await this.applyConfig(config);

      showSuccess('配置应用成功');

      // 触发配置更新事件
      console.log('Calling onConfigChanged...');
      this.onConfigChanged(config);

    } catch (error) {
      console.error('Failed to apply config:', error);
      showError(`配置失败: ${error.message}`);
    } finally {
      this.setLoading(false);
    }
  }

  /**
   * 浏览数据库文件
   */
  async browseDatabase() {
    try {
      // 创建文件输入元素
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.db,.sqlite,.sqlite3';

      input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
          // For security, browsers only provide filename, not full path
          // We'll use the filename and let the server find it in data/databases
          const fileName = file.name;
          this.elements.dbPath.value = fileName;

          // 显示提示信息
          showInfo(`已选择文件: ${fileName}`);

          // 自动获取表列表
          this.fetchTables();
        }
      };

      // 触发文件选择
      input.click();

    } catch (error) {
      console.error('Failed to browse database:', error);
      showWarning('无法浏览文件，请手动输入路径');
    }
  }

  /**
   * 获取数据库表列表
   */
  async fetchTables() {
    console.log('Fetch tables button clicked!');

    const dbPath = this.elements.dbPath?.value?.trim();

    if (!dbPath) {
      showWarning('请先输入数据库文件路径');
      return;
    }

    try {
      this.setLoading(true, this.elements.fetchTablesBtn);

      // 构建URL参数
      const params = new URLSearchParams({ db_path: dbPath });

      // 调用API获取表列表
      const response = await fetch(`/api/config/tables?${params}`);
      const data = await response.json();

      if (response.ok && data.success) {
        this.availableTables = data.tables;
        this.showTableModal(data.tables);
        showSuccess(`找到 ${data.count} 个表`);
      } else {
        showWarning(data.error || '数据库中没有找到表');
      }

    } catch (error) {
      console.error('Failed to fetch tables:', error);
      showError('获取表列表失败: ' + error.message);
    } finally {
      this.setLoading(false, this.elements.fetchTablesBtn);
    }
  }

  /**
   * 刷新配置
   */
  async refreshConfig() {
    try {
      this.setLoading(true, this.elements.refreshBtn);

      // 获取会话ID
      const sessionId = localStorage.getItem('treedb.activeSessionId');
      if (!sessionId) {
        showWarning('会话已过期，请刷新页面重试');
        return;
      }

      const response = await fetch(`/api/config?session=${encodeURIComponent(sessionId)}`);
      const data = await response.json();

      if (response.ok && data.config) {
        this.populateForm(data.config);
        showSuccess('配置已刷新');
        this.onConfigChanged(data.config);
      } else {
        showWarning('刷新配置失败');
      }

    } catch (error) {
      console.error('Failed to refresh config:', error);
      showError('刷新配置失败: ' + error.message);
    } finally {
      this.setLoading(false, this.elements.refreshBtn);
    }
  }

  /**
   * 验证配置
   * @param {Object} config - 配置对象
   */
  async validateConfig(config) {
    // 基本验证
    if (!config.DB_PATH) {
      throw new Error('数据库文件路径不能为空');
    }

    if (!config.TABLE_NAME) {
      throw new Error('表名不能为空');
    }

    if (!config.ID_FIELD) {
      throw new Error('主键字段不能为空');
    }

    if (!config.PARENT_FIELD) {
      throw new Error('父节点字段不能为空');
    }
  }

  /**
   * 应用配置
   * @param {Object} config - 配置对象
   */
  async applyConfig(config) {
    // 获取会话ID
    let sessionId = localStorage.getItem('treedb.activeSessionId');

    // 如果没有会话，创建一个
    if (!sessionId) {
      // 首先尝试清理可能存在的冲突会话
      await this.cleanupConflictingSessions(config);

      const response = await fetch('/api/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(config)
      });

      const result = await response.json();
      console.log('Session creation response:', result);

      // 检查响应状态和内容
      if (response.ok) {
        // 成功创建会话
        if (result.data && result.data.sessionId) {
          sessionId = result.data.sessionId;
          localStorage.setItem('treedb.activeSessionId', sessionId);
          // 同时更新 sessionManager 的状态（如果存在）
          if (window.treedb && window.treedb.app && window.treedb.app.sessionManager) {
            window.treedb.app.sessionManager.setSessionId(sessionId);
          }
          console.log('Session created successfully:', sessionId);
        } else {
          throw new Error('会话响应格式错误');
        }
      } else if (response.status === 409) {
        // 会话冲突
        console.log('Session conflict detected, asking user to force...');

        // 询问用户是否强制覆盖
        const forceOverride = confirm(
          '该数据库已被其他会话使用。\n' +
          '是否要强制覆盖现有会话？\n\n' +
          '注意：这可能会断开其他标签页的连接。'
        );

        if (forceOverride) {
          // 创建一个临时会话ID来使用force参数
          const tempSessionId = 'temp-' + Date.now();

          // 首先尝试使用PUT请求强制更新一个不存在的会话（这会创建新会话）
          const forceResponse = await fetch(`/api/session/${tempSessionId}?force=true`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(config)
          });

          const forceResult = await forceResponse.json();
          console.log('Force create response:', forceResult);

          if (forceResult.data && forceResult.data.sessionId) {
            sessionId = forceResult.data.sessionId;
            localStorage.setItem('treedb.activeSessionId', sessionId);
            console.log('Session created with force:', sessionId);
          } else {
            // 如果PUT也不行，尝试直接使用现有会话
            // 先尝试获取所有会话找到一个匹配的
            try {
              const sessionsResponse = await fetch('/api/session');
              if (sessionsResponse.ok) {
                const sessions = await sessionsResponse.json();
                if (Array.isArray(sessions)) {
                  // 查找使用相同资源的会话
                  const existingSession = sessions.find(s =>
                    s.config &&
                    s.config.DB_PATH === config.DB_PATH &&
                    s.config.TABLE_NAME === config.TABLE_NAME
                  );

                  if (existingSession) {
                    sessionId = existingSession.id;
                    localStorage.setItem('treedb.activeSessionId', sessionId);
                    console.log('Using existing session:', sessionId);
                  }
                }
              }
            } catch (e) {
              console.warn('Failed to find existing session:', e);
            }

            if (!sessionId) {
              throw new Error(result.message || '创建会话失败');
            }
          }
        } else {
          throw new Error('用户取消了操作');
        }
      } else {
        // 其他错误
        console.error('Session creation error:', result);
        throw new Error(result.message || '创建会话失败');
      }
    }

    // 更新配置
    const configResponse = await fetch(`/api/config?session=${encodeURIComponent(sessionId)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(config)
    });

    const configResult = await configResponse.json();
    console.log('Config response:', configResult);

    // 检查是否成功
    if (configResponse.ok) {
      return configResult;
    } else if (configResponse.status === 409) {
      // 配置更新冲突，尝试强制更新
      console.log('Config update conflict, forcing...');

      const forceResponse = await fetch(`/api/session/${sessionId}?force=true`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(config)
      });

      const forceResult = await forceResponse.json();
      if (!forceResponse.ok) {
        throw new Error(forceResult.message || '应用配置失败');
      }

      return forceResult;
    } else {
      throw new Error(configResult.message || '应用配置失败');
    }
  }

  /**
   * 填充表单数据
   * @param {Object} config - 配置对象
   */
  populateForm(config) {
    if (this.elements.dbPath) this.elements.dbPath.value = config.db_path || '';
    if (this.elements.tableName) this.elements.tableName.value = config.table_name || '';
    if (this.elements.idField) this.elements.idField.value = config.id_field || 'id';
    if (this.elements.parentField) this.elements.parentField.value = config.parent_field || 'parent_id';
    if (this.elements.autoBootstrap) {
      this.elements.autoBootstrap.checked = config.auto_bootstrap || false;
    }
  }

  /**
   * 显示表选择模态框
   * @param {Array} tables - 表名数组
   */
  showTableModal(tables) {
    if (!this.elements.tableSelectModal || !this.elements.tableModalList) return;

    // 设置消息
    const dbPath = this.elements.dbPath?.value || '';
    this.elements.tableModalMessage.textContent = `数据库 ${dbPath} 中找到以下表：`;

    // 清空现有列表
    this.elements.tableModalList.innerHTML = '';

    if (tables.length === 0) {
      this.elements.tableModalList.innerHTML = '<p style="text-align: center; color: var(--color-text-secondary);">没有找到表</p>';
    } else {
      // 添加表选项
      tables.forEach(table => {
        const tableItem = document.createElement('div');
        tableItem.className = 'table-item';

        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'tableSelection';
        radio.value = table;
        radio.id = `table_${table}`;

        const label = document.createElement('label');
        label.htmlFor = `table_${table}`;
        label.textContent = table;

        // 如果表名与当前输入框的值相同，则选中它
        if (this.elements.tableName.value === table) {
          radio.checked = true;
          tableItem.classList.add('selected');
        }

        // 添加点击事件
        tableItem.addEventListener('click', () => {
          document.querySelectorAll('.table-item').forEach(item => {
            item.classList.remove('selected');
            item.querySelector('input[type="radio"]').checked = false;
          });
          radio.checked = true;
          tableItem.classList.add('selected');
        });

        tableItem.appendChild(radio);
        tableItem.appendChild(label);
        this.elements.tableModalList.appendChild(tableItem);
      });
    }

    // 显示模态框
    this.elements.tableSelectModal.style.display = 'block';
    requestAnimationFrame(() => {
      this.elements.tableSelectModal.classList.add('show');
    });

    // 阻止背景滚动
    document.body.style.overflow = 'hidden';
  }

  /**
   * 隐藏表选择模态框
   */
  hideTableModal() {
    if (this.elements.tableSelectModal) {
      this.elements.tableSelectModal.classList.remove('show');
      setTimeout(() => {
        this.elements.tableSelectModal.style.display = 'none';
      }, 200);
    }
    // 恢复背景滚动
    document.body.style.overflow = '';
  }

  /**
   * 确认表选择
   */
  confirmTableSelection() {
    const selectedRadio = this.elements.tableModalList.querySelector('input[type="radio"]:checked');

    if (selectedRadio) {
      this.elements.tableName.value = selectedRadio.value;
      this.selectedTable = selectedRadio.value;

      // 触发表名输入框的change事件
      this.elements.tableName.dispatchEvent(new Event('change'));
    }

    this.hideTableModal();
  }

  /**
   * 设置加载状态
   * @param {boolean} loading - 是否加载中
   * @param {Element} button - 按钮元素（可选）
   */
  setLoading(loading, button = null) {
    const buttons = button ? [button] : [
      this.elements.browseBtn,
      this.elements.fetchTablesBtn,
      this.elements.refreshBtn
    ];

    buttons.forEach(btn => {
      if (btn) {
        btn.disabled = loading;
        if (loading) {
          btn.dataset.originalText = btn.textContent;
          btn.textContent = '处理中...';
        } else {
          btn.textContent = btn.dataset.originalText || btn.textContent;
        }
      }
    });

    // 设置表单提交按钮
    const submitBtn = this.form?.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = loading;
    }
  }

  /**
   * 配置变化回调（可被重写）
   * @param {Object} config - 新配置
   */
  onConfigChanged(config) {
    // 触发自定义事件
    console.log('Dispatching configChanged event with config:', config);
    const event = new CustomEvent('configChanged', {
      detail: config
    });
    document.dispatchEvent(event);
    console.log('configChanged event dispatched');

    // 直接调用全局方法（如果存在）
    if (window.treedb && window.treedb.app && window.treedb.app.handleConfigChanged) {
      console.log('Calling global app.handleConfigChanged directly');
      window.treedb.app.handleConfigChanged({ detail: config });
    }
  }

  /**
   * 获取当前表单配置
   * @returns {Object} 配置对象
   */
  getCurrentConfig() {
    return {
      db_path: this.elements.dbPath?.value || '',
      table_name: this.elements.tableName?.value || '',
      id_field: this.elements.idField?.value || 'id',
      parent_field: this.elements.parentField?.value || 'parent_id',
      auto_bootstrap: this.elements.autoBootstrap?.checked || false
    };
  }

  /**
   * 重置表单
   */
  resetForm() {
    if (this.form) {
      this.form.reset();
    }
    this.clearTableSuggestions();
  }

  /**
   * 显示配置对话框（切换到配置面板）
   */
  showConfigDialog() {
    // 切换到配置面板
    const modeSelect = document.querySelector('#controlPanelMode');
    if (modeSelect) {
      modeSelect.value = 'config';
      // 触发change事件
      modeSelect.dispatchEvent(new Event('change'));
    }

    // 展开控制面板（如果折叠了）
    const leftColumn = document.querySelector('#leftColumn');
    if (leftColumn && leftColumn.style.display === 'none') {
      leftColumn.style.display = 'flex';
    }

    // 聚焦到数据库路径输入框
    if (this.elements.dbPath) {
      this.elements.dbPath.focus();
    }
  }

  
  /**
   * 清理冲突的会话
   * @param {Object} config - 配置对象
   */
  async cleanupConflictingSessions(config) {
    try {
      // 获取所有会话
      const sessionsResponse = await fetch('/api/session');
      if (!sessionsResponse.ok) {
        console.warn('Failed to get sessions for cleanup:', sessionsResponse.status);
        return;
      }

      const sessions = await sessionsResponse.json();
      if (!Array.isArray(sessions)) {
        console.warn('Sessions response is not an array:', sessions);
        return;
      }

      const now = Date.now();
      const sessionTimeout = 30 * 60 * 1000; // 30 minutes

      // 清理过期或孤立的会话
      for (const session of sessions) {
        const sessionAge = now - (session.lastAccess || 0);
        const isExpired = sessionAge > sessionTimeout;

        // 清理过期或使用相同资源的会话
        if (isExpired ||
            (session.config &&
             session.config.DB_PATH === config.DB_PATH &&
             session.config.TABLE_NAME === config.TABLE_NAME)) {
          console.log('Cleaning up session:', session.id, isExpired ? '(expired)' : '(conflicting)');
          try {
            await fetch(`/api/session/${session.id}`, {
              method: 'DELETE'
            });
          } catch (e) {
            console.warn('Failed to delete session:', session.id, e);
          }
        }
      }
    } catch (error) {
      console.warn('Failed to cleanup sessions:', error);
    }
  }

  /**
   * 销毁控制器
   */
  destroy() {
    // 移除事件监听器
    if (this.form) {
      this.form.removeEventListener('submit', this.handleFormSubmit);
    }

    // 清理元素引用
    this.elements = {};
    this.form = null;
  }
}