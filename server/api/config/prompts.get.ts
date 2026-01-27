export default defineEventHandler(async () => {
  const config = getPromptsConfig()
  return { success: true, data: config }
})
