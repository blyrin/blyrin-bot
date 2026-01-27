export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { password } = body

  if (!password) {
    throw createError({
      statusCode: 400,
      message: '请输入密码',
    })
  }

  const token = login(password)

  if (!token) {
    throw createError({
      statusCode: 401,
      message: '密码错误',
    })
  }

  // 设置 session cookie
  const config = getAuthConfig()
  const maxAge = Math.floor(config.sessionMaxAge / 1000)
  setCookie(event, 'session', token, {
    httpOnly: true,
    sameSite: 'strict',
    maxAge,
    path: '/',
  })

  return { success: true }
})
