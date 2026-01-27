export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  // 验证请求体
  const result = BotConfigSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: result.error.errors[0]?.message || '请求数据无效',
    })
  }

  const config = updateBotConfig(result.data as Partial<BotConfig>)
  return { success: true, data: config }
})
