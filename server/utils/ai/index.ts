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
  content: string | ChatMessageContent[],
  timestamp?: number,
): string | ChatMessageContent[] {
  const timeStr = formatTimestamp(timestamp)
  if (!timeStr) return content

  if (typeof content === 'string') return `[${timeStr}] ${content}`

  const result = [...content]
  const textIndex = result.findIndex(c => c.type === 'text')
  if (textIndex !== -1 && result[textIndex].text) {
    result[textIndex] = { ...result[textIndex], text: `[${timeStr}] ${result[textIndex].text}` }
  }
  return result
}

// 合并连续的 user 消息
function mergeConsecutiveMessages(messages: OpenAIMessage[]): OpenAIMessage[] {
  return messages.reduce<OpenAIMessage[]>((result, msg) => {
    const last = result[result.length - 1]
    if (last?.role === 'user' && msg.role === 'user') {
      last.content = `${contentToText(last.content)}\n${contentToText(msg.content)}`
      delete last.name
    } else {
      result.push({ ...msg })
    }
    return result
  }, [])
}

// 格式化消息为文本（用于压缩和提取）
function formatMessagesAsText(messages: ChatMessage[], groupId?: number): string {
  return messages
    .map(msg => `${getMessageName(msg, groupId) ?? msg.role}: ${contentToText(msg.content)}`)
    .join('\n')
}

// 转换 ChatMessage 为 OpenAIMessage
function toOpenAIMessage(msg: ChatMessage, groupId?: number): OpenAIMessage {
  const name = getMessageName(msg, groupId)
  // assistant 消息不添加时间戳
  const content = msg.role === 'assistant' ? msg.content : addTimestampToContent(msg.content, msg.timestamp)
  return {
    role: msg.role,
    content,
    ...(name && { name }),
  }
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
    if (error instanceof Error && error.name === 'AbortError') {
      logger.error('AI', 'API 请求超时', { timeout, elapsed: Date.now() - startTime })
      throw new Error(`OpenAI API 请求超时 (${timeout}ms)`)
    }
    throw error
  }
}

async function handleToolCalls(
  messages: OpenAIMessage[],
  toolCalls: OpenAIToolCall[],
  toolContext: ToolContext,
  options?: CallOpenAIOptions,
): Promise<string> {
  logger.info('AI', '处理工具调用', {
    toolCount: toolCalls.length,
    tools: toolCalls.map(tc => tc.function.name),
  })

  messages.push({ role: 'assistant', content: null, tool_calls: toolCalls })

  for (const toolCall of toolCalls) {
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
    messages.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify(result) })
  }

  const finalResponse = await callOpenAI(messages, { ...options, tools: undefined })

  if (finalResponse.toolCalls?.length) {
    logger.warn('AI', '工具调用后仍有新的工具调用请求，忽略')
  }

  return finalResponse.content
}

// 核心聊天逻辑
async function chatCore(
  messages: OpenAIMessage[],
  toolContext?: ToolContext,
): Promise<string> {
  const tools = toOpenAITools()
  const hasTools = tools.length > 0 && toolContext

  const response = await callOpenAI(messages, {
    tools: hasTools ? tools : undefined,
    toolContext,
  })

  if (response.toolCalls?.length && toolContext) {
    return handleToolCalls(messages, response.toolCalls, toolContext)
  }

  return response.content
}

export async function chat(
  messages: ChatMessage[],
  systemPrompt: string,
  groupId?: number,
  toolContext?: ToolContext,
): Promise<string> {
  const openaiMessages = mergeConsecutiveMessages([
    { role: 'system', content: systemPrompt },
    ...messages.map(msg => toOpenAIMessage(msg, groupId)),
  ])

  return chatCore(openaiMessages, toolContext)
}

export async function chatWithVision(
  messages: ChatMessage[],
  imageUrls: string[],
  systemPrompt: string,
  groupId?: number,
  toolContext?: ToolContext,
): Promise<string> {
  const config = getAIConfig()

  if (!config.provider.supportsVision || imageUrls.length === 0) {
    return chat(messages, systemPrompt, groupId, toolContext)
  }

  const lastMessage = messages[messages.length - 1]
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

  return chatCore(openaiMessages, toolContext)
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
