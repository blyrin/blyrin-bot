export default defineEventHandler(async (event) => {
  const groupId = getRouterParam(event, 'groupId')
  const groupIdNum = parseInt(groupId!, 10)

  if (isNaN(groupIdNum)) {
    throw createError({
      statusCode: 400,
      message: '无效的群号',
    })
  }

  const userIds = listGroupUsers(groupIdNum)
  const users = userIds.map(userId => {
    const memory = getUserMemory(groupIdNum, userId)
    return {
      userId,
      nickname: memory?.nicknames?.[0] || String(userId),
      nicknames: memory?.nicknames || [],
      messageCount: memory?.messageCount || 0,
      lastSeen: memory?.lastSeen || 0,
    }
  })

  return { success: true, data: users }
})
