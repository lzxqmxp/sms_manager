// 数据库模块 - 使用 SQLite3 存储数据
import Database from 'better-sqlite3'
import path from 'node:path'
import { app } from 'electron'

let db: Database.Database | null = null

/**
 * 初始化数据库连接
 * @returns Database 实例
 */
export function initDatabase(): Database.Database {
  if (db) return db

  // 将数据库文件存储在用户数据目录
  const userDataPath = app.getPath('userData')
  const dbPath = path.join(userDataPath, 'sms_manager.db')
  
  db = new Database(dbPath)
  
  // 创建号码记录表
  db.exec(`
    CREATE TABLE IF NOT EXISTS phone_numbers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      activation_id TEXT UNIQUE NOT NULL,
      phone_number TEXT NOT NULL,
      service TEXT NOT NULL,
      country TEXT NOT NULL,
      operator TEXT,
      status TEXT NOT NULL,
      cost REAL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      released_at INTEGER
    )
  `)
  
  // 创建短信记录表
  db.exec(`
    CREATE TABLE IF NOT EXISTS sms_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      activation_id TEXT NOT NULL,
      phone_number TEXT NOT NULL,
      message TEXT NOT NULL,
      received_at INTEGER NOT NULL,
      FOREIGN KEY (activation_id) REFERENCES phone_numbers(activation_id)
    )
  `)
  
  // 创建API配置表
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      api_key TEXT NOT NULL,
      balance REAL,
      last_updated INTEGER
    )
  `)
  
  // 若缺少日志开关列，进行表结构升级
  try {
    const info = db.prepare("PRAGMA table_info(api_config)").all() as Array<{ name: string }>
    const hasLogEnabled = info.some(col => col.name === 'log_enabled')
    if (!hasLogEnabled) {
      db.exec(`ALTER TABLE api_config ADD COLUMN log_enabled INTEGER DEFAULT 0`)
    }
  } catch (e) {
    // 忽略升级失败以避免影响启动
    // console.warn('api_config 升级失败:', e)
  }
  
  // 创建 API 日志表（写入主库）
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      action TEXT NOT NULL,
      url TEXT,
      params TEXT,
      response TEXT,
      success INTEGER NOT NULL,
      service TEXT,
      country TEXT,
      operator TEXT,
      activation_id TEXT
    )
  `)
  
  return db
}

/**
 * 获取数据库实例
 * @returns Database 实例
 */
export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('数据库未初始化')
  }
  return db
}

/**
 * 关闭数据库连接
 */
export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}

/**
 * 号码记录接口
 */
export interface PhoneNumberRecord {
  id?: number
  activation_id: string
  phone_number: string
  service: string
  country: string
  operator?: string
  status: string
  cost?: number
  created_at: number
  expires_at: number
  released_at?: number
}

/**
 * 短信记录接口
 */
export interface SmsMessageRecord {
  id?: number
  activation_id: string
  phone_number: string
  message: string
  received_at: number
}

/**
 * API配置接口
 */
export interface ApiConfig {
  id?: number
  api_key: string
  balance?: number
  last_updated?: number
  log_enabled?: boolean
}

/**
 * API 日志记录接口
 */
export interface ApiLogRecord {
  timestamp: number
  action: string
  url?: string
  params?: any
  response?: string
  success: boolean
  service?: string
  country?: string
  operator?: string
  activation_id?: string
}

// 现日志直接写入主库，无需单独日志数据库

/**
 * API 日志表行类型
 */
export interface ApiLogRow {
  id: number
  timestamp: number
  action: string
  url?: string
  params?: string
  response?: string
  success: number
  service?: string
  country?: string
  operator?: string
  activation_id?: string
}

/**
 * 保存号码记录
 */
export function savePhoneNumber(record: PhoneNumberRecord): void {
  const db = getDatabase()
  const stmt = db.prepare(`
    INSERT INTO phone_numbers 
    (activation_id, phone_number, service, country, operator, status, cost, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  
  stmt.run(
    record.activation_id,
    record.phone_number,
    record.service,
    record.country,
    record.operator || null,
    record.status,
    record.cost || null,
    record.created_at,
    record.expires_at
  )
}

/**
 * 更新号码状态
 */
export function updatePhoneNumberStatus(activationId: string, status: string, releasedAt?: number): void {
  const db = getDatabase()
  const stmt = db.prepare(`
    UPDATE phone_numbers 
    SET status = ?, released_at = ?
    WHERE activation_id = ?
  `)
  
  stmt.run(status, releasedAt || null, activationId)
}

/**
 * 获取活跃的号码记录
 */
export function getActivePhoneNumbers(): PhoneNumberRecord[] {
  const db = getDatabase()
  const stmt = db.prepare(`
    SELECT * FROM phone_numbers 
    WHERE status IN ('active', 'waiting')
    ORDER BY created_at DESC
  `)
  
  return stmt.all() as PhoneNumberRecord[]
}

/**
 * 保存短信记录
 */
export function saveSmsMessage(record: SmsMessageRecord): void {
  const db = getDatabase()
  const stmt = db.prepare(`
    INSERT INTO sms_messages 
    (activation_id, phone_number, message, received_at)
    VALUES (?, ?, ?, ?)
  `)
  
  stmt.run(
    record.activation_id,
    record.phone_number,
    record.message,
    record.received_at
  )
}

/**
 * 获取指定号码的短信记录
 */
export function getSmsMessages(activationId: string): SmsMessageRecord[] {
  const db = getDatabase()
  const stmt = db.prepare(`
    SELECT * FROM sms_messages 
    WHERE activation_id = ?
    ORDER BY received_at ASC
  `)
  
  return stmt.all(activationId) as SmsMessageRecord[]
}

/**
 * 保存或更新API配置
 */
export function saveApiConfig(config: ApiConfig): void {
  const db = getDatabase()
  
  // 先检查是否存在配置
  const existing = db.prepare('SELECT id FROM api_config LIMIT 1').get() as ApiConfig | undefined
  
  if (existing) {
    const stmt = db.prepare(`
      UPDATE api_config 
      SET api_key = ?, balance = ?, last_updated = ?, log_enabled = COALESCE(?, log_enabled)
      WHERE id = ?
    `)
    stmt.run(config.api_key, config.balance || null, Date.now(),
      typeof config.log_enabled === 'boolean' ? (config.log_enabled ? 1 : 0) : null,
      existing.id
    )
  } else {
    const stmt = db.prepare(`
      INSERT INTO api_config (api_key, balance, last_updated, log_enabled)
      VALUES (?, ?, ?, ?)
    `)
    stmt.run(config.api_key, config.balance || null, Date.now(), config.log_enabled ? 1 : 0)
  }
}

/**
 * 获取API配置
 */
export function getApiConfig(): ApiConfig | undefined {
  const db = getDatabase()
  const stmt = db.prepare('SELECT * FROM api_config LIMIT 1')
  const row = stmt.get() as (ApiConfig & { log_enabled?: number }) | undefined
  if (!row) return undefined
  return { ...row, log_enabled: row.log_enabled ? true : false }
}

/**
 * 设置日志开关
 */
export function setLogEnabled(enabled: boolean): void {
  const db = getDatabase()
  const existing = db.prepare('SELECT id FROM api_config LIMIT 1').get() as ApiConfig | undefined
  if (existing) {
    db.prepare('UPDATE api_config SET log_enabled = ? WHERE id = ?').run(enabled ? 1 : 0, (existing as any).id)
  } else {
    // 若还没有配置则先写入一条默认配置（无 api_key 占位不可行），此处仅设置列值不创建新行
    // 因为 api_key 为 NOT NULL，故跳过；待保存 API Key 时会写入 log_enabled
  }
}

/**
 * 获取日志开关
 */
export function getLogEnabled(): boolean {
  const config = getApiConfig()
  return !!config?.log_enabled
}

/**
 * 保存 API 日志
 */
export function saveApiLog(record: ApiLogRecord): void {
  const db = getDatabase()
  const stmt = db.prepare(`
    INSERT INTO api_logs (timestamp, action, url, params, response, success, service, country, operator, activation_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  stmt.run(
    record.timestamp,
    record.action,
    record.url || null,
    record.params ? JSON.stringify(record.params) : null,
    record.response || null,
    record.success ? 1 : 0,
    record.service || null,
    record.country || null,
    record.operator || null,
    record.activation_id || null
  )
}

/**
 * 查询 API 日志（支持 action 与时间范围过滤）
 */
export function getApiLogs(filters: { action?: string; start?: number; end?: number; limit?: number; offset?: number }): ApiLogRow[] {
  const db = getDatabase()
  const where: string[] = []
  const params: any[] = []
  if (filters.action && filters.action !== 'all') {
    where.push('action = ?')
    params.push(filters.action)
  }
  if (typeof filters.start === 'number') {
    where.push('timestamp >= ?')
    params.push(filters.start)
  }
  if (typeof filters.end === 'number') {
    where.push('timestamp <= ?')
    params.push(filters.end)
  }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : ''
  const limit = typeof filters.limit === 'number' ? Math.max(1, filters.limit) : 200
  const offset = typeof filters.offset === 'number' ? Math.max(0, filters.offset) : 0
  const sql = `SELECT * FROM api_logs ${whereSql} ORDER BY timestamp DESC LIMIT ? OFFSET ?`
  const stmt = db.prepare(sql)
  return stmt.all(...params, limit, offset) as ApiLogRow[]
}

/**
 * 列出所有出现过的 action（用于前端下拉筛选）
 */
export function listApiActions(): string[] {
  const db = getDatabase()
  const stmt = db.prepare('SELECT DISTINCT action FROM api_logs ORDER BY action ASC')
  const rows = stmt.all() as Array<{ action: string }>
  return rows.map(r => r.action)
}
