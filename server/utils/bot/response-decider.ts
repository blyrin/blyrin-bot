interface MessageSegment {
  type: string;
  data: Record<string, unknown>;
}

interface GroupMessageEvent {
  message_id: number;
  group_id: number;
  user_id: number;
  message: MessageSegment[];
  raw_message: string;
  sender: {
    user_id: number;
    nickname: string;
    card?: string;
    role?: string;
  };
}

export function shouldReply(
  event: GroupMessageEvent,
  groupSettings: GroupSettings,
  selfId: number,
): { shouldReply: boolean; reason: string } {
  // 检查机器人是否被 @
  const atSegments = event.message.filter(
    seg => seg.type === 'at' && seg.data.qq === String(selfId),
  )
  if (atSegments.length > 0 && groupSettings.mustReplyOnAt) {
    return { shouldReply: true, reason: 'at' }
  }

  // 检查消息是否是对机器人消息的回复
  const replySegments = event.message.filter(seg => seg.type === 'reply')
  if (replySegments.length > 0 && groupSettings.mustReplyOnQuote) {
    // 注意：如果不调用额外的 API，我们无法轻易判断回复是否针对我们的消息
    // 目前，如果启用了 mustReplyOnQuote，我们会回复任何引用消息
    return { shouldReply: true, reason: 'quote' }
  }

  // 随机回复概率
  if (groupSettings.randomReplyProbability > 0) {
    const random = Math.random()
    if (random < groupSettings.randomReplyProbability) {
      return { shouldReply: true, reason: 'random' }
    }
  }

  return { shouldReply: false, reason: 'none' }
}

export function extractTextContent(message: MessageSegment[]): string {
  return message
    .filter(seg => seg.type === 'text')
    .map(seg => String(seg.data.text || ''))
    .join('')
    .trim()
}

export function extractImageFiles(message: MessageSegment[]): string[] {
  return message
    .filter(seg => seg.type === 'image')
    .map(seg => {
      const data = seg.data as { url?: unknown; file?: unknown; file_id?: unknown }
      if (typeof data.url === 'string' && data.url) return data.url
      if (typeof data.file === 'string' && data.file) return data.file
      if (typeof data.file_id === 'string' && data.file_id) return data.file_id
      return ''
    })
    .filter(Boolean)
}

export function hasAtSelf(message: MessageSegment[], selfId: number): boolean {
  return message.some(
    seg => seg.type === 'at' && seg.data.qq === String(selfId),
  )
}

// 提取消息元数据（@用户、引用等）
// 注意：保留所有 @ 信息，包括 @bot 自己，以便完整记录消息上下文
export function extractMessageMeta(message: MessageSegment[], _selfId?: number): MessageMeta | undefined {
  const meta: MessageMeta = {}

  // 提取所有@的用户（包括机器人自己，保留完整元数据）
  const atUsers = message
    .filter(seg => seg.type === 'at')
    .map(seg => {
      const qq = seg.data.qq
      return typeof qq === 'string' ? parseInt(qq, 10) : (qq as number)
    })
    .filter(id => !isNaN(id))

  if (atUsers.length > 0) {
    meta.atUsers = atUsers
  }

  // 提取引用信息
  const replySegment = message.find(seg => seg.type === 'reply')
  if (replySegment) {
    const messageId = replySegment.data.id
    meta.replyTo = {
      messageId: typeof messageId === 'string' ? parseInt(messageId, 10) : (messageId as number),
    }
  }

  return Object.keys(meta).length > 0 ? meta : undefined
}

// 发送者信息接口
export interface SenderInfo {
  userId: number;
  nickname: string;
}

// 用户名称映射（用于将 @ 的用户ID转换为名称）
export type UserNameMap = Map<number, string>;

// 从上下文中查找引用的消息内容
function findReplyContent(replyToMessageId: number, contextMessages: ChatMessage[]): string | undefined {
  const replyMsg = contextMessages.find(msg => msg.messageId === replyToMessageId)
  if (!replyMsg || !replyMsg.content) return undefined

  // 提取消息内容（如果是字符串直接使用，否则提取文本部分）
  const content = typeof replyMsg.content === 'string'
    ? replyMsg.content
    : replyMsg.content.find(c => c.type === 'text')?.text ?? ''

  // 截取前100个字符，避免过长
  const truncated = content.length > 100 ? content.slice(0, 100) + '...' : content
  return truncated
}

// 构建完整的消息内容文本（包含发送者、@和引用的描述）
export function buildFullMessageContent(
  message: MessageSegment[],
  meta: MessageMeta | undefined,
  sender?: SenderInfo,
  userNameMap?: UserNameMap,
  contextMessages?: ChatMessage[],
): string {
  const parts: string[] = []

  // 添加发送者信息
  if (sender) {
    parts.push(`[${sender.nickname}(${sender.userId})]`)
  }

  // 添加引用标记（尝试关联实际内容）
  if (meta?.replyTo) {
    let replyContent: string | undefined
    if (contextMessages) {
      replyContent = findReplyContent(meta.replyTo.messageId, contextMessages)
    }
    if (replyContent) {
      parts.push(`[引用: "${replyContent}"]`)
    } else {
      parts.push(`[引用消息#${meta.replyTo.messageId}]`)
    }
  }

  // 添加@标记（尝试使用名称，否则使用ID）
  if (meta?.atUsers && meta.atUsers.length > 0) {
    const atPart = meta.atUsers.map(id => {
      const name = userNameMap?.get(id)
      return name ? `@${name}(${id})` : `@${id}`
    }).join(' ')
    parts.push(atPart)
  }

  // 添加文本内容
  const textContent = message
    .filter(seg => seg.type === 'text')
    .map(seg => String(seg.data.text || ''))
    .join('')
    .trim()

  if (textContent) {
    parts.push(textContent)
  }

  // 添加图片标记
  const imageCount = message.filter(seg => seg.type === 'image').length
  if (imageCount > 0) {
    parts.push(`[图片x${imageCount}]`)
  }

  return parts.join(' ').trim()
}
