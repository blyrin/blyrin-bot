export default defineEventHandler(async (event) => {
  const groupId = Number(getRouterParam(event, 'groupId'))
  if (isNaN(groupId)) {
    throw createError({
      statusCode: 400,
      message: '无效的群号',
    })
  }

  const body = await readBody(event)
  const result = GroupSettingsSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: result.error.errors[0]?.message || '请求数据无效',
    })
  }

  const updated = updateGroupSettings(groupId, result.data as Partial<GroupSettings>)
  return { success: true, data: updated }
})
