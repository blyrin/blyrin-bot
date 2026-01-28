import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import fs from 'node:fs'

const DATA_DIR = path.join(process.cwd(), 'data')
const DB_PATH = path.join(DATA_DIR, 'blyrin-bot.db')

let db: DatabaseSync | null = null

export interface StoredImageRecord {
  messageId: number
  imageIndex: number
  base64: string
  contentType: string
  isAnimated: boolean
}

export interface StoredImageInput {
  imageIndex: number
  base64: string
  contentType: string
  isAnimated: boolean
}

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
 * 获取图片数据库实例（单例模式）
 */
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

  // 消息图片表
  database.exec(`
      create table if not exists message_images
      (
          id           integer primary key autoincrement,
          group_id     integer not null,
          message_id   integer not null,
          user_id      integer,
          image_index  integer not null,
          content_type text    not null,
          base64       text    not null,
          is_animated  integer not null default 0,
          created_at   integer not null
      )
  `)

  database.exec(`
      create index if not exists idx_message_images_group_message
          on message_images (group_id, message_id)
  `)

  database.exec(`
      create index if not exists idx_message_images_group
          on message_images (group_id)
  `)

  database.exec(`
      create unique index if not exists uq_message_images_message_index
          on message_images (group_id, message_id, image_index)
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

export function saveMessageImagesToDb(
  groupId: number,
  messageId: number,
  userId: number | undefined,
  images: StoredImageInput[],
): void {
  if (images.length === 0) return
  const database = getDatabase()
  const stmt = database.prepare(`
      insert into message_images
      (group_id, message_id, user_id, image_index, content_type, base64, is_animated, created_at)
      values (?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(group_id, message_id, image_index) do update set
          user_id = excluded.user_id,
          content_type = excluded.content_type,
          base64 = excluded.base64,
          is_animated = excluded.is_animated,
          created_at = excluded.created_at
  `)

  const now = Date.now()
  database.exec('BEGIN TRANSACTION')
  try {
    for (const image of images) {
      stmt.run(
        groupId,
        messageId,
        userId ?? null,
        image.imageIndex,
        image.contentType,
        image.base64,
        image.isAnimated ? 1 : 0,
        now,
      )
    }
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

export function getMessageImagesFromDb(groupId: number, messageId: number): StoredImageRecord[] {
  const database = getDatabase()
  const stmt = database.prepare(`
      select message_id, image_index, base64, content_type, is_animated
      from message_images
      where group_id = ? and message_id = ?
      order by image_index asc
  `)
  const rows = stmt.all(groupId, messageId) as Array<{
    message_id: number
    image_index: number
    base64: string
    content_type: string
    is_animated: number
  }>

  return rows.map(row => ({
    messageId: row.message_id,
    imageIndex: row.image_index,
    base64: row.base64,
    contentType: row.content_type,
    isAnimated: row.is_animated === 1,
  }))
}

export function getMessageImagesByMessageIdsFromDb(
  groupId: number,
  messageIds: number[],
): Record<number, StoredImageRecord[]> {
  if (messageIds.length === 0) return {}
  const database = getDatabase()
  const placeholders = messageIds.map(() => '?').join(', ')
  const stmt = database.prepare(`
      select message_id, image_index, base64, content_type, is_animated
      from message_images
      where group_id = ? and message_id in (${placeholders})
      order by message_id asc, image_index asc
  `)
  const rows = stmt.all(groupId, ...messageIds) as Array<{
    message_id: number
    image_index: number
    base64: string
    content_type: string
    is_animated: number
  }>

  const result: Record<number, StoredImageRecord[]> = {}
  for (const row of rows) {
    if (!result[row.message_id]) {
      result[row.message_id] = []
    }
    result[row.message_id]!.push({
      messageId: row.message_id,
      imageIndex: row.image_index,
      base64: row.base64,
      contentType: row.content_type,
      isAnimated: row.is_animated === 1,
    })
  }
  return result
}

export function deleteMessageImagesFromDb(groupId: number, messageIds: number[]): void {
  if (messageIds.length === 0) return
  const database = getDatabase()
  const placeholders = messageIds.map(() => '?').join(', ')
  const stmt = database.prepare(`
      delete from message_images
      where group_id = ? and message_id in (${placeholders})
  `)
  stmt.run(groupId, ...messageIds)
}

export function deleteGroupImagesFromDb(groupId: number): void {
  const database = getDatabase()
  const stmt = database.prepare('delete from message_images where group_id = ?')
  stmt.run(groupId)
}
