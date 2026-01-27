import { getDatabase } from './index'

const CONFIG_KEY = 'unified_config'

/**
 * 获取配置项
 */
export function getConfigValue<T>(key: string): T | null {
  const db = getDatabase()
  const stmt = db.prepare('select value from config where key = ?')
  const row = stmt.get(key) as { value: string } | undefined

  if (!row) {
    return null
  }

  return JSON.parse(row.value) as T
}

/**
 * 设置配置项
 */
export function setConfigValue<T>(key: string, value: T): void {
  const db = getDatabase()
  const stmt = db.prepare(`
      insert into config (key, value, updated_at)
      values (?, ?, ?)
      on conflict(key) do update set value      = excluded.value,
                                     updated_at = excluded.updated_at
  `)
  stmt.run(key, JSON.stringify(value), Date.now())
}

/**
 * 获取完整配置
 */
export function getFullConfig(): UnifiedConfig | null {
  return getConfigValue<UnifiedConfig>(CONFIG_KEY)
}

/**
 * 保存完整配置
 */
export function saveFullConfig(config: UnifiedConfig): void {
  setConfigValue(CONFIG_KEY, config)
}

/**
 * 检查配置是否存在
 */
export function hasConfig(): boolean {
  const db = getDatabase()
  const stmt = db.prepare('select 1 from config where key = ?')
  const row = stmt.get(CONFIG_KEY)
  return row !== undefined
}
