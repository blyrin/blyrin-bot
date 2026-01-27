import { getDatabase } from './index'

interface UserMemoryRow {
  user_id: number
  group_id: number
  nicknames: string
  traits: string
  preferences: string
  topics: string
  last_seen: number
  message_count: number
}

/**
 * 获取用户记忆
 */
export function getUserMemoryFromDb(groupId: number, userId: number): UserMemory | null {
  const db = getDatabase()
  const stmt = db.prepare('select * from user_memories where group_id = ? and user_id = ?')
  const row = stmt.get(groupId, userId) as UserMemoryRow | undefined

  if (!row) {
    return null
  }

  return {
    userId: row.user_id,
    groupId: row.group_id,
    nicknames: JSON.parse(row.nicknames) as string[],
    traits: JSON.parse(row.traits) as string[],
    preferences: JSON.parse(row.preferences) as string[],
    topics: JSON.parse(row.topics) as string[],
    lastSeen: row.last_seen,
    messageCount: row.message_count,
  }
}

/**
 * 保存用户记忆
 */
export function saveUserMemoryToDb(memory: UserMemory): void {
  const db = getDatabase()
  const stmt = db.prepare(`
      insert into user_memories (user_id, group_id, nicknames, traits, preferences, topics, last_seen, message_count)
      values (?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(user_id, group_id) do update set nicknames     = excluded.nicknames,
                                                   traits        = excluded.traits,
                                                   preferences   = excluded.preferences,
                                                   topics        = excluded.topics,
                                                   last_seen     = excluded.last_seen,
                                                   message_count = excluded.message_count
  `)
  stmt.run(
    memory.userId,
    memory.groupId,
    JSON.stringify(memory.nicknames),
    JSON.stringify(memory.traits),
    JSON.stringify(memory.preferences),
    JSON.stringify(memory.topics),
    memory.lastSeen,
    memory.messageCount,
  )
}

/**
 * 删除用户记忆
 */
export function deleteUserMemoryFromDb(groupId: number, userId: number): boolean {
  const db = getDatabase()
  const stmt = db.prepare('delete from user_memories where group_id = ? and user_id = ?')
  const result = stmt.run(groupId, userId)
  return result.changes > 0
}

/**
 * 列出群组所有用户 ID
 */
export function listGroupUserIds(groupId: number): number[] {
  const db = getDatabase()
  const stmt = db.prepare('select user_id from user_memories where group_id = ?')
  const rows = stmt.all(groupId) as unknown as { user_id: number }[]
  return rows.map(row => row.user_id)
}

/**
 * 获取群组所有用户记忆
 */
export function getAllGroupUserMemoriesFromDb(groupId: number): UserMemory[] {
  const db = getDatabase()
  const stmt = db.prepare('select * from user_memories where group_id = ?')
  const rows = stmt.all(groupId) as unknown as UserMemoryRow[]

  return rows.map(row => ({
    userId: row.user_id,
    groupId: row.group_id,
    nicknames: JSON.parse(row.nicknames) as string[],
    traits: JSON.parse(row.traits) as string[],
    preferences: JSON.parse(row.preferences) as string[],
    topics: JSON.parse(row.topics) as string[],
    lastSeen: row.last_seen,
    messageCount: row.message_count,
  }))
}
