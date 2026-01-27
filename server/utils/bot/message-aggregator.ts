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

interface PendingReply {
  triggerEvent: GroupMessageEvent;      // 触发回复的消息事件
  aggregatedEvents: GroupMessageEvent[]; // 冷却期间收集的后续消息
  timer: ReturnType<typeof setTimeout>; // 冷却定时器
  cooldownMs: number;                   // 冷却时间
  processing: boolean;                  // 是否正在处理中
}

type ReplyHandler = (triggerEvent: GroupMessageEvent, aggregatedEvents: GroupMessageEvent[]) => Promise<void>;

// 每个群独立的消息聚合状态
const pendingReplies: Map<number, PendingReply> = new Map()

/**
 * 尝试触发一个回复
 * 如果该群当前没有待处理的回复，则启动冷却计时器
 * 如果该群正在冷却中，则将消息添加到聚合列表
 *
 * @param event 消息事件
 * @param cooldownMs 冷却时间（毫秒）
 * @param handler 冷却结束后的处理函数
 * @returns 是否是触发消息（true）还是被聚合的消息（false）
 */
export function scheduleReply(
  event: GroupMessageEvent,
  cooldownMs: number,
  handler: ReplyHandler,
): boolean {
  const groupId = event.group_id

  const existing = pendingReplies.get(groupId)

  if (existing) {
    // 该群正在冷却中，将消息添加到聚合列表
    existing.aggregatedEvents.push(event)
    logger.debug('MessageAggregator', `消息已聚合`, {
      groupId,
      messageId: event.message_id,
      aggregatedCount: existing.aggregatedEvents.length,
      triggerMessageId: existing.triggerEvent.message_id,
    })
    return false
  }

  // 该群没有待处理的回复，创建新的冷却任务
  const timer = setTimeout(async () => {
    const pending = pendingReplies.get(groupId)
    // 检查是否已被取消或正在处理
    if (!pending || pending.processing) return

    // 标记为正在处理，防止重复处理
    pending.processing = true

    // 移除待处理状态
    pendingReplies.delete(groupId)

    logger.info('MessageAggregator', `冷却结束，开始处理`, {
      groupId,
      triggerMessageId: pending.triggerEvent.message_id,
      aggregatedCount: pending.aggregatedEvents.length,
    })

    try {
      await handler(pending.triggerEvent, pending.aggregatedEvents)
    } catch (err) {
      logger.error('MessageAggregator', `处理回复时出错`, { error: String(err), groupId })
    }
  }, cooldownMs)

  pendingReplies.set(groupId, {
    triggerEvent: event,
    aggregatedEvents: [],
    timer,
    cooldownMs,
    processing: false,
  })

  logger.info('MessageAggregator', `开始冷却`, {
    groupId,
    messageId: event.message_id,
    cooldownMs,
  })

  return true
}

/**
 * 检查指定群是否正在冷却中
 */
export function isGroupInCooldown(groupId: number): boolean {
  return pendingReplies.has(groupId)
}

/**
 * 获取指定群的待处理回复信息
 */
export function getPendingReply(groupId: number): PendingReply | undefined {
  return pendingReplies.get(groupId)
}

/**
 * 取消指定群的待处理回复
 */
export function cancelPendingReply(groupId: number): boolean {
  const pending = pendingReplies.get(groupId)
  if (pending) {
    clearTimeout(pending.timer)
    pendingReplies.delete(groupId)
    logger.info('MessageAggregator', `已取消待处理回复`, { groupId })
    return true
  }
  return false
}

/**
 * 清除所有待处理的回复（用于断开连接时）
 */
export function clearAllPendingReplies(): void {
  for (const [groupId, pending] of pendingReplies) {
    clearTimeout(pending.timer)
    logger.debug('MessageAggregator', `清除待处理回复`, { groupId })
  }
  pendingReplies.clear()
}

/**
 * 将消息事件添加到指定群的聚合列表（如果正在冷却中）
 * 用于处理不触发回复但需要被聚合的消息
 */
export function addToAggregation(event: GroupMessageEvent): boolean {
  const groupId = event.group_id
  const existing = pendingReplies.get(groupId)

  if (existing) {
    existing.aggregatedEvents.push(event)
    logger.debug('MessageAggregator', `消息已添加到聚合列表`, {
      groupId,
      messageId: event.message_id,
      aggregatedCount: existing.aggregatedEvents.length,
    })
    return true
  }

  return false
}
