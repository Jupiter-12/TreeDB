const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const sqlite3 = require('sqlite3').verbose();

const PORT = Number(process.env.PORT || 3000);
const STATIC_ROOT = __dirname;
const DB_PATH = process.env.DB_PATH || path.join(STATIC_ROOT, 'treedb.sqlite');
const TABLE_NAME = process.env.TABLE_NAME || 'tree_nodes';
const ID_FIELD = process.env.ID_FIELD || 'id';
const PARENT_FIELD = process.env.PARENT_FIELD || 'parent_id';
const AUTO_BOOTSTRAP = process.env.AUTO_BOOTSTRAP !== 'false';

const db = new sqlite3.Database(DB_PATH, err => {
  if (err) {
    console.error('无法连接数据库', err);
    process.exit(1);
  }
});

db.serialize(() => {
  db.run('PRAGMA foreign_keys = ON');
  if (AUTO_BOOTSTRAP) {
    const createSql = `CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
      ${ID_FIELD} INTEGER PRIMARY KEY AUTOINCREMENT,
      ${PARENT_FIELD} INTEGER REFERENCES ${TABLE_NAME}(${ID_FIELD}) ON DELETE SET NULL,
      name TEXT,
      manager TEXT,
      budget REAL
    )`;
    db.run(createSql, err => {
      if (err) {
        console.warn('初始化表结构失败，可忽略：', err.message);
      }
    });
    db.get(`SELECT COUNT(*) AS count FROM ${TABLE_NAME}`, (err, row) => {
      if (err) {
        console.warn('检查初始数据失败：', err.message);
        return;
      }
      if (row && row.count === 0) {
        const insert = db.prepare(`INSERT INTO ${TABLE_NAME} (${PARENT_FIELD}, name, manager, budget) VALUES (?, ?, ?, ?)`);
        insert.run(null, '总部', 'Alice', 3000000);
        insert.run(1, '财务部', 'Bob', 800000);
        insert.run(1, '技术部', 'Carol', 1200000);
        insert.run(3, '后端组', 'David', 450000);
        insert.run(3, '前端组', 'Eve', 420000);
        insert.finalize();
      }
    });
  }
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/nodes')) {
    return handleApi(req, res, url);
  }
  return serveStatic(req, res, url);
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/nodes') {
    db.all(`SELECT * FROM ${TABLE_NAME} ORDER BY ${ID_FIELD}`, (err, rows) => {
      if (err) {
        return sendError(res, 500, err.message);
      }
      return sendJson(res, 200, rows);
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/nodes') {
    return readJsonBody(req, res, body => {
      const payload = sanitizePayload(body);
      const columns = Object.keys(payload).filter(key => key !== ID_FIELD);
      if (!columns.length) {
        return sendError(res, 400, '无可插入的字段');
      }
      const placeholders = columns.map(() => '?').join(', ');
      const sql = `INSERT INTO ${TABLE_NAME} (${columns.join(', ')}) VALUES (${placeholders})`;
      const values = columns.map(col => normalizeIncomingValue(col, payload[col]));
      db.run(sql, values, function insertCallback(err) {
        if (err) {
          return sendError(res, 500, err.message);
        }
        db.get(`SELECT * FROM ${TABLE_NAME} WHERE ${ID_FIELD} = ?`, [this.lastID], (fetchErr, row) => {
          if (fetchErr) {
            return sendError(res, 500, fetchErr.message);
          }
          return sendJson(res, 201, row);
        });
      });
    });
  }

  const idMatch = url.pathname.match(/\/api\/nodes\/(\d+)/);
  if (!idMatch) {
    return sendError(res, 404, '未找到接口');
  }
  const targetId = Number(idMatch[1]);
  if (!Number.isInteger(targetId)) {
    return sendError(res, 400, '非法的 id');
  }

  if (req.method === 'PUT') {
    return readJsonBody(req, res, body => {
      const payload = sanitizePayload(body);
      const columns = Object.keys(payload).filter(key => key !== ID_FIELD);
      if (!columns.length) {
        return sendError(res, 400, '无可更新的字段');
      }
      const assignments = columns.map(col => `${col} = ?`).join(', ');
      const sql = `UPDATE ${TABLE_NAME} SET ${assignments} WHERE ${ID_FIELD} = ?`;
      const values = columns.map(col => normalizeIncomingValue(col, payload[col]));
      values.push(targetId);
      db.run(sql, values, function updateCallback(err) {
        if (err) {
          return sendError(res, 500, err.message);
        }
        if (this.changes === 0) {
          return sendError(res, 404, '记录不存在');
        }
        db.get(`SELECT * FROM ${TABLE_NAME} WHERE ${ID_FIELD} = ?`, [targetId], (fetchErr, row) => {
          if (fetchErr) {
            return sendError(res, 500, fetchErr.message);
          }
          return sendJson(res, 200, row);
        });
      });
    });
  }

  if (req.method === 'DELETE') {
    const sql = `WITH RECURSIVE subtree(id) AS (
      SELECT ${ID_FIELD} FROM ${TABLE_NAME} WHERE ${ID_FIELD} = ?
      UNION ALL
      SELECT t.${ID_FIELD} FROM ${TABLE_NAME} t JOIN subtree s ON t.${PARENT_FIELD} = s.id
    )
    SELECT id FROM subtree`;
    db.all(sql, [targetId], (err, rows) => {
      if (err) {
        return sendError(res, 500, err.message);
      }
      if (!rows.length) {
        return sendError(res, 404, '记录不存在');
      }
      const ids = rows.map(r => r.id);
      const placeholders = ids.map(() => '?').join(', ');
      db.run(`DELETE FROM ${TABLE_NAME} WHERE ${ID_FIELD} IN (${placeholders})`, ids, function deleteCallback(delErr) {
        if (delErr) {
          return sendError(res, 500, delErr.message);
        }
        return sendNoContent(res);
      });
    });
    return;
  }

  return sendError(res, 405, '不支持的请求方法');
}

function serveStatic(req, res, url) {
  let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
  filePath = decodeURIComponent(filePath);
  const resolvedPath = path.normalize(path.join(STATIC_ROOT, filePath));
  if (!resolvedPath.startsWith(STATIC_ROOT)) {
    return sendError(res, 403, '禁止访问');
  }
  fs.stat(resolvedPath, (err, stats) => {
    if (err || !stats.isFile()) {
      return sendError(res, 404, '文件不存在');
    }
    const stream = fs.createReadStream(resolvedPath);
    stream.on('open', () => {
      res.writeHead(200, {
        'Content-Type': getMimeType(resolvedPath),
        'Cache-Control': 'no-store'
      });
    });
    stream.on('error', streamErr => {
      sendError(res, 500, streamErr.message);
    });
    stream.pipe(res);
  });
}

function readJsonBody(req, res, callback) {
  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => {
    if (!chunks.length) {
      return callback({});
    }
    try {
      const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      callback(parsed);
    } catch (err) {
      sendError(res, 400, 'JSON 解析失败');
    }
  });
}

function sanitizePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return {};
  }
  const cleaned = {};
  Object.keys(payload).forEach(key => {
    cleaned[key] = payload[key];
  });
  return cleaned;
}

function normalizeIncomingValue(key, value) {
  if (value === '' || value === undefined) {
    return null;
  }
  if (key === PARENT_FIELD || key.toLowerCase().includes('id')) {
    const numeric = Number(value);
    return Number.isNaN(numeric) ? null : numeric;
  }
  return value;
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

function sendNoContent(res) {
  res.writeHead(204, {
    'Cache-Control': 'no-store'
  });
  res.end();
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
      return 'application/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}
