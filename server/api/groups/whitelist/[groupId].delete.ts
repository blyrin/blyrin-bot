export default defineEventHandler(async (event) => {
  const groupId = Number(getRouterParam(event, 'groupId'))
  if (isNaN(groupId)) {
    throw createError({
      statusCode: 400,
      message: '无效的群号',
    })
  }

  removeGroupFromWhitelist(groupId)
  refreshGroupInfoCache().catch((err) => {
    logger.error('API', '刷新群信息缓存失败', { error: String(err) })
  })

  return { success: true }
})
