import { getDatabase } from './index'

interface ContextRow {
  group_id: number
  messages: string
  last_updated: number
}

interface MemoryRow {
  group_id: number
  summary: string
  last_compressed: number
}

/**
 * 获取群组上下文
 */
export function getContextFromDb(groupId: number): GroupContext | null {
  const db = getDatabase()
  const stmt = db.prepare('select * from group_contexts where group_id = ?')
  const row = stmt.get(groupId) as ContextRow | undefined

  if (!row) {
    return null
  }

  return {
    groupId: row.group_id,
    messages: JSON.parse(row.messages) as ChatMessage[],
    lastUpdated: row.last_updated,
  }
}

/**
 * 保存群组上下文
 */
export function saveContextToDb(context: GroupContext): void {
  const db = getDatabase()
  const stmt = db.prepare(`
      insert into group_contexts (group_id, messages, last_updated)
      values (?, ?, ?)
      on conflict(group_id) do update set messages     = excluded.messages,
                                          last_updated = excluded.last_updated
  `)
  stmt.run(context.groupId, JSON.stringify(context.messages), context.lastUpdated)
}

/**
 * 删除群组上下文
 */
export function deleteContextFromDb(groupId: number): void {
  const db = getDatabase()
  const stmt = db.prepare('delete from group_contexts where group_id = ?')
  stmt.run(groupId)
}

/**
 * 列出所有群组 ID
 */
export function listContextGroupIds(): number[] {
  const db = getDatabase()
  const stmt = db.prepare('select group_id from group_contexts')
  const rows = stmt.all() as unknown as { group_id: number }[]
  return rows.map(row => row.group_id)
}

/**
 * 获取群组记忆
 */
export function getMemoryFromDb(groupId: number): GroupMemory | null {
  const db = getDatabase()
  const stmt = db.prepare('select * from group_memories where group_id = ?')
  const row = stmt.get(groupId) as MemoryRow | undefined

  if (!row) {
    return null
  }

  return {
    groupId: row.group_id,
    summary: row.summary,
    lastCompressed: row.last_compressed,
  }
}

/**
 * 保存群组记忆
 */
export function saveMemoryToDb(memory: GroupMemory): void {
  const db = getDatabase()
  const stmt = db.prepare(`
      insert into group_memories (group_id, summary, last_compressed)
      values (?, ?, ?)
      on conflict(group_id) do update set summary         = excluded.summary,
                                          last_compressed = excluded.last_compressed
  `)
  stmt.run(memory.groupId, memory.summary, memory.lastCompressed)
}

/**
 * 删除群组记忆
 */
export function deleteMemoryFromDb(groupId: number): void {
  const db = getDatabase()
  const stmt = db.prepare('delete from group_memories where group_id = ?')
  stmt.run(groupId)
}

/**
 * 列出所有记忆群组 ID
 */
export function listMemoryGroupIds(): number[] {
  const db = getDatabase()
  const stmt = db.prepare('select group_id from group_memories')
  const rows = stmt.all() as unknown as { group_id: number }[]
  return rows.map(row => row.group_id)
}
