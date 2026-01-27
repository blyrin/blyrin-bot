import { z } from 'zod'

const FullImportSchema = z.object({
  version: z.number().int().min(1).max(100),
  groups: z.array(z.object({
    groupId: z.number().int(),
    context: z.object({
      groupId: z.number().int(),
      messages: z.array(z.any()),
      lastUpdated: z.number().int(),
    }).nullable().optional(),
    memory: z.object({
      groupId: z.number().int(),
      summary: z.string(),
      lastCompressed: z.number().int(),
    }).nullable().optional(),
    users: z.array(z.any()).nullable().optional(),
  })).max(1000),
})

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  // 验证请求体
  const result = FullImportSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: result.error.errors[0]?.message || '请求数据无效',
    })
  }

  const data = result.data
  const results: Record<number, { context: boolean; memory: boolean; users: number }> = {}

  for (const group of data.groups) {
    const groupId = group.groupId
    results[groupId] = { context: false, memory: false, users: 0 }

    if (group.context && group.context.messages) {
      try {
        importContext(groupId, group.context as GroupContext)
        results[groupId].context = true
      } catch (e) {
        logger.error('API', `导入群 ${groupId} 上下文失败`, { error: String(e) })
      }
    }

    if (group.memory && group.memory.summary) {
      try {
        importMemory(groupId, group.memory as GroupMemory)
        results[groupId].memory = true
      } catch (e) {
        logger.error('API', `导入群 ${groupId} 记忆失败`, { error: String(e) })
      }
    }

    if (group.users && Array.isArray(group.users)) {
      for (const user of group.users) {
        try {
          importUserMemory(user)
          results[groupId].users += 1
        } catch (e) {
          logger.error('API', `导入群 ${groupId} 用户 ${user.userId} 失败`, { error: String(e) })
        }
      }
    }
  }

  return { success: true, data: results }
})
