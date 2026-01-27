export default defineEventHandler(async (event) => {
  const groupId = getRouterParam(event, 'groupId')
  const groupIdNum = parseInt(groupId!, 10)

  if (isNaN(groupIdNum)) {
    throw createError({
      statusCode: 400,
      message: '无效的群号',
    })
  }

  const query = getQuery(event)
  const clearType = (query.type as string) || 'all'

  if (clearType === 'context' || clearType === 'all') {
    clearContext(groupIdNum)
  }
  if (clearType === 'memory' || clearType === 'all') {
    clearMemory(groupIdNum)
  }

  return { success: true }
})
