export default defineEventHandler(async (event) => {
  const token = getCookie(event, 'session')

  if (token) {
    logout(token)
  }

  // 清除 session cookie
  deleteCookie(event, 'session', {
    path: '/',
  })

  return { success: true }
})
