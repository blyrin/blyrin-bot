// 工具执行函数类型
export type ToolExecutor = (
  args: Record<string, unknown>,
  context: ToolContext,
) => Promise<ToolResult>

// 工具注册表
interface RegisteredTool {
  definition: ToolDefinition;
  executor: ToolExecutor;
}

const toolRegistry = new Map<string, RegisteredTool>()

// 系统定义的所有工具元数据（用于管理界面显示）
const ALL_TOOLS: Array<{ name: string; description: string }> = [
  {
    name: 'subagent',
    description: '委托子代理执行工具密集型任务，返回精简结果。适用于需要多次工具调用的复杂任务。',
  },
  {
    name: 'exa_search',
    description: '使用 Exa 搜索引擎搜索网络信息。可以搜索最新的新闻、文章、技术文档等内容。',
  },
  {
    name: 'send_like',
    description: '给指定用户点赞（赞名片）。可以给群友点赞表示喜欢或感谢。每次最多点10个赞。',
  },
  {
    name: 'group_poke',
    description: '戳一戳群成员。可以用来打招呼、提醒某人。',
  },
  {
    name: 'get_group_honor',
    description: '查询群荣誉信息，包括龙王、群聊之火等荣誉称号。',
  },
  {
    name: 'set_essence_message',
    description: '将消息设为群精华。需要机器人有管理员权限。',
  },
  {
    name: 'delete_message',
    description: '撤回消息。撤回他人消息需要管理员权限。',
  },
]

// 注册工具
export function registerTool(
  definition: ToolDefinition,
  executor: ToolExecutor,
): void {
  toolRegistry.set(definition.name, { definition, executor })
  logger.info('Tools', `注册工具: ${definition.name}`)
}

// 获取所有已启用的工具定义（用于发送给 AI）
export function getEnabledToolDefinitions(): ToolDefinition[] {
  const config = getToolsConfig()

  if (!config.enabled) {
    return []
  }

  const enabledTools: ToolDefinition[] = []

  // 内置工具
  for (const [name, tool] of toolRegistry) {
    if (config.tools[name]) {
      enabledTools.push(tool.definition)
    }
  }

  // MCP 工具
  const mcpConfig = getMCPConfig()
  if (mcpConfig.enabled) {
    const mcpTools = mcpManager.getEnabledTools(mcpConfig.toolStates)
    for (const { serverName, tool } of mcpTools) {
      const mcpToolName = `mcp_${serverName}_${tool.name}`
      enabledTools.push({
        name: mcpToolName,
        description: `[${mcpToolName}] ${tool.description}`,
        parameters: {
          type: 'object',
          properties: (tool.inputSchema.properties || {}) as ToolDefinition['parameters']['properties'],
          required: tool.inputSchema.required as string[] | undefined,
        },
      })
    }
  }

  return enabledTools
}

// 获取所有已注册的工具信息（用于管理界面）
export function getAllToolInfos(): ToolInfo[] {
  const config = getToolsConfig()

  return ALL_TOOLS.map(tool => ({
    name: tool.name,
    description: tool.description,
    enabled: config.tools[tool.name] ?? false,
  }))
}

// 获取所有已注册的工具名称
export function getRegisteredToolNames(): string[] {
  return Array.from(toolRegistry.keys())
}

// 检查工具是否启用
export function isToolEnabled(name: string): boolean {
  const config = getToolsConfig()
  if (!config.enabled) return false
  return config.tools[name] ?? false
}

// 执行工具
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  // 检查是否是 MCP 工具
  if (name.startsWith('mcp_')) {
    return executeMCPTool(name, args, context)
  }

  const tool = toolRegistry.get(name)

  if (!tool) {
    logger.error('Tools', `工具不存在: ${name}`)
    return {
      success: false,
      message: `工具 ${name} 不存在`,
    }
  }

  if (!isToolEnabled(name)) {
    logger.warn('Tools', `工具未启用: ${name}`)
    return {
      success: false,
      message: `工具 ${name} 未启用`,
    }
  }

  try {
    logger.info('Tools', `执行工具: ${name}`, { args, context })
    const result = await tool.executor(args, context)
    logger.info('Tools', `工具执行完成: ${name}`, { result })
    return result
  } catch (error) {
    logger.error('Tools', `工具执行失败: ${name}`, { error: String(error) })
    return {
      success: false,
      message: `工具执行失败: ${String(error)}`,
    }
  }
}

// 执行 MCP 工具
async function executeMCPTool(
  name: string,
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  const mcpConfig = getMCPConfig()

  if (!mcpConfig.enabled) {
    return {
      success: false,
      message: 'MCP 未启用',
    }
  }

  // 解析工具名称: mcp_{serverName}_{toolName}
  const parts = name.split('_')
  if (parts.length < 3) {
    return {
      success: false,
      message: `无效的 MCP 工具名称: ${name}`,
    }
  }

  const serverName = parts[1]
  const toolName = parts.slice(2).join('_')

  // 查找匹配的服务器
  const server = mcpConfig.servers.find(s => s.name === serverName)
  if (!server) {
    return {
      success: false,
      message: `MCP 服务器不存在: ${serverName}`,
    }
  }

  // 检查工具是否启用（默认启用，除非明确禁用）
  const toolKey = `${server.id}:${toolName}`
  if (mcpConfig.toolStates[toolKey] === false) {
    return {
      success: false,
      message: `MCP 工具未启用: ${toolName}`,
    }
  }

  try {
    logger.info('Tools', `执行 MCP 工具: ${name}`, { serverId: server.id, toolName, args, context })
    const result = await mcpManager.callTool(server.id, toolName, args)
    logger.info('Tools', `MCP 工具执行完成: ${name}`, { result })
    return {
      success: true,
      message: String(result),
      data: result,
    }
  } catch (error) {
    logger.error('Tools', `MCP 工具执行失败: ${name}`, { error: String(error) })
    return {
      success: false,
      message: `MCP 工具执行失败: ${String(error)}`,
    }
  }
}

// 转换为 OpenAI tools 格式
export function toOpenAITools(): Array<{
  type: 'function';
  function: ToolDefinition;
}> {
  const definitions = getEnabledToolDefinitions()
  return definitions.map(def => ({
    type: 'function' as const,
    function: def,
  }))
}

let toolsInitialized = false

export async function initializeTools() {
  logger.info('Tools', '正在初始化内置工具...')
  if (toolsInitialized) {
    logger.debug('Tools', '已初始化，跳过')
    return
  }

  await Promise.all([
    import('./exa-search'),
    import('./send-like'),
    import('./group-poke'),
    import('./get-group-honor'),
    import('./set-essence-message'),
    import('./delete-message'),
    import('./subagent'),
  ])
  toolsInitialized = true
  logger.info('Tools', '内置工具初始化完成')
}
