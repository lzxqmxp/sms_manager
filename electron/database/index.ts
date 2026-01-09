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
      SET api_key = ?, balance = ?, last_updated = ?
      WHERE id = ?
    `)
    stmt.run(config.api_key, config.balance || null, Date.now(), existing.id)
  } else {
    const stmt = db.prepare(`
      INSERT INTO api_config (api_key, balance, last_updated)
      VALUES (?, ?, ?)
    `)
    stmt.run(config.api_key, config.balance || null, Date.now())
  }
}

/**
 * 获取API配置
 */
export function getApiConfig(): ApiConfig | undefined {
  const db = getDatabase()
  const stmt = db.prepare('SELECT * FROM api_config LIMIT 1')
  return stmt.get() as ApiConfig | undefined
}
