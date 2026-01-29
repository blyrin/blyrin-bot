/**
 * 认证中间件
 */
export default defineEventHandler((event) => {
  const path = event.path

  // 认证相关接口不需要校验
  if (path.startsWith('/login')) {
    return
  }
  if (path.startsWith('/api/auth/')) {
    return
  }

  // 校验 session
  const token = getCookie(event, 'session')
  const valid = validateSession(token)

  if (!valid) {
    if (path.startsWith('/api')) {
      throw createError({
        statusCode: 401,
        message: '未授权访问',
      })
    } else {
      return sendRedirect(event, '/login')
    }
  }
})
