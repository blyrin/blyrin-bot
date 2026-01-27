export default defineEventHandler(async (event) => {
  const groupId = getRouterParam(event, 'groupId')
  const groupIdNum = parseInt(groupId!, 10)

  if (isNaN(groupIdNum)) {
    throw createError({
      statusCode: 400,
      message: '无效的群号',
    })
  }

  const context = getContext(groupIdNum)
  const memory = getMemory(groupIdNum)

  return { success: true, data: { context, memory } }
})
