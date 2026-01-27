import { z } from 'zod'

const BodySchema = z.object({
  groupId: z.number().int(),
})

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const result = BodySchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: result.error.errors[0]?.message || '请求数据无效',
    })
  }

  addGroupToWhitelist(result.data.groupId)
  refreshGroupInfoCache().catch((err) => {
    logger.error('API', '刷新群信息缓存失败', { error: String(err) })
  })

  return { success: true }
})
