import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import fs from 'node:fs'

const DATA_DIR = path.join(process.cwd(), 'data')
const DB_PATH = path.join(DATA_DIR, 'blyrin-bot.db')

let db: DatabaseSync | null = null

/**
 * 获取数据库实例（单例模式）
 */
export function getDatabase(): DatabaseSync {
  if (db) {
    return db
  }

  // 确保 data 目录存在
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }

  db = new DatabaseSync(DB_PATH)

  // 启用 WAL 模式以提高并发性能
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA synchronous = NORMAL')

  // 初始化表结构
  initializeTables(db)

  return db
}

/**
 * 初始化数据库表
 */
function initializeTables(database: DatabaseSync): void {
  // 配置表（键值存储）
  database.exec(`
      create table if not exists config
      (
          key        TEXT primary key,
          value      TEXT    not null,
          updated_at integer not null
      )
  `)

  // 群组上下文表
  database.exec(`
      create table if not exists group_contexts
      (
          group_id     integer primary key,
          messages     TEXT    not null default '[]',
          last_updated integer not null
      )
  `)

  // 群组记忆表
  database.exec(`
      create table if not exists group_memories
      (
          group_id        integer primary key,
          summary         TEXT    not null,
          last_compressed integer not null
      )
  `)

  // 用户记忆表
  database.exec(`
      create table if not exists user_memories
      (
          user_id       integer not null,
          group_id      integer not null,
          nicknames     TEXT    not null default '[]',
          traits        TEXT    not null default '[]',
          preferences   TEXT    not null default '[]',
          topics        TEXT    not null default '[]',
          last_seen     integer not null,
          message_count integer not null default 0,
          primary key (user_id, group_id)
      )
  `)

  // 用户记忆索引
  database.exec(`
      create index if not exists idx_user_memories_group on user_memories (group_id)
  `)
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
 * 在事务中执行操作
 */
export function withTransaction<T>(fn: () => T): T {
  const database = getDatabase()
  database.exec('BEGIN TRANSACTION')
  try {
    const result = fn()
    database.exec('COMMIT')
    return result
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}
