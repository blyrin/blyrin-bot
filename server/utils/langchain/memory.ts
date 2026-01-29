import { AIMessage, type BaseMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'

// 将内容转换为纯文本
function contentToText(content: string | ChatMessageContent[] | null): string {
  if (!content) return ''
  if (typeof content === 'string') return content
  return content.filter(c => c.type === 'text' && c.text).map(c => c.text).join('\n')
}

// 获取用户名称
function getMessageName(msg: ChatMessage, groupId?: number): string | undefined {
  if (msg.role !== 'user' || !msg.userId || !groupId) return undefined
  return getUserNickname(groupId, msg.userId) || undefined
}

// 为内容添加时间前缀
function addTimestampPrefix(text: string, timestamp?: number): string {
  const timeStr = formatTimestamp(timestamp)
  if (!timeStr) return text
  return `[${timeStr}] ${text}`
}

// 为内容添加消息ID前缀
function addMessageIdPrefix(text: string, messageId?: number): string {
  if (!messageId) return text
  return `[messageId:${messageId}] ${text}`
}

// 转换 ChatMessage 内容为 LangChain 格式
function convertContent(
  content: string | ChatMessageContent[] | null,
  timestamp?: number,
  messageId?: number,
  addMeta = true,
): string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> {
  if (!content) return ''

  if (typeof content === 'string') {
    let text = content
    if (addMeta) {
      text = addTimestampPrefix(text, timestamp)
      text = addMessageIdPrefix(text, messageId)
    }
    return text
  }

  // 多媒体内容
  const result: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = []

  for (const item of content) {
    if (item.type === 'text' && item.text) {
      let text = item.text
      if (addMeta && result.length === 0) {
        // 只给第一个文本添加元数据
        text = addTimestampPrefix(text, timestamp)
        text = addMessageIdPrefix(text, messageId)
      }
      result.push({ type: 'text', text })
    } else if (item.type === 'image_url' && item.image_url?.url) {
      result.push({ type: 'image_url', image_url: { url: item.image_url.url } })
    }
  }

  // 如果只有一个文本项，返回字符串
  if (result.length === 1 && result[0]!.type === 'text') {
    return result[0]!.text
  }

  return result
}

/**
 * 将 ChatMessage[] 转换为 LangChain BaseMessage[]
 */
export function chatMessagesToLangChain(
  messages: ChatMessage[],
  groupId?: number,
): BaseMessage[] {
  const result: BaseMessage[] = []

  for (const msg of messages) {
    switch (msg.role) {
      case 'system':
        result.push(new SystemMessage(contentToText(msg.content)))
        break

      case 'user': {
        const name = getMessageName(msg, groupId)
        const content = convertContent(msg.content, msg.timestamp, msg.messageId)
        result.push(new HumanMessage({
          content,
          name,
        }))
        break
      }

      case 'assistant': {
        // assistant 消息不添加时间戳
        const content = convertContent(msg.content, undefined, undefined, false)

        if (msg.tool_calls?.length) {
          // 有工具调用的 assistant 消息
          result.push(new AIMessage({
            content: content || '',
            tool_calls: msg.tool_calls.map(tc => ({
              id: tc.id,
              name: tc.function.name,
              args: JSON.parse(tc.function.arguments || '{}'),
            })),
          }))
        } else {
          result.push(new AIMessage(content || ''))
        }
        break
      }

      case 'tool': {
        if (msg.tool_call_id) {
          result.push(new ToolMessage({
            content: typeof msg.content === 'string' ? msg.content : contentToText(msg.content),
            tool_call_id: msg.tool_call_id,
          }))
        }
        break
      }
    }
  }

  return result
}

/**
 * 将 LangChain BaseMessage[] 转换为 ChatMessage[]
 */
export function langChainToChatMessages(messages: BaseMessage[]): ChatMessage[] {
  const result: ChatMessage[] = []

  for (const msg of messages) {
    const msgType = msg.type

    switch (msgType) {
      case 'system':
        result.push({
          role: 'system',
          content: typeof msg.content === 'string' ? msg.content : '',
          timestamp: Date.now(),
        })
        break

      case 'human':
        result.push({
          role: 'user',
          content: typeof msg.content === 'string' ? msg.content : '',
          timestamp: Date.now(),
        })
        break

      case 'ai': {
        const aiMsg = msg as AIMessage
        const chatMsg: ChatMessage = {
          role: 'assistant',
          content: typeof aiMsg.content === 'string' ? aiMsg.content : '',
          timestamp: Date.now(),
        }

        if (aiMsg.tool_calls?.length) {
          chatMsg.tool_calls = aiMsg.tool_calls.map(tc => ({
            id: tc.id || '',
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.args),
            },
          }))
        }

        result.push(chatMsg)
        break
      }

      case 'tool': {
        const toolMsg = msg as ToolMessage
        result.push({
          role: 'tool',
          content: typeof toolMsg.content === 'string' ? toolMsg.content : '',
          tool_call_id: toolMsg.tool_call_id,
          timestamp: Date.now(),
        })
        break
      }
    }
  }

  return result
}

/**
 * 格式化消息为文本（用于压缩和提取）
 */
export function formatMessagesAsText(messages: ChatMessage[], groupId?: number): string {
  return messages
    .map((msg) => {
      const messageIdPrefix = msg.messageId ? `[messageId:${msg.messageId}] ` : ''
      return `${getMessageName(msg, groupId) ?? msg.role}: ${messageIdPrefix}${contentToText(msg.content)}`
    })
    .join('\n')
}
