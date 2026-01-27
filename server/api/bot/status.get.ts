export default defineEventHandler(async () => {
  const status = getBotStatus()
  return { success: true, data: status }
})
