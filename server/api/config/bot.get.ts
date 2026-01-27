export default defineEventHandler(async () => {
  const config = getBotConfig()
  return { success: true, data: config }
})
