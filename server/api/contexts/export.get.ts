export default defineEventHandler(async () => {
  const contextGroupIds = listContexts()
  const memoryGroupIds = listMemories()

  // 合并所有群组 ID
  const allGroupIds = [...new Set([...contextGroupIds, ...memoryGroupIds])]

  const exportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    groups: allGroupIds.map(groupId => {
      const context = getContext(groupId)
      const memory = getMemory(groupId)
      const users = getAllGroupUserMemories(groupId)

      return {
        groupId,
        context: context.messages.length > 0 ? context : null,
        memory: memory,
        users: users.length > 0 ? users : null,
      }
    }).filter(g => g.context || g.memory || g.users),
  }

  return { success: true, data: exportData }
})
