export default defineEventHandler(async () => {
  await reconnectBot()
  return { success: true }
})
