interface MessageSegment {
  type: string;
  data: Record<string, unknown>;
}

interface GroupMessageEvent {
  message_id: number;
  group_id: number;
  user_id: number;
  message: MessageSegment[];
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
  const message = event.message

  if (groupSettings.mustReplyOnAt && message.some(seg => seg.type === 'at' && seg.data.qq === String(selfId))) {
    return { shouldReply: true, reason: 'at' }
  }

  if (groupSettings.mustReplyOnQuote && message.some(seg => seg.type === 'reply')) {
    return { shouldReply: true, reason: 'quote' }
  }

  if (groupSettings.randomReplyProbability > 0 && Math.random() < groupSettings.randomReplyProbability) {
    return { shouldReply: true, reason: 'random' }
  }

  return { shouldReply: false, reason: 'none' }
}

// 提取图片URL和位置索引
export function extractImageSources(message: MessageSegment[]): Array<{ url: string; index: number }> {
  const result: Array<{ url: string; index: number }> = []
  let imageIndex = 0
  for (const seg of message) {
    if (seg.type !== 'image') continue
    const data = seg.data as { url?: unknown; file?: unknown; file_id?: unknown }
    const url = (typeof data.url === 'string' && data.url)
      || (typeof data.file === 'string' && data.file)
      || (typeof data.file_id === 'string' && data.file_id)
      || ''
    if (url) {
      result.push({ url, index: imageIndex })
    }
    imageIndex++
  }
  return result
}

// 提取消息元数据（@用户、引用等）
export function extractMessageMeta(message: MessageSegment[]): MessageMeta | undefined {
  const atUsers = message
    .filter(seg => seg.type === 'at')
    .map(seg => {
      const qq = seg.data.qq
      return typeof qq === 'string' ? parseInt(qq, 10) : (qq as number)
    })
    .filter(id => !isNaN(id))

  const replySegment = message.find(seg => seg.type === 'reply')
  const replyTo = replySegment ? {
    messageId: typeof replySegment.data.id === 'string'
      ? parseInt(replySegment.data.id, 10)
      : (replySegment.data.id as number),
  } : undefined

  if (atUsers.length === 0 && !replyTo) return undefined
  return {
    ...(atUsers.length > 0 && { atUsers }),
    ...(replyTo && { replyTo }),
  }
}

export type UserNameMap = Map<number, string>;

// 构建完整的消息内容，保留图片位置
export function buildMessageContent(
  message: MessageSegment[],
  meta: MessageMeta | undefined,
  sender: { userId: number; nickname: string },
  userNameMap?: UserNameMap,
  contextMessages?: ChatMessage[],
): ChatMessageContent[] {
  const result: ChatMessageContent[] = []

  // 构建前缀
  const prefixParts: string[] = [`[${sender.nickname}(${sender.userId})]`]

  if (meta?.replyTo) {
    const replyMsg = contextMessages?.find(msg => msg.messageId === meta.replyTo!.messageId)
    const replyText = replyMsg?.content
      ? (typeof replyMsg.content === 'string' ? replyMsg.content : replyMsg.content.find(c => c.type === 'text')?.text ?? '')
      : ''
    prefixParts.push(replyText
      ? `[引用: "${replyText.length > 100 ? replyText.slice(0, 100) + '...' : replyText}"]`
      : `[引用消息#${meta.replyTo.messageId}]`)
  }

  if (meta?.atUsers?.length) {
    prefixParts.push(meta.atUsers.map(id => {
      const name = userNameMap?.get(id)
      return name ? `@${name}(${id})` : `@${id}`
    }).join(' '))
  }

  result.push({ type: 'text', text: prefixParts.join(' ') + ' ' })

  // 按顺序添加文本和图片占位符
  let imageIndex = 0
  for (const seg of message) {
    if (seg.type === 'text') {
      const text = String(seg.data.text || '').trim()
      if (text) result.push({ type: 'text', text })
    } else if (seg.type === 'image') {
      result.push({ type: 'text', text: `[IMAGE:${imageIndex++}]` })
    }
  }

  return result.length > 1 ? result : [{ type: 'text', text: prefixParts.join(' ') }]
}
