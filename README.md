# TreeDB - 树形结构数据库管理工具

一个基于Web的树形结构数据库可视化和编辑工具，支持SQLite数据库的树形数据管理。

## 项目结构

```
treedb/
├── 📁 public/                    # 前端静态资源
│   ├── index.html              # 主页面入口
│   ├── css/                    # 样式文件
│   │   ├── main.css           # 主样式和布局
│   │   └── components/        # 组件样式
│   │       ├── menus.css      # 菜单样式
│   │       ├── tree.css       # 树形组件样式
│   │       ├── controls.css   # 控制面板样式
│   │       ├── details.css    # 详情面板样式
│   │       └── modals.css     # 模态框和通知样式
│   └── js/                    # JavaScript文件
│       ├── main.js           # 主应用入口
│       ├── api/              # API调用模块
│       ├── config/           # 配置模块
│       ├── utils/            # 工具函数
│       └── ui/               # UI组件
├── 📁 server/                  # 后端服务器（模块化架构）
│   ├── app.py                # 应用入口
│   ├── server.py             # 服务器兼容层
│   ├── server_original.py    # 原始服务器备份
│   ├── server.js             # Node.js服务器
│   ├── config/               # 配置管理模块
│   │   └── settings.py       # 配置管理
│   ├── models/               # 数据模型
│   │   └── session.py        # 会话模型
│   ├── handlers/             # 请求处理器
│   │   └── api.py           # API处理器
│   ├── services/             # 业务服务
│   │   ├── session_service.py # 会话服务
│   │   └── database_service.py # 数据库服务
│   └── utils/                # 工具函数
│       └── helpers.py        # 通用工具
├── 📁 data/                    # 数据文件
│   └── databases/            # 数据库文件存储
│       └── treedb.sqlite     # 示例数据库
├── 📁 config/                  # 配置文件
│   ├── package.json          # Node.js项目配置
│   ├── env.txt               # 环境变量示例
│   └── servers.json          # 服务器配置
├── 📁 docs/                    # 项目文档
│   ├── 树形结构可视化与编辑工具开发.md  # 开发文档
│   ├── chat.json             # 聊天记录
│   └── data.json             # 数据文档
├── 📁 scripts/                 # 脚本文件
│   ├── start-server.ps1      # PowerShell启动脚本
│   └── start-multiple.ps1    # 多服务器启动脚本
├── 📁 backups/                 # 备份文件
├── 📁 .vscode/                 # VS Code配置
├── 🚀 start.py               # Python服务器启动脚本
├── 🚀 start.js               # Node.js服务器启动脚本
├── 🚀 start.bat              # Windows Python启动脚本
├── 🚀 start-node.bat         # Windows Node.js启动脚本
├── 📄 README.md              # 项目说明
└── 📄 .gitignore             # Git忽略文件
```

## 架构设计

### 后端架构（Python）
采用模块化设计，遵循SOLID原则：

- **app.py** - 应用入口，负责应用生命周期管理
- **config/** - 配置管理模块，统一管理应用配置
- **models/** - 数据模型，定义数据结构
- **handlers/** - 请求处理器，处理HTTP请求
- **services/** - 业务服务层，包含核心业务逻辑
- **utils/** - 工具函数，提供通用辅助功能

### 前端架构（JavaScript）
采用ES6模块化架构：

- **main.js** - 应用入口，协调各模块
- **api/** - API客户端，处理与后端通信
- **config/** - 配置管理，处理数据库配置
- **utils/** - 工具函数，提供通用功能
- **ui/** - UI组件，处理界面渲染和交互

## 功能特性

- 🌳 **树形结构可视化** - 直观显示层次化数据
- ✏️ **在线编辑** - 直接在浏览器中编辑节点数据
- 🔍 **智能搜索** - 快速查找和定位节点
- 📊 **数据导入导出** - 支持数据的备份和恢复
- 🎨 **主题切换** - 支持浅色/深色主题
- 📱 **响应式设计** - 适配不同屏幕尺寸
- 🔧 **灵活配置** - 支持自定义数据库表和字段
- 💾 **会话管理** - 多标签页数据同步和冲突处理

## 快速开始

### 方式1：使用启动脚本（推荐）

**Windows用户：**
```bash
# Python服务器
start.bat

# Node.js服务器
start-node.bat
```

**Linux/Mac用户：**
```bash
# Python服务器
python start.py
# 或者
./start.py

# Node.js服务器
node start.js
# 或者
./start.js
```

### 方式2：直接运行服务器文件

**Python服务器：**
```bash
python server/server.py
```

**Node.js服务器：**
```bash
node server/server.js
```

### 访问应用
浏览器打开 http://localhost:3000

## 环境变量配置

可以通过环境变量自定义配置：

```bash
# 服务器配置
HOST=127.0.0.1                    # 服务器地址
PORT=3000                         # 服务器端口

# 数据库配置
DB_PATH=./data/treedb.sqlite      # 数据库文件路径
TABLE_NAME=tree_nodes             # 表名
ID_FIELD=id                       # 主键字段名
PARENT_FIELD=parent_id            # 父节点字段名
AUTO_BOOTSTRAP=true               # 自动初始化表结构

# 会话配置
SESSION_TIMEOUT_SECONDS=1800      # 会话超时时间(秒)

# 文件浏览器配置
TREE_DB_BROWSER_ROOT=./           # 数据库文件浏览根目录
```

## 文档

- [架构文档](docs/architecture.md) - 详细的系统架构说明
- [开发文档](docs/树形结构可视化与编辑工具开发.md) - 历史开发记录

## 开发说明

### 前端架构

项目采用模块化的前端架构：

- **ES6模块** - 使用现代JavaScript模块系统
- **组件化CSS** - 样式按组件分离，便于维护
- **事件驱动** - 基于DOM事件的交互模式
- **响应式布局** - CSS Grid和Flexbox布局
- **渐进增强** - 基础功能优先，高级特性可选

### 数据流程

1. **配置阶段** - 用户配置数据库连接参数
2. **加载阶段** - 获取表结构和数据
3. **渲染阶段** - 构建树形结构UI
4. **交互阶段** - 处理用户操作和数据更新
5. **同步阶段** - 保存更改到数据库

### API接口

- `GET /api/nodes` - 获取所有节点数据
- `POST /api/nodes` - 创建新节点
- `PUT /api/nodes/:id` - 更新节点
- `DELETE /api/nodes/:id` - 删除节点及其子节点
- `GET /api/meta` - 获取表结构信息
- `GET /api/foreign/:field` - 获取外键选项
- `POST /api/config` - 应用配置
- `GET /api/config` - 获取当前配置

## 浏览器兼容性

- Chrome 60+
- Firefox 60+
- Safari 12+
- Edge 79+

## 许可证

MIT License

## 更新日志

### v2.0.0 (重构版本)
- ✨ 完全重构前端架构，模块化开发
- 🎨 优化UI设计和用户体验
- 🔧 改进项目结构和代码组织
- 📦 分离CSS和JavaScript文件
- 🚀 提升代码可维护性和扩展性
- 🔍 增强搜索功能和性能
- 💾 改进数据管理和会话处理

### v1.0.0
- 🎉 初始版本
- 🌳 基础树形结构显示
- ✏️ 节点编辑功能
- 🎨 主题切换
- 📱 响应式布局