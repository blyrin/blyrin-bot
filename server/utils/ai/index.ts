interface OpenAIMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string | ChatMessageContent[] | null
  name?: string
  tool_calls?: OpenAIToolCall[]
  tool_call_id?: string
}

interface OpenAIResponse {
  choices: Array<{
    message: { content: string | null; tool_calls?: OpenAIToolCall[] }
    finish_reason: string
  }>
}

interface CallOpenAIOptions {
  model?: string
  maxTokens?: number
  temperature?: number
  tools?: Array<{ type: 'function'; function: { name: string; description: string; parameters: unknown } }>
  toolContext?: ToolContext
  timeout?: number
  abortSignal?: AbortSignal
}

// 聊天选项
export interface ChatOptions {
  toolContext?: ToolContext
  onIntermediateOutput?: (content: string) => Promise<void>
  abortSignal?: AbortSignal
}

// 聊天结果
export interface ChatResult {
  content: string
  toolMessages?: ChatMessage[]
  aborted?: boolean
}

// 将内容转换为纯文本
function contentToText(content: string | ChatMessageContent[] | null): string {
  if (!content) return ''
  if (typeof content === 'string') return content
  return content.filter(c => c.type === 'text' && c.text).map(c => c.text).join('\n')
}

// 格式化时间戳
function formatTimestamp(timestamp?: number): string {
  if (!timestamp) return ''
  const d = new Date(timestamp)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()} ${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// 获取用户名称
function getMessageName(msg: ChatMessage, groupId?: number): string | undefined {
  if (msg.role !== 'user' || !msg.userId || !groupId) return undefined
  return getUserNickname(groupId, msg.userId) || undefined
}

// 为内容添加时间前缀
function addTimestampToContent(
  content: string | ChatMessageContent[] | null,
  timestamp?: number,
): string | ChatMessageContent[] | null {
  if (!content) return content
  const timeStr = formatTimestamp(timestamp)
  if (!timeStr) return content

  if (typeof content === 'string') return `[${timeStr}] ${content}`

  const result = [...content]
  const textIndex = result.findIndex(c => c.type === 'text')
  if (textIndex !== -1 && result[textIndex]!.text) {
    result[textIndex] = { ...result[textIndex]!, text: `[${timeStr}] ${result[textIndex]!.text}` }
  }
  return result
}

// 合并连续的同角色消息并确保消息序列符合 API 要求
// API 要求：assistant 消息后必须是 user 或 tool 消息
function mergeConsecutiveMessages(messages: OpenAIMessage[]): OpenAIMessage[] {
  const merged = messages.reduce<OpenAIMessage[]>((result, msg) => {
    const last = result[result.length - 1]

    // 合并连续的 user 消息
    if (last?.role === 'user' && msg.role === 'user') {
      last.content = `${contentToText(last.content)}\n${contentToText(msg.content)}`
      delete last.name
      return result
    }

    // 合并连续的 assistant 消息（没有 tool_calls 的情况）
    // 如果前一个 assistant 有 tool_calls，不能合并，因为后面应该跟 tool 消息
    if (last?.role === 'assistant' && msg.role === 'assistant' && !last.tool_calls?.length) {
      const lastContent = contentToText(last.content)
      const msgContent = contentToText(msg.content)
      if (lastContent || msgContent) {
        last.content = [lastContent, msgContent].filter(Boolean).join('\n')
      }
      // 如果新消息有 tool_calls，保留它
      if (msg.tool_calls?.length) {
        last.tool_calls = msg.tool_calls
      }
      return result
    }

    result.push({ ...msg })
    return result
  }, [])

  // 过滤掉无效的消息序列：
  // 1. assistant 消息（有 tool_calls）后面必须跟对应的 tool 消息
  // 2. 如果 tool 消息的 tool_call_id 找不到对应的 assistant tool_calls，移除它
  const validMessages: OpenAIMessage[] = []
  const pendingToolCallIds = new Set<string>()

  for (const msg of merged) {
    if (msg.role === 'assistant' && msg.tool_calls?.length) {
      // 记录需要的 tool_call_id
      for (const tc of msg.tool_calls) {
        pendingToolCallIds.add(tc.id)
      }
      validMessages.push(msg)
    } else if (msg.role === 'tool') {
      // 只保留有对应 tool_calls 的 tool 消息
      if (msg.tool_call_id && pendingToolCallIds.has(msg.tool_call_id)) {
        pendingToolCallIds.delete(msg.tool_call_id)
        validMessages.push(msg)
      } else {
        logger.warn('AI', '跳过孤立的 tool 消息', { tool_call_id: msg.tool_call_id })
      }
    } else {
      // 如果还有未匹配的 tool_calls，说明消息序列不完整
      // 移除最后一个 assistant 消息（有 tool_calls 但没有对应 tool 响应）
      if (pendingToolCallIds.size > 0) {
        const lastIdx = validMessages.length - 1
        if (lastIdx >= 0 && validMessages[lastIdx]?.role === 'assistant' && validMessages[lastIdx]?.tool_calls?.length) {
          logger.warn('AI', '移除不完整的工具调用 assistant 消息', {
            missingToolCallIds: Array.from(pendingToolCallIds),
          })
          validMessages.pop()
        }
        pendingToolCallIds.clear()
      }
      validMessages.push(msg)
    }
  }

  // 最后检查：如果结尾是有 tool_calls 的 assistant 但没有 tool 响应，移除它
  if (pendingToolCallIds.size > 0) {
    const lastIdx = validMessages.length - 1
    if (lastIdx >= 0 && validMessages[lastIdx]?.role === 'assistant' && validMessages[lastIdx]?.tool_calls?.length) {
      logger.warn('AI', '移除结尾不完整的工具调用 assistant 消息', {
        missingToolCallIds: Array.from(pendingToolCallIds),
      })
      validMessages.pop()
    }
  }

  return validMessages
}

// 格式化消息为文本（用于压缩和提取）
function formatMessagesAsText(messages: ChatMessage[], groupId?: number): string {
  return messages
    .map(msg => `${getMessageName(msg, groupId) ?? msg.role}: ${contentToText(msg.content)}`)
    .join('\n')
}

// 转换 ChatMessage 为 OpenAIMessage
function toOpenAIMessage(msg: ChatMessage, groupId?: number): OpenAIMessage {
  // tool 消息直接转换
  if (msg.role === 'tool') {
    return {
      role: 'tool',
      tool_call_id: msg.tool_call_id!,
      content: typeof msg.content === 'string' ? msg.content : contentToText(msg.content),
    }
  }

  const name = getMessageName(msg, groupId)
  // assistant 消息不添加时间戳
  const content = msg.role === 'assistant' ? msg.content : addTimestampToContent(msg.content, msg.timestamp)

  const result: OpenAIMessage = {
    role: msg.role,
    content: content ?? '',
    ...(name && { name }),
  }

  // 保留 tool_calls
  if (msg.tool_calls?.length) {
    result.tool_calls = msg.tool_calls
  }

  return result
}

async function callOpenAI(
  messages: OpenAIMessage[],
  options?: CallOpenAIOptions,
): Promise<{ content: string; toolCalls?: OpenAIToolCall[] }> {
  const config = getAIConfig()
  const model = options?.model ?? config.provider.model
  const maxTokens = options?.maxTokens ?? config.generation.maxTokens
  const temperature = options?.temperature ?? config.generation.temperature
  const timeout = options?.timeout ?? 60000

  logger.debug('AI', '发起 API 请求', {
    model, maxTokens, temperature,
    messageCount: messages.length,
    hasTools: !!options?.tools?.length,
  })

  logger.debug('AI', '请求消息内容', {
    messages: messages.map(msg => ({
      role: msg.role,
      content: typeof msg.content === 'string'
        ? msg.content.slice(0, 500) + (msg.content.length > 500 ? '...' : '')
        : msg.content === null ? '[null]' : '[多媒体内容]',
      tool_calls: msg.tool_calls?.map(tc => tc.function.name),
    })),
  })

  const startTime = Date.now()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  // 如果有外部 abortSignal，监听它
  const externalAbortHandler = () => controller.abort()
  if (options?.abortSignal) {
    if (options.abortSignal.aborted) {
      clearTimeout(timeoutId)
      throw new Error('操作已被打断')
    }
    options.abortSignal.addEventListener('abort', externalAbortHandler)
  }

  try {
    const response = await fetch(`${config.provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.provider.apiKey}`,
      },
      body: JSON.stringify({
        model, messages, max_tokens: maxTokens, temperature,
        ...(options?.tools?.length && { tools: options.tools, tool_choice: 'auto' }),
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)
    const elapsed = Date.now() - startTime

    if (!response.ok) {
      const error = await response.text()
      logger.error('AI', 'API 请求失败', { status: response.status, error: error.slice(0, 500), elapsed })
      throw new Error(`OpenAI API error: ${response.status} - ${error}`)
    }

    const data = (await response.json()) as OpenAIResponse
    const message = data.choices[0]?.message
    const content = message?.content ?? ''
    const toolCalls = message?.tool_calls

    logger.debug('AI', 'API 响应成功', {
      elapsed,
      responseLength: content.length,
      responsePreview: content.slice(0, 500) + (content.length > 500 ? '...' : ''),
      hasToolCalls: !!toolCalls?.length,
      toolCalls: toolCalls?.map(tc => tc.function.name),
    })

    return { content, toolCalls }
  } catch (error) {
    clearTimeout(timeoutId)
    // 清理外部 abortSignal 监听器
    if (options?.abortSignal) {
      options.abortSignal.removeEventListener('abort', externalAbortHandler)
    }
    if (error instanceof Error && error.name === 'AbortError') {
      // 检查是否是外部打断
      if (options?.abortSignal?.aborted) {
        logger.info('AI', 'API 请求被打断', { elapsed: Date.now() - startTime })
        throw new Error('操作已被打断')
      }
      logger.error('AI', 'API 请求超时', { timeout, elapsed: Date.now() - startTime })
      throw new Error(`OpenAI API 请求超时 (${timeout}ms)`)
    }
    throw error
  } finally {
    // 确保清理监听器
    if (options?.abortSignal) {
      options.abortSignal.removeEventListener('abort', externalAbortHandler)
    }
  }
}

// 无限轮工具调用循环
async function handleToolCallsLoop(
  messages: OpenAIMessage[],
  initialToolCalls: OpenAIToolCall[],
  toolContext: ToolContext,
  options: {
    tools?: CallOpenAIOptions['tools']
    onIntermediateOutput?: (content: string) => Promise<void>
    abortSignal?: AbortSignal
  },
): Promise<{
  content: string
  toolMessages: ChatMessage[]
  aborted: boolean
}> {
  const toolMessages: ChatMessage[] = []
  let currentToolCalls = initialToolCalls
  let round = 0

  while (currentToolCalls.length > 0) {
    round++

    // 检查是否被打断
    if (options.abortSignal?.aborted) {
      logger.info('AI', '工具调用循环被打断', { round })
      return { content: '', toolMessages, aborted: true }
    }

    logger.info('AI', `处理工具调用 (第 ${round} 轮)`, {
      toolCount: currentToolCalls.length,
      tools: currentToolCalls.map(tc => tc.function.name),
    })

    // 记录 assistant 消息（含 tool_calls）
    const assistantMsg: ChatMessage = {
      role: 'assistant',
      content: null,
      tool_calls: currentToolCalls,
      timestamp: Date.now(),
    }
    toolMessages.push(assistantMsg)
    messages.push({ role: 'assistant', content: null, tool_calls: currentToolCalls })

    // 执行所有工具调用
    for (const toolCall of currentToolCalls) {
      // 再次检查打断
      if (options.abortSignal?.aborted) {
        logger.info('AI', '工具执行被打断', { round, toolName: toolCall.function.name })
        return { content: '', toolMessages, aborted: true }
      }

      const toolName = toolCall.function.name
      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(toolCall.function.arguments)
      } catch (e) {
        logger.error('AI', '解析工具参数失败', {
          toolName, arguments: toolCall.function.arguments, error: String(e),
        })
      }

      const result = await executeTool(toolName, args, toolContext)
      const resultStr = JSON.stringify(result)

      // 记录 tool 消息
      const toolMsg: ChatMessage = {
        role: 'tool',
        content: resultStr,
        tool_call_id: toolCall.id,
        timestamp: Date.now(),
      }
      toolMessages.push(toolMsg)
      messages.push({ role: 'tool', tool_call_id: toolCall.id, content: resultStr })
    }

    // 再次检查打断
    if (options.abortSignal?.aborted) {
      return { content: '', toolMessages, aborted: true }
    }

    // 调用 AI 获取下一步响应
    const response = await callOpenAI(messages, {
      tools: options.tools,
      abortSignal: options.abortSignal,
    })

    // 如果有文本输出，发送中间输出
    if (response.content && options.onIntermediateOutput) {
      const trimmed = response.content.trim()
      if (trimmed && response.toolCalls?.length) {
        // 只有在还有后续工具调用时才作为中间输出
        await options.onIntermediateOutput(trimmed)
        // 记录中间输出到 toolMessages
        toolMessages.push({
          role: 'assistant',
          content: trimmed,
          timestamp: Date.now(),
        })
        messages.push({ role: 'assistant', content: trimmed })
      }
    }

    // 检查是否还有工具调用
    if (response.toolCalls?.length) {
      currentToolCalls = response.toolCalls
    } else {
      // 没有更多工具调用，返回最终内容
      return { content: response.content, toolMessages, aborted: false }
    }
  }

  return { content: '', toolMessages, aborted: false }
}

// 核心聊天逻辑
async function chatCore(
  messages: OpenAIMessage[],
  toolContext?: ToolContext,
  options?: ChatOptions,
): Promise<ChatResult> {
  const tools = toOpenAITools()
  const hasTools = tools.length > 0 && toolContext

  const response = await callOpenAI(messages, {
    tools: hasTools ? tools : undefined,
    toolContext,
    abortSignal: options?.abortSignal,
  })

  // 检查打断
  if (options?.abortSignal?.aborted) {
    return { content: '', aborted: true }
  }

  if (response.toolCalls?.length && toolContext) {
    const result = await handleToolCallsLoop(messages, response.toolCalls, toolContext, {
      tools: hasTools ? tools : undefined,
      onIntermediateOutput: options?.onIntermediateOutput,
      abortSignal: options?.abortSignal,
    })
    return result
  }

  return { content: response.content }
}

export async function chat(
  messages: ChatMessage[],
  systemPrompt: string,
  groupId?: number,
  options?: ChatOptions,
): Promise<ChatResult> {
  const openaiMessages = mergeConsecutiveMessages([
    { role: 'system', content: systemPrompt },
    ...messages.map(msg => toOpenAIMessage(msg, groupId)),
  ])

  return chatCore(openaiMessages, options?.toolContext, options)
}

export async function chatWithVision(
  messages: ChatMessage[],
  imageUrls: string[],
  systemPrompt: string,
  groupId?: number,
  options?: ChatOptions,
): Promise<ChatResult> {
  const config = getAIConfig()

  if (!config.provider.supportsVision || imageUrls.length === 0) {
    return chat(messages, systemPrompt, groupId, options)
  }

  const lastMessage = messages[messages.length - 1]!
  const timeStr = formatTimestamp(lastMessage.timestamp)
  const textContent = contentToText(lastMessage.content)
  const textWithTime = timeStr ? `[${timeStr}] ${textContent}` : textContent

  const contentWithImages: ChatMessageContent[] = [
    { type: 'text', text: textWithTime },
    ...imageUrls.slice(0, config.context.maxImagesPerRequest).map(url => ({
      type: 'image_url' as const,
      image_url: { url },
    })),
  ]

  const openaiMessages = mergeConsecutiveMessages([
    { role: 'system', content: systemPrompt },
    ...messages.slice(0, -1).map(msg => toOpenAIMessage(msg, groupId)),
    { role: lastMessage.role, content: contentWithImages },
  ])

  return chatCore(openaiMessages, options?.toolContext, options)
}

export async function compressContext(messages: ChatMessage[], groupId?: number): Promise<string> {
  const config = getAIConfig()
  const prompts = getPromptsConfig()

  const response = await callOpenAI([
    { role: 'system', content: '你是一个对话摘要助手，请简洁地总结对话要点。' },
    { role: 'user', content: `${prompts.compression.instruction}\n\n${formatMessagesAsText(messages, groupId)}` },
  ], {
    model: config.compression.model,
    maxTokens: config.compression.maxTokens,
    temperature: 0.3,
  })

  return response.content
}

export async function extractUserInfo(
  messages: ChatMessage[],
  existingInfo: string,
  groupId?: number,
): Promise<string> {
  const prompt = `根据以下对话，提取或更新用户的特征信息（如性格、偏好、常聊话题等）。

已有信息：
${existingInfo || '无'}

最近对话：
${formatMessagesAsText(messages, groupId)}

请用简洁的要点形式按已有信息格式输出更新后的用户特征`

  const config = getAIConfig()
  const response = await callOpenAI([
    { role: 'system', content: '你是一个用户画像分析助手，请从对话中提取用户特征。' },
    { role: 'user', content: prompt },
  ], {
    model: config.compression.model,
    maxTokens: 200,
    temperature: 0.3,
  })

  return response.content
}

// 注意：getEnabledToolDefinitions 已在 server/utils/tools/index.ts 中导出
// 此处不再重复导出，避免 Nuxt 自动导入重复警告
