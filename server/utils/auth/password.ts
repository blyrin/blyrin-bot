import crypto from 'node:crypto'

const ITERATIONS = 100000
const KEY_LENGTH = 64
const DIGEST = 'sha512'

/**
 * 使用 PBKDF2 对密码进行哈希
 * @param password - 明文密码
 * @returns 格式为 "salt:hash" 的哈希字符串
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(32).toString('hex')
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString('hex')
  return `${salt}:${hash}`
}

/**
 * 验证密码是否匹配哈希
 * @param password - 明文密码
 * @param storedHash - 存储的哈希字符串（格式为 "salt:hash"）
 * @returns 密码是否匹配
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(':')
  if (!salt || !hash) {
    return false
  }

  const verifyHash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString('hex')
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(verifyHash, 'hex'))
}
