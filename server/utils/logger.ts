declare global {
  // eslint-disable-next-line no-var
  var __logger: Logger | undefined
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  id: string
  level: LogLevel
  category: string
  message: string
  timestamp: number
  data?: unknown
}

type LogListener = (entry: LogEntry) => void

const MAX_LOGS = 500


class Logger {
  private logs: LogEntry[] = []
  private listeners: Set<LogListener> = new Set()
  private idCounter = 0

  debug(category: string, message: string, data?: unknown) {
    this.log('debug', category, message, data)
  }

  info(category: string, message: string, data?: unknown) {
    this.log('info', category, message, data)
  }

  warn(category: string, message: string, data?: unknown) {
    this.log('warn', category, message, data)
  }

  error(category: string, message: string, data?: unknown) {
    this.log('error', category, message, data)
  }

  getLogs(options?: {
    level?: LogLevel
    category?: string
    since?: number
    limit?: number
  }): LogEntry[] {
    let result = [...this.logs]

    if (options?.level) {
      result = result.filter(log => log.level === options.level)
    }

    if (options?.category) {
      result = result.filter(log => log.category === options.category)
    }

    if (options?.since) {
      const since = options.since
      result = result.filter(log => log.timestamp > since)
    }

    if (options?.limit) {
      result = result.slice(-options.limit)
    }

    return result
  }

  subscribe(listener: LogListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  // 清理所有监听器（用于优雅关闭）
  cleanup(): void {
    this.listeners.clear()
  }

  clear() {
    this.logs = []
  }

  private createEntry(
    level: LogLevel,
    category: string,
    message: string,
    data?: unknown,
  ): LogEntry {
    return {
      id: `${Date.now()}-${++this.idCounter}`,
      level,
      category,
      message,
      timestamp: Date.now(),
      data,
    }
  }

  private log(level: LogLevel, category: string, message: string, data: unknown) {
    const entry = this.createEntry(level, category, message, data)

    // 存储日志
    this.logs.push(entry)
    if (this.logs.length > MAX_LOGS) {
      this.logs.shift()
    }

    // 输出到控制台
    const timestamp = new Date(entry.timestamp).toLocaleString('zh-CN')
    const prefix = `[${timestamp}] [${level.toUpperCase()}] [${category}]`

    switch (level) {
      case 'debug':
        console.debug(prefix, message, data ?? '')
        break
      case 'info':
        console.info(prefix, message, data ?? '')
        break
      case 'warn':
        console.warn(prefix, message, data ?? '')
        break
      case 'error':
        console.error(prefix, message, data ?? '')
        break
    }

    // 通知监听器
    this.listeners.forEach(listener => listener(entry))
  }
}

// 单例导出（使用 globalThis 确保热重载时保持同一实例）
export const logger = globalThis.__logger ?? (globalThis.__logger = new Logger())
