import { executeTool, getEnabledToolDefinitions, registerTool } from './index'

// Subagent 工具定义
const subagentDefinition: ToolDefinition = {
  name: 'subagent',
  description: '委托子代理执行工具密集型任务，返回精简结果。适用于需要多次工具调用的复杂任务，避免工具调用过程污染主对话上下文。',
  parameters: {
    type: 'object',
    properties: {
      task: {
        type: 'string',
        description: '任务描述，清晰说明需要完成的目标',
      },
      tools: {
        type: 'array',
        description: '允许使用的工具白名单（可选），不指定则使用所有已启用工具（除 subagent 外）',
        items: {
          type: 'string',
          description: '工具名称',
        },
      },
      max_rounds: {
        type: 'number',
        description: '最大执行轮数（可选），默认 10，最大 50',
      },
    },
    required: ['task'],
  },
}

interface SubagentResult {
  success: boolean
  message: string
  data: {
    toolsUsed: string[]
    rounds: number
  }
}

interface OpenAIMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string | null
  tool_calls?: OpenAIToolCall[]
  tool_call_id?: string
}

interface OpenAIResponse {
  choices: Array<{
    message: { content: string | null; tool_calls?: OpenAIToolCall[] }
    finish_reason: string
  }>
}

// 构建子代理系统提示词
function buildSubagentSystemPrompt(task: string): string {
  return `你是一个专注执行任务的子代理。你的唯一目标是完成以下任务：

任务：${task}

执行要求：
1. 专注于任务目标，使用可用工具完成任务
2. 每次工具调用后评估结果，决定是否需要继续
3. 任务完成后，输出简洁的结果摘要
4. 如果无法完成任务，说明原因

注意：你的输出将作为结果返回给主 AI，请保持简洁明了。`
}

// 过滤可用工具（排除 subagent 防止递归）
function filterToolsForSubagent(
  allowedTools?: string[],
): Array<{ type: 'function'; function: ToolDefinition }> {
  const allTools = getEnabledToolDefinitions()

  // 排除 subagent 自身
  let filtered = allTools.filter(tool => tool.name !== 'subagent')

  // 如果指定了白名单，进一步过滤
  if (allowedTools && allowedTools.length > 0) {
    const allowedSet = new Set(allowedTools)
    filtered = filtered.filter(tool => allowedSet.has(tool.name))
  }

  return filtered.map(def => ({
    type: 'function' as const,
    function: def,
  }))
}

// 调用 OpenAI API
async function callSubagentAPI(
  messages: OpenAIMessage[],
  tools: Array<{ type: 'function'; function: ToolDefinition }>,
): Promise<{ content: string; toolCalls?: OpenAIToolCall[] }> {
  const config = getAIConfig()
  const timeout = config.provider.timeout ?? 60000

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(`${config.provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.provider.apiKey}`,
      },
      body: JSON.stringify({
        model: config.provider.model,
        messages,
        max_tokens: config.generation.maxTokens,
        temperature: config.generation.temperature,
        ...(tools.length > 0 && { tools, tool_choice: 'auto' }),
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`API 错误: ${response.status} - ${error.slice(0, 200)}`)
    }

    const data = (await response.json()) as OpenAIResponse
    const message = data.choices[0]?.message

    return {
      content: message?.content ?? '',
      toolCalls: message?.tool_calls,
    }
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`API 请求超时 (${timeout}ms)`)
    }
    throw error
  }
}

// 子代理执行循环
async function runSubagentLoop(
  task: string,
  tools: Array<{ type: 'function'; function: ToolDefinition }>,
  context: ToolContext,
  maxRounds: number,
): Promise<SubagentResult> {
  const messages: OpenAIMessage[] = [
    { role: 'system', content: buildSubagentSystemPrompt(task) },
    { role: 'user', content: task },
  ]

  const toolsUsed = new Set<string>()
  let rounds = 0

  logger.info('Subagent', `开始执行任务`, {
    task: task.slice(0, 100),
    availableTools: tools.map(t => t.function.name),
    maxRounds,
  })

  while (rounds < maxRounds) {
    rounds++

    logger.debug('Subagent', `第 ${rounds} 轮`, { messageCount: messages.length })

    // 调用 AI
    const response = await callSubagentAPI(messages, tools)

    // 没有工具调用，任务完成
    if (!response.toolCalls?.length) {
      logger.info('Subagent', `任务完成`, {
        rounds,
        toolsUsed: Array.from(toolsUsed),
        resultLength: response.content.length,
      })

      return {
        success: true,
        message: response.content || '任务已完成，但没有输出内容',
        data: {
          toolsUsed: Array.from(toolsUsed),
          rounds,
        },
      }
    }

    // 记录 assistant 消息
    messages.push({
      role: 'assistant',
      content: response.content,
      tool_calls: response.toolCalls,
    })

    // 执行工具调用
    for (const toolCall of response.toolCalls) {
      const toolName = toolCall.function.name
      toolsUsed.add(toolName)

      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(toolCall.function.arguments)
      } catch {
        logger.warn('Subagent', `解析工具参数失败`, {
          toolName,
          arguments: toolCall.function.arguments,
        })
      }

      logger.debug('Subagent', `执行工具: ${toolName}`, { args })

      const result = await executeTool(toolName, args, context)

      // 记录 tool 消息
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      })
    }
  }

  // 达到最大轮数，获取最终总结
  logger.warn('Subagent', `达到最大轮数`, { maxRounds, toolsUsed: Array.from(toolsUsed) })

  // 请求 AI 总结当前进度
  messages.push({
    role: 'user',
    content: '已达到最大执行轮数，请总结当前进度和结果。',
  })

  const finalResponse = await callSubagentAPI(messages, []) // 不再提供工具

  return {
    success: true,
    message: finalResponse.content || '达到最大轮数，任务可能未完全完成',
    data: {
      toolsUsed: Array.from(toolsUsed),
      rounds,
    },
  }
}

// Subagent 工具执行函数
async function executeSubagent(
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  const task = args.task
  const allowedTools = args.tools as string[] | undefined
  let maxRounds = (args.max_rounds as number) || 10

  // 参数验证
  if (!task || typeof task !== 'string') {
    return {
      success: false,
      message: '缺少任务描述参数',
    }
  }

  // 限制最大轮数
  maxRounds = Math.max(1, Math.min(50, maxRounds))

  // 获取可用工具
  const tools = filterToolsForSubagent(allowedTools)

  if (tools.length === 0) {
    return {
      success: false,
      message: '没有可用的工具，无法执行任务',
    }
  }

  try {
    const result = await runSubagentLoop(task, tools, context, maxRounds)

    logger.info('Subagent', `任务执行完成`, {
      success: result.success,
      toolsUsed: result.data.toolsUsed,
      rounds: result.data.rounds,
    })

    return {
      success: result.success,
      message: result.message,
      data: result.data,
    }
  } catch (error) {
    logger.error('Subagent', `任务执行失败`, { error: String(error) })

    return {
      success: false,
      message: `子代理执行失败: ${String(error)}`,
    }
  }
}

function register(): void {
  registerTool(subagentDefinition, executeSubagent)
}

register()
