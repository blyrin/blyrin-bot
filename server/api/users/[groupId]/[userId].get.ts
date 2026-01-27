export default defineEventHandler(async (event) => {
  const groupId = getRouterParam(event, 'groupId')
  const userId = getRouterParam(event, 'userId')
  const groupIdNum = parseInt(groupId!, 10)
  const userIdNum = parseInt(userId!, 10)

  if (isNaN(groupIdNum) || isNaN(userIdNum)) {
    throw createError({
      statusCode: 400,
      message: '无效的参数',
    })
  }

  const memory = getUserMemory(groupIdNum, userIdNum)

  if (!memory) {
    throw createError({
      statusCode: 404,
      message: '用户记忆不存在',
    })
  }

  return { success: true, data: memory }
})
