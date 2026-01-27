import { z } from 'zod'

const BodySchema = z.object({
  enabled: z.boolean(),
})

export default defineEventHandler(async (event) => {
  const toolName = getRouterParam(event, 'toolName')
  if (!toolName) {
    throw createError({
      statusCode: 400,
      message: '无效的工具名称',
    })
  }

  const body = await readBody(event)
  const result = BodySchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: result.error.errors[0]?.message || '请求数据无效',
    })
  }

  setToolEnabled(toolName, result.data.enabled)

  const config = getToolsConfig()
  const tools = getAllToolInfos()
  return {
    success: true,
    data: {
      enabled: config.enabled,
      tools,
      exa: config.exa,
    },
  }
})
