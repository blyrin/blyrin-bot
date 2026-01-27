export default defineEventHandler(async () => {
  const config = getAIConfig()
  return { success: true, data: config }
})
