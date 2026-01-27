export default defineEventHandler(async () => {
  const config = getGroupsConfig()
  return { success: true, data: config }
})
