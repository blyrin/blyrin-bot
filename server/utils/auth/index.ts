import type { H3Event } from 'h3'
import crypto from 'node:crypto'
import { verifyPassword } from './password'

// 内存会话存储
const sessions = new Map<string, { createdAt: number }>()

// 定期清理过期 session（每 10 分钟）
const SESSION_CLEANUP_INTERVAL = 10 * 60 * 1000
let cleanupTimer: ReturnType<typeof setInterval> | null = null

function cleanupExpiredSessions(): void {
  const config = getAuthConfig()
  const now = Date.now()
  let cleanedCount = 0

  for (const [token, session] of sessions) {
    if (now - session.createdAt > config.sessionMaxAge) {
      sessions.delete(token)
      cleanedCount++
    }
  }

  if (cleanedCount > 0) {
    logger.debug('Auth', `清理了 ${cleanedCount} 个过期 session`)
  }
}

// 启动 session 清理定时器
export function startSessionCleanup(): void {
  if (cleanupTimer) return
  cleanupTimer = setInterval(cleanupExpiredSessions, SESSION_CLEANUP_INTERVAL)
  logger.debug('Auth', 'Session 清理定时器已启动')
}

// 停止 session 清理定时器
export function stopSessionCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer)
    cleanupTimer = null
    logger.debug('Auth', 'Session 清理定时器已停止')
  }
}

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

export function login(password: string): string | null {
  const config = getAuthConfig()

  // 使用安全的密码验证
  if (!verifyPassword(password, config.password)) {
    return null
  }

  const token = generateToken()
  sessions.set(token, { createdAt: Date.now() })
  return token
}

export function validateSession(token: string | undefined): boolean {
  if (!token) {
    return false
  }

  const session = sessions.get(token)
  if (!session) {
    return false
  }

  const config = getAuthConfig()
  const now = Date.now()

  if (now - session.createdAt > config.sessionMaxAge) {
    sessions.delete(token)
    return false
  }

  return true
}

export function logout(token: string): void {
  sessions.delete(token)
}

/**
 * 检查请求是否已授权
 * 如果未授权，抛出 401 错误
 */
export function checkAuth(event: H3Event): void {
  const token = getCookie(event, 'session')

  if (!validateSession(token)) {
    throw createError({
      statusCode: 401,
      message: '未授权访问',
    })
  }
}
