/**
 * Config Module - 配置管理模块
 * 负责数据库连接配置的管理
 * 单一职责：处理配置相关功能
 */

import { DEFAULT_CONFIG, makeFieldId, hasMeaningfulConfigData, normalizeConfigSnapshot } from '../utils/core.js';
import { SessionConflictError } from '../utils/session.js';

/**
 * 配置管理器
 * 遵循单一职责原则：只负责配置管理
 */
export class ConfigManager {
  constructor(api, sessionManager) {
    this.api = api;
    this.sessionManager = sessionManager;
    this.currentConfig = {};
  }

  /**
   * 加载初始配置
   * @returns {Promise<Object|null>} - 配置对象
   */
  async loadInitialConfig() {
    // 如果没有会话，直接返回null
    if (!this.sessionManager.getCurrentSessionId()) {
      return null;
    }

    try {
      const config = await this.api.getConfig();
      if (config && hasMeaningfulConfigData(config)) {
        this.currentConfig = config;
        this.populateConfigForm(config);
        return config;
      }
      return null;
    } catch (error) {
      console.error('Failed to load config:', error);
      return null;
    }
  }

  /**
   * 保存配置
   * @param {Object} configData - 配置数据
   * @param {boolean} [force=false] - 是否强制保存
   * @returns {Promise<Object>} - 保存结果
   */
  async saveConfig(configData, force = false) {
    const config = this.validateAndNormalizeConfig(configData);

    try {
      let response;
      const sessionId = this.sessionManager.getCurrentSessionId();

      if (sessionId) {
        // 更新现有会话
        response = await this.sessionManager.updateSession(config, force);
      } else {
        // 创建新会话
        response = await this.sessionManager.createSession(config, force);
      }

      this.currentConfig = config;
      return response;

    } catch (error) {
      if (error instanceof SessionConflictError) {
        throw error;
      }
      throw new Error('配置保存失败: ' + error.message);
    }
  }

  /**
   * 获取数据库文件列表
   * @returns {Promise<Array>} - 文件列表
   */
  async getDbFiles() {
    try {
      return await this.api.getDbFiles();
    } catch (error) {
      console.error('Failed to get db files:', error);
      return [];
    }
  }

  /**
   * 获取表列表
   * @param {Object} dbConfig - 数据库配置
   * @returns {Promise<Array>} - 表列表
   */
  async getTables(dbConfig) {
    try {
      return await this.api.getTables(dbConfig);
    } catch (error) {
      console.error('Failed to get tables:', error);
      return [];
    }
  }

  /**
   * 测试数据库连接
   * @param {Object} config - 配置对象
   * @returns {Promise<boolean>} - 是否连接成功
   */
  async testConnection(config) {
    try {
      // 尝试创建临时会话来测试连接
      await this.api.createSession({
        ...config,
        test: true // 标记为测试连接
      });
      return true;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }

  /**
   * 从表单获取配置数据
   * @returns {Object} - 配置对象
   */
  getConfigFromForm() {
    const config = {};

    for (const [key, field] of Object.entries(DEFAULT_CONFIG)) {
      const element = document.getElementById(makeFieldId('config', key));
      if (element) {
        if (field.type === 'checkbox') {
          config[key] = element.checked;
        } else {
          config[key] = element.value;
        }
      }
    }

    return config;
  }

  /**
   * 填充配置表单
   * @param {Object} config - 配置对象
   */
  populateConfigForm(config) {
    for (const [key, field] of Object.entries(DEFAULT_CONFIG)) {
      const element = document.getElementById(makeFieldId('config', key));
      if (element) {
        if (field.type === 'checkbox') {
          element.checked = Boolean(config[key]?.value);
        } else {
          element.value = config[key]?.value || field.value || '';
        }
      }
    }
  }

  /**
   * 验证配置
   * @param {Object} config - 配置对象
   * @returns {Object} - 验证结果
   */
  validateConfig(config) {
    const errors = [];
    const warnings = [];

    // 必填字段验证
    const requiredFields = ['database', 'table', 'idField', 'parentField', 'nameField'];
    for (const field of requiredFields) {
      if (!config[field] || config[field].trim() === '') {
        errors.push(`${DEFAULT_CONFIG[field]?.label || field} 是必填字段`);
      }
    }

    // 字段名重复检查
    const fieldNames = [config.idField, config.parentField, config.nameField, config.sortField];
    const uniqueFields = new Set(fieldNames);
    if (uniqueFields.size !== fieldNames.length) {
      warnings.push('部分字段名重复，可能导致功能异常');
    }

    // 主机地址格式验证
    if (config.host) {
      const hostPattern = /^[a-zA-Z0-9.-]+$/;
      if (!hostPattern.test(config.host)) {
        errors.push('主机地址格式不正确');
      }
    }

    // 端口验证（如果包含在主机地址中）
    const hostPortMatch = config.host?.match(/:(\d+)$/);
    if (hostPortMatch) {
      const port = parseInt(hostPortMatch[1]);
      if (port < 1 || port > 65535) {
        errors.push('端口号必须在 1-65535 之间');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 验证并规范化配置
   * @private
   */
  validateAndNormalizeConfig(config) {
    const validation = this.validateConfig(config);

    if (!validation.isValid) {
      throw new Error('配置验证失败:\n' + validation.errors.join('\n'));
    }

    // 显示警告
    if (validation.warnings.length > 0) {
      console.warn('Configuration warnings:', validation.warnings);
    }

    // 规范化配置
    const normalized = {};
    for (const [key, value] of Object.entries(config)) {
      if (DEFAULT_CONFIG[key]) {
        normalized[key] = {
          value: value,
          label: DEFAULT_CONFIG[key].label,
          type: DEFAULT_CONFIG[key].type
        };
      }
    }

    return normalized;
  }

  /**
   * 获取当前配置
   * @returns {Object} - 当前配置
   */
  getCurrentConfig() {
    return { ...this.currentConfig };
  }

  /**
   * 获取配置快照
   * @returns {Object} - 配置快照
   */
  getConfigSnapshot() {
    return normalizeConfigSnapshot(this.currentConfig);
  }

  /**
   * 重置配置
   */
  resetConfig() {
    this.currentConfig = {};
    this.populateConfigForm({});
  }

  /**
   * 导出配置
   * @param {Object} [config] - 要导出的配置（默认使用当前配置）
   * @returns {string} - JSON格式的配置
   */
  exportConfig(config = this.currentConfig) {
    const exportData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      config: normalizeConfigSnapshot(config)
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * 导入配置
   * @param {string} configJson - JSON格式的配置
   * @returns {Object} - 导入的配置
   */
  importConfig(configJson) {
    try {
      const importData = JSON.parse(configJson);

      if (!importData.config) {
        throw new Error('Invalid configuration format');
      }

      // 验证导入的配置
      const validation = this.validateConfig(importData.config);
      if (!validation.isValid) {
        throw new Error('导入的配置无效:\n' + validation.errors.join('\n'));
      }

      return importData.config;
    } catch (error) {
      throw new Error('配置导入失败: ' + error.message);
    }
  }

  /**
   * 生成配置预设
   * @param {string} type - 预设类型
   * @returns {Object} - 预设配置
   */
  generatePreset(type) {
    const presets = {
      mysql: {
        host: 'localhost',
        user: 'root',
        database: 'treedb',
        table: 'categories',
        idField: 'id',
        parentField: 'parent_id',
        nameField: 'name',
        sortField: 'sort'
      },
      sqlite: {
        host: 'localhost',
        user: '',
        password: '',
        database: 'treedb.sqlite',
        table: 'categories',
        idField: 'id',
        parentField: 'parent_id',
        nameField: 'name',
        sortField: 'sort'
      },
      postgresql: {
        host: 'localhost',
        user: 'postgres',
        database: 'treedb',
        table: 'categories',
        idField: 'id',
        parentField: 'parent_id',
        nameField: 'name',
        sortField: 'sort'
      }
    };

    return presets[type] || presets.mysql;
  }
}

/**
 * 配置表单控制器
 */
export class ConfigFormController {
  constructor(configManager, sessionManager) {
    this.configManager = configManager;
    this.sessionManager = sessionManager;
    this.init();
  }

  /**
   * 初始化表单控制器
   */
  init() {
    // 保存按钮
    const saveButton = document.getElementById('save-config');
    if (saveButton) {
      saveButton.addEventListener('click', () => this.handleSave());
    }

    // 测试连接按钮
    const testButton = document.getElementById('test-connection');
    if (testButton) {
      testButton.addEventListener('click', () => this.handleTest());
    }

    // 数据库选择
    const dbSelect = document.getElementById('config-database');
    if (dbSelect) {
      dbSelect.addEventListener('change', () => this.handleDatabaseChange());
    }

    // 预设选择
    const presetSelect = document.getElementById('config-preset');
    if (presetSelect) {
      presetSelect.addEventListener('change', () => this.handlePresetChange());
    }

    // 导入/导出按钮
    const exportButton = document.getElementById('export-config');
    const importButton = document.getElementById('import-config');
    if (exportButton) {
      exportButton.addEventListener('click', () => this.handleExport());
    }
    if (importButton) {
      importButton.addEventListener('click', () => this.handleImport());
    }
  }

  /**
   * 处理保存
   */
  async handleSave() {
    try {
      const configData = this.configManager.getConfigFromForm();
      await this.configManager.saveConfig(configData);

      showToast('配置保存成功', 'success');
      this.hideConfigDialog();

      // 触发配置保存事件
      window.dispatchEvent(new CustomEvent('configSaved', {
        detail: { config: configData }
      }));
    } catch (error) {
      if (error.message.includes('正在被其他会话使用')) {
        // 显示强制选项
        const forceConfirm = confirm(
          error.message + '\n是否强制释放并继续？'
        );

        if (forceConfirm) {
          try {
            await this.configManager.saveConfig(configData, true);
            showToast('配置保存成功（已强制释放）', 'success');
            this.hideConfigDialog();
          } catch (forceError) {
            showToast('强制保存失败: ' + forceError.message, 'error');
          }
        }
      } else {
        showToast(error.message, 'error');
      }
    }
  }

  /**
   * 处理测试连接
   */
  async handleTest() {
    const configData = this.configManager.getConfigFromForm();
    const testButton = document.getElementById('test-connection');

    if (testButton) {
      testButton.disabled = true;
      testButton.textContent = '测试中...';
    }

    try {
      const success = await this.configManager.testConnection(configData);

      if (success) {
        showToast('连接测试成功', 'success');
      } else {
        showToast('连接测试失败', 'error');
      }
    } catch (error) {
      showToast('连接测试失败: ' + error.message, 'error');
    } finally {
      if (testButton) {
        testButton.disabled = false;
        testButton.textContent = '测试连接';
      }
    }
  }

  /**
   * 处理数据库变化
   */
  async handleDatabaseChange() {
    const configData = this.configManager.getConfigFromForm();
    if (!configData.host || !configData.user) return;

    try {
      const tables = await this.configManager.getTables(configData);
      const tableSelect = document.getElementById('config-table');

      if (tableSelect) {
        tableSelect.innerHTML = '<option value="">请选择...</option>';
        tables.forEach(table => {
          const option = document.createElement('option');
          option.value = table;
          option.textContent = table;
          tableSelect.appendChild(option);
        });
      }
    } catch (error) {
      console.error('Failed to load tables:', error);
    }
  }

  /**
   * 处理预设变化
   */
  handlePresetChange() {
    const presetSelect = document.getElementById('config-preset');
    if (!presetSelect) return;

    const presetType = presetSelect.value;
    if (!presetType) return;

    const preset = this.configManager.generatePreset(presetType);
    this.configManager.populateConfigForm(preset);
  }

  /**
   * 处理导出配置
   */
  handleExport() {
    const configJson = this.configManager.exportConfig();
    const blob = new Blob([configJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `treedb-config-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();

    URL.revokeObjectURL(url);
    showToast('配置已导出', 'success');
  }

  /**
   * 处理导入配置
   */
  handleImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const config = this.configManager.importConfig(event.target.result);
          this.configManager.populateConfigForm(config);
          showToast('配置导入成功', 'success');
        } catch (error) {
          showToast('配置导入失败: ' + error.message, 'error');
        }
      };
      reader.readAsText(file);
    };

    input.click();
  }

  /**
   * 显示配置对话框
   */
  showConfigDialog() {
    const dialog = document.getElementById('config-dialog');
    if (dialog) {
      dialog.style.display = 'flex';
    }
  }

  /**
   * 隐藏配置对话框
   */
  hideConfigDialog() {
    const dialog = document.getElementById('config-dialog');
    if (dialog) {
      dialog.style.display = 'none';
    }
  }
}