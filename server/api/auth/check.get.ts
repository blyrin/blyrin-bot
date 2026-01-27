export default defineEventHandler(async (event) => {
  const token = getCookie(event, 'session')
  const isValid = validateSession(token)

  return {
    success: true,
    data: { authenticated: isValid },
  }
})
