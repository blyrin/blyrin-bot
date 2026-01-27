export default defineEventHandler(async () => {
  const groupIds = listContexts()
  const contexts = groupIds.map(groupId => {
    const context = getContext(groupId)
    const memory = getMemory(groupId)
    return {
      groupId,
      messageCount: context.messages.length,
      lastUpdated: context.lastUpdated,
      hasMemory: !!memory,
    }
  })

  return { success: true, data: contexts }
})
