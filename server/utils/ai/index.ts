import { HumanMessage, SystemMessage } from '@langchain/core/messages'

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

/**
 * 核心聊天函数
 */
export async function chat(
  messages: ChatMessage[],
  systemPrompt: string,
  groupId?: number,
  options?: ChatOptions,
): Promise<ChatResult> {
  // 转换消息格式
  const langChainMessages = chatMessagesToLangChain(messages, groupId)

  // 调用 Agent
  const result = await invokeAgent({
    systemPrompt,
    messages: langChainMessages,
    toolContext: options?.toolContext,
    onIntermediateOutput: options?.onIntermediateOutput,
    abortSignal: options?.abortSignal,
  })

  return {
    content: result.content,
    toolMessages: result.toolMessages.length > 0 ? result.toolMessages : undefined,
    aborted: result.aborted,
  }
}

/**
 * 带视觉能力的聊天
 */
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

  // 转换消息，最后一条消息需要添加图片
  const langChainMessages = chatMessagesToLangChain(messages.slice(0, -1), groupId)

  // 处理最后一条消息，添加图片
  const lastMessage = messages[messages.length - 1]!
  const textContent = typeof lastMessage.content === 'string'
    ? lastMessage.content
    : lastMessage.content?.filter(c => c.type === 'text').map(c => c.text).join('\n') || ''

  const timeStr = formatTimestamp(lastMessage.timestamp)
  const textWithTime = timeStr ? `[${timeStr}] ${textContent}` : textContent
  const textWithMeta = lastMessage.messageId ? `[messageId:${lastMessage.messageId}] ${textWithTime}` : textWithTime

  // 构建多模态内容
  const multimodalContent: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [
    { type: 'text', text: textWithMeta },
    ...imageUrls.map(url => ({
      type: 'image_url' as const,
      image_url: { url },
    })),
  ]

  langChainMessages.push(new HumanMessage({ content: multimodalContent }))

  // 调用 Agent
  const result = await invokeAgent({
    systemPrompt,
    messages: langChainMessages,
    toolContext: options?.toolContext,
    onIntermediateOutput: options?.onIntermediateOutput,
    abortSignal: options?.abortSignal,
  })

  return {
    content: result.content,
    toolMessages: result.toolMessages.length > 0 ? result.toolMessages : undefined,
    aborted: result.aborted,
  }
}

/**
 * 压缩上下文
 */
export async function compressContext(messages: ChatMessage[], groupId?: number): Promise<string> {
  const config = getAIConfig()
  const prompts = getPromptsConfig()

  const llm = createLLM({
    model: config.compression.model,
    maxTokens: config.compression.maxTokens,
    temperature: 0.3,
  })

  const response = await llm.invoke([
    new SystemMessage('你是一个对话摘要助手，请简洁地总结对话要点。'),
    new HumanMessage(`${prompts.compression.instruction}\n\n${formatMessagesAsText(messages, groupId)}`),
  ])

  return typeof response.content === 'string' ? response.content : ''
}

/**
 * 提取用户信息
 */
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

  const content = await simpleLLMCall(
    [
      new SystemMessage('你是一个用户画像分析助手，请从对话中提取用户特征。'),
      new HumanMessage(prompt),
    ],
    {
      model: config.compression.model,
      maxTokens: 200,
      temperature: 0.3,
    },
  )

  return content
}
