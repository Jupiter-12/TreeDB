/**
 * File Selector Component
 * 文件选择器组件
 * 用于选择数据库文件
 */

import { showSuccess, showInfo, showError } from '../ui/toast.js';

export class FileSelector {
  constructor() {
    this.modal = null;
  }

  /**
   * 显示文件选择对话框
   * @param {Function} onSelect - 选择文件时的回调函数
   */
  async show(onSelect) {
    try {
      // 获取文件列表
      const response = await fetch('/api/config/db-files');
      const data = await response.json();

      if (response.ok && data.success && data.files && data.files.length > 0) {
        this.showFileList(data.files, onSelect);
      } else {
        this.showUploadOptions(onSelect);
      }

    } catch (error) {
      console.error('Failed to get database files:', error);
      this.showUploadOptions(onSelect);
    }
  }

  /**
   * 显示文件列表
   * @param {Array} files - 文件列表
   * @param {Function} onSelect - 选择回调
   */
  showFileList(files, onSelect) {
    this.createModal(`
      <div class="modal">
        <div class="modal-header">
          <h3>选择数据库文件</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="file-list">
            ${files.map(file => `
              <div class="file-item" data-path="${file.path}">
                <div class="file-info">
                  <div class="file-name">${file.name}</div>
                  <div class="file-details">
                    ${this.formatFileSize(file.size)} •
                    ${new Date(file.modified * 1000).toLocaleString()}
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" id="uploadNew">上传新文件</button>
          <button type="button" class="btn" id="cancelSelect">取消</button>
        </div>
      </div>
    `);

    // 绑定事件
    this.bindEvents(onSelect);
  }

  /**
   * 显示上传选项
   * @param {Function} onSelect - 选择回调
   */
  showUploadOptions(onSelect) {
    this.createModal(`
      <div class="modal">
        <div class="modal-header">
          <h3>数据库文件</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <p>当前没有可用的数据库文件。</p>
          <p>您可以：</p>
          <ul>
            <li>上传新的数据库文件</li>
            <li>手动输入文件路径</li>
          </ul>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-primary" id="uploadFile">上传文件</button>
          <button type="button" class="btn" id="closeDialog">关闭</button>
        </div>
      </div>
    `);

    // 绑定事件
    const uploadBtn = this.modal.querySelector('#uploadFile');
    const closeBtn = this.modal.querySelector('#closeDialog');

    uploadBtn.addEventListener('click', () => {
      this.closeModal();
      this.uploadFile(onSelect);
    });

    closeBtn.addEventListener('click', () => {
      this.closeModal();
    });

    this.bindCloseEvents();
  }

  /**
   * 创建模态框
   * @param {string} content - HTML内容
   */
  createModal(content) {
    this.modal = document.createElement('div');
    this.modal.className = 'file-selector-modal';
    this.modal.innerHTML = `
      <div class="modal-overlay">
        ${content}
      </div>
    `;

    document.body.appendChild(this.modal);

    // 显示动画
    requestAnimationFrame(() => {
      this.modal.classList.add('show');
    });
  }

  /**
   * 绑定事件
   * @param {Function} onSelect - 选择回调
   */
  bindEvents(onSelect) {
    const closeBtn = this.modal.querySelector('.modal-close');
    const cancelBtn = this.modal.querySelector('#cancelSelect');
    const uploadBtn = this.modal.querySelector('#uploadNew');
    const fileItems = this.modal.querySelectorAll('.file-item');

    // 关闭事件
    closeBtn.addEventListener('click', () => this.closeModal());
    cancelBtn.addEventListener('click', () => this.closeModal());

    // 上传文件
    if (uploadBtn) {
      uploadBtn.addEventListener('click', () => {
        this.closeModal();
        this.uploadFile(onSelect);
      });
    }

    // 选择文件
    fileItems.forEach(item => {
      item.addEventListener('click', () => {
        const path = item.dataset.path;
        const name = item.querySelector('.file-name').textContent;

        this.closeModal();
        showSuccess(`已选择文件: ${name}`);

        if (onSelect) {
          onSelect(path, name);
        }
      });
    });

    this.bindCloseEvents();
  }

  /**
   * 绑定关闭事件
   */
  bindCloseEvents() {
    const overlay = this.modal.querySelector('.modal-overlay');

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.closeModal();
      }
    });

    // ESC键关闭
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        this.closeModal();
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);
  }

  /**
   * 上传文件
   * @param {Function} onSelect - 选择回调
   */
  uploadFile(onSelect) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.db,.sqlite,.sqlite3';
    input.style.display = 'none';

    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (file) {
        await this.doUpload(file, onSelect);
      }
      document.body.removeChild(input);
    };

    document.body.appendChild(input);
    input.click();
  }

  /**
   * 执行上传
   * @param {File} file - 文件对象
   * @param {Function} onSelect - 选择回调
   */
  async doUpload(file, onSelect) {
    try {
      showInfo(`正在上传文件: ${file.name}`);

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (response.ok && result.success) {
        showSuccess(result.message);
        if (onSelect) {
          onSelect(result.path, file.name);
        }
      } else {
        showError(result.error || '上传失败');
      }

    } catch (error) {
      console.error('Upload failed:', error);
      showError('上传失败: ' + error.message);
    }
  }

  /**
   * 关闭模态框
   */
  closeModal() {
    if (this.modal) {
      this.modal.classList.remove('show');
      setTimeout(() => {
        if (this.modal.parentNode) {
          document.body.removeChild(this.modal);
        }
        this.modal = null;
      }, 300);
    }
  }

  /**
   * 格式化文件大小
   * @param {number} bytes - 字节数
   */
  formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
}