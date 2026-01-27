import z from 'zod'

const ImportDataSchema = z.object({
  version: z.number().int().min(1).max(100),
  configs: z.object({
    bot: BotConfigSchema.optional(),
    ai: AIConfigSchema.optional(),
    groups: GroupsConfigSchema.optional(),
    prompts: PromptsConfigSchema.optional(),
    tools: ToolsConfigSchema.optional(),
    mcp: MCPConfigSchema.optional(),
  }),
})

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  // 验证请求体
  const result = ImportDataSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: result.error.errors[0]?.message || '请求数据无效',
    })
  }

  const data = result.data
  const results: Record<string, boolean> = {}

  if (data.configs.bot) {
    try {
      updateBotConfig(data.configs.bot as Parameters<typeof updateBotConfig>[0])
      results.bot = true
    } catch {
      results.bot = false
    }
  }

  if (data.configs.ai) {
    try {
      updateAIConfig(data.configs.ai as Parameters<typeof updateAIConfig>[0])
      results.ai = true
    } catch {
      results.ai = false
    }
  }

  if (data.configs.groups) {
    try {
      updateGroupsConfig(data.configs.groups as Parameters<typeof updateGroupsConfig>[0])
      results.groups = true
    } catch {
      results.groups = false
    }
  }

  if (data.configs.prompts) {
    try {
      updatePromptsConfig(data.configs.prompts as Parameters<typeof updatePromptsConfig>[0])
      results.prompts = true
    } catch {
      results.prompts = false
    }
  }

  if (data.configs.tools) {
    try {
      updateToolsConfig(data.configs.tools as Parameters<typeof updateToolsConfig>[0])
      results.tools = true
    } catch {
      results.tools = false
    }
  }

  if (data.configs.mcp) {
    try {
      updateMCPConfig(data.configs.mcp as Parameters<typeof updateMCPConfig>[0])
      results.mcp = true
    } catch {
      results.mcp = false
    }
  }

  return { success: true, data: results }
})
