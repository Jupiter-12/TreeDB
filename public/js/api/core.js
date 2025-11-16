/**
 * API Core Constants
 * API核心���量定义
 */

// API端点常量
export const API_ENDPOINT = '/api/nodes';
export const META_ENDPOINT = '/api/meta';
export const FOREIGN_ENDPOINT_BASE = '/api/foreign/';
export const RESTORE_ENDPOINT = '/api/restore';
export const SORT_REBUILD_ENDPOINT = '/api/rebuild-sort';
export const CONFIG_ENDPOINT = '/api/config';
export const CONFIG_DB_FILES_ENDPOINT = '/api/config/db-files';
export const CONFIG_TABLES_ENDPOINT = '/api/tables';
export const SESSION_ENDPOINT = '/api/session';

// HTTP方法常量
export const HTTP_METHODS = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  DELETE: 'DELETE',
  PATCH: 'PATCH'
};

// 响应状态码常量
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500
};

// 请求头常量
export const REQUEST_HEADERS = {
  CONTENT_TYPE: 'Content-Type',
  ACCEPT: 'Accept',
  AUTHORIZATION: 'Authorization'
};

// 内容类型常量
export const CONTENT_TYPES = {
  JSON: 'application/json',
  FORM_DATA: 'multipart/form-data',
  URL_ENCODED: 'application/x-www-form-urlencoded'
};