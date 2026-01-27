import { z } from 'zod'

const BodySchema = z.object({
  baseUrl: z.string().url().max(500).or(z.literal('')),
  apiKey: z.string().max(500),
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

  setExaConfig(result.data)

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
