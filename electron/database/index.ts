// 数据库模块 - 使用 sql.js 提供 SQLite 存储，避免原生模块编译依赖
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { app } from 'electron'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'

const require = createRequire(import.meta.url)

let SQL: SqlJsStatic | null = null
let db: Database | null = null
let dbFilePath = ''

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
 * API 配置接口
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

interface JsonMigrationStore {
  phone_numbers?: PhoneNumberRecord[]
  sms_messages?: SmsMessageRecord[]
  api_config?: ApiConfig
  api_logs?: ApiLogRow[]
}

function getWasmDirectory(): string {
  return path.dirname(require.resolve('sql.js/dist/sql-wasm.wasm'))
}

function persistDatabase(): void {
  if (!db || !dbFilePath) return
  const data = db.export()
  fs.writeFileSync(dbFilePath, Buffer.from(data))
}

function getDatabase(): Database {
  if (!db) {
    throw new Error('数据库未初始化')
  }
  return db
}

function run(sql: string, params: unknown[] = []): void {
  const statement = getDatabase().prepare(sql)
  try {
    statement.run(params)
  } finally {
    statement.free()
  }
  persistDatabase()
}

function queryAll<T>(sql: string, params: unknown[] = []): T[] {
  const statement = getDatabase().prepare(sql)
  try {
    if (params.length > 0) {
      statement.bind(params)
    }

    const rows: T[] = []
    while (statement.step()) {
      rows.push(statement.getAsObject() as T)
    }
    return rows
  } finally {
    statement.free()
  }
}

function queryOne<T>(sql: string, params: unknown[] = []): T | undefined {
  const rows = queryAll<T>(sql, params)
  return rows[0]
}

/**
 * 初始化数据库连接
 * @returns Database 实例
 */
export async function initDatabase(): Promise<Database> {
  if (db) return db

  // 将数据库文件存储在用户数据目录
  const userDataPath = app.getPath('userData')
  dbFilePath = path.join(userDataPath, 'sms_manager.db')

  fs.mkdirSync(userDataPath, { recursive: true })

  if (!SQL) {
    SQL = await initSqlJs({
      locateFile: (file) => path.join(getWasmDirectory(), file),
    })
  }

  if (fs.existsSync(dbFilePath)) {
    db = new SQL.Database(new Uint8Array(fs.readFileSync(dbFilePath)))
  } else {
    db = new SQL.Database()
  }

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

  // 创建 API 配置表
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
    const info = queryAll<{ name: string }>('PRAGMA table_info(api_config)')
    const hasLogEnabled = info.some(col => col.name === 'log_enabled')
    if (!hasLogEnabled) {
      db.exec('ALTER TABLE api_config ADD COLUMN log_enabled INTEGER DEFAULT 0')
    }
  } catch {
    // 忽略升级失败以避免影响启动
  }

  // 创建 API 日志表
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

  migrateJsonStoreIfNeeded(userDataPath)
  persistDatabase()

  return db
}

/**
 * 将临时 JSON 存储迁移回 SQLite，仅在 SQLite 为空时执行一次
 */
function migrateJsonStoreIfNeeded(userDataPath: string): void {
  if (!db) return

  const jsonPath = path.join(userDataPath, 'sms_manager.json')
  if (!fs.existsSync(jsonPath)) return

  const phoneCount = Number(queryOne<{ count: number }>('SELECT COUNT(1) as count FROM phone_numbers')?.count || 0)
  const smsCount = Number(queryOne<{ count: number }>('SELECT COUNT(1) as count FROM sms_messages')?.count || 0)
  const logCount = Number(queryOne<{ count: number }>('SELECT COUNT(1) as count FROM api_logs')?.count || 0)
  const configCount = Number(queryOne<{ count: number }>('SELECT COUNT(1) as count FROM api_config')?.count || 0)
  const hasExistingData = phoneCount > 0 || smsCount > 0 || logCount > 0 || configCount > 0
  if (hasExistingData) return

  try {
    const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as JsonMigrationStore

    db.exec('BEGIN TRANSACTION')

    for (const item of raw.phone_numbers || []) {
      run(
        `INSERT OR REPLACE INTO phone_numbers
        (activation_id, phone_number, service, country, operator, status, cost, created_at, expires_at, released_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.activation_id,
          item.phone_number,
          item.service,
          item.country,
          item.operator || null,
          item.status,
          item.cost || null,
          item.created_at,
          item.expires_at,
          item.released_at || null,
        ],
      )
    }

    for (const item of raw.sms_messages || []) {
      run(
        `INSERT INTO sms_messages
        (activation_id, phone_number, message, received_at)
        VALUES (?, ?, ?, ?)`,
        [item.activation_id, item.phone_number, item.message, item.received_at],
      )
    }

    if (raw.api_config?.api_key) {
      run(
        'INSERT INTO api_config (api_key, balance, last_updated, log_enabled) VALUES (?, ?, ?, ?)',
        [
          raw.api_config.api_key,
          raw.api_config.balance || null,
          raw.api_config.last_updated || Date.now(),
          raw.api_config.log_enabled ? 1 : 0,
        ],
      )
    }

    for (const item of raw.api_logs || []) {
      run(
        `INSERT INTO api_logs (timestamp, action, url, params, response, success, service, country, operator, activation_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.timestamp,
          item.action,
          item.url || null,
          item.params || null,
          item.response || null,
          item.success,
          item.service || null,
          item.country || null,
          item.operator || null,
          item.activation_id || null,
        ],
      )
    }

    db.exec('COMMIT')
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {}
    console.error('迁移 JSON 数据到 SQLite 失败:', error)
  }
}

/**
 * 获取数据库实例
 * @returns Database 实例
 */
export function closeDatabase(): void {
  if (db) {
    persistDatabase()
    db.close()
    db.close()
    db = null
    dbFilePath = ''
  }
}

/**
 * 保存号码记录
 */
export function savePhoneNumber(record: PhoneNumberRecord): void {
  run(
    `INSERT INTO phone_numbers
    (activation_id, phone_number, service, country, operator, status, cost, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.activation_id,
      record.phone_number,
      record.service,
      record.country,
      record.operator || null,
      record.status,
      record.cost || null,
      record.created_at,
      record.expires_at,
    ],
  )
}

/**
 * 更新号码状态
 */
export function updatePhoneNumberStatus(activationId: string, status: string, releasedAt?: number): void {
  run(
    `UPDATE phone_numbers
    SET status = ?, released_at = ?
    WHERE activation_id = ?`,
    [status, releasedAt || null, activationId],
  )
}

/**
 * 获取活跃的号码记录
 */
export function getActivePhoneNumbers(): PhoneNumberRecord[] {
  return queryAll<PhoneNumberRecord>(`
    SELECT * FROM phone_numbers
    WHERE status IN ('active', 'waiting')
    ORDER BY created_at DESC
  `)
}

/**
 * 保存短信记录
 */
export function saveSmsMessage(record: SmsMessageRecord): void {
  run(
    `INSERT INTO sms_messages
    (activation_id, phone_number, message, received_at)
    VALUES (?, ?, ?, ?)`,
    [record.activation_id, record.phone_number, record.message, record.received_at],
  )
}

/**
 * 获取指定号码的短信记录
 */
export function getSmsMessages(activationId: string): SmsMessageRecord[] {
  return queryAll<SmsMessageRecord>(`
    SELECT * FROM sms_messages
    WHERE activation_id = ?
    ORDER BY received_at ASC
  `, [activationId])
}

/**
 * 保存或更新API配置
 */
export function saveApiConfig(config: ApiConfig): void {
  const existing = queryOne<ApiConfig>('SELECT id FROM api_config LIMIT 1')

  if (existing) {
    run(
      `UPDATE api_config
      SET api_key = ?, balance = ?, last_updated = ?, log_enabled = COALESCE(?, log_enabled)
      WHERE id = ?`,
      [
        config.api_key,
        config.balance || null,
        Date.now(),
        typeof config.log_enabled === 'boolean' ? (config.log_enabled ? 1 : 0) : null,
        existing.id,
      ],
    )
  } else {
    run(
      'INSERT INTO api_config (api_key, balance, last_updated, log_enabled) VALUES (?, ?, ?, ?)',
      [config.api_key, config.balance || null, Date.now(), config.log_enabled ? 1 : 0],
    )
  }
}

/**
 * 获取API配置
 */
export function getApiConfig(): ApiConfig | undefined {
  const row = queryOne<ApiConfig & { log_enabled?: number }>('SELECT * FROM api_config LIMIT 1')
  if (!row) return undefined
  return { ...row, log_enabled: row.log_enabled ? true : false }
}

/**
 * 设置日志开关
 */
export function setLogEnabled(enabled: boolean): void {
  const existing = queryOne<ApiConfig>('SELECT id FROM api_config LIMIT 1')
  if (existing) {
    run('UPDATE api_config SET log_enabled = ? WHERE id = ?', [enabled ? 1 : 0, (existing as any).id])
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
  run(
    `INSERT INTO api_logs (timestamp, action, url, params, response, success, service, country, operator, activation_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.timestamp,
      record.action,
      record.url || null,
      record.params ? JSON.stringify(record.params) : null,
      record.response || null,
      record.success ? 1 : 0,
      record.service || null,
      record.country || null,
      record.operator || null,
      record.activation_id || null,
    ],
  )
}

/**
 * 查询 API 日志（支持 action 与时间范围过滤）
 */
export function getApiLogs(filters: { action?: string; start?: number; end?: number; limit?: number; offset?: number }): ApiLogRow[] {
  const where: string[] = []
  const params: unknown[] = []
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
  return queryAll<ApiLogRow>(sql, [...params, limit, offset])
}

/**
 * 列出所有出现过的 action（用于前端下拉筛选）
 */
export function listApiActions(): string[] {
  const rows = queryAll<{ action: string }>('SELECT DISTINCT action FROM api_logs ORDER BY action ASC')
  return rows.map(r => r.action)
}
