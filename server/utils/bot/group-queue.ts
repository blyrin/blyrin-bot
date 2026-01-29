// 群级消息队列管理模块
// 实现群级处理锁、消息排队和同用户打断机制

interface MessageSegment {
  type: string
  data: Record<string, unknown>
}

interface GroupMessageEvent {
  message_id: number
  group_id: number
  user_id: number
  message: MessageSegment[]
  sender: {
    user_id: number
    nickname: string
    card?: string
    role?: string
  }
}

interface QueuedMessage {
  event: GroupMessageEvent
  addedAt: number
}

interface GroupQueueState {
  processing: boolean
  currentUserId: number | null
  abortController: AbortController | null
  queue: QueuedMessage[]
}

// 每群最大队列长度
const MAX_QUEUE_SIZE = 10

// 群队列状态
const groupQueues = new Map<number, GroupQueueState>()

function getOrCreateState(groupId: number): GroupQueueState {
  let state = groupQueues.get(groupId)
  if (!state) {
    state = {
      processing: false,
      currentUserId: null,
      abortController: null,
      queue: [],
    }
    groupQueues.set(groupId, state)
  }
  return state
}

// 检查群是否正在处理中
export function isGroupProcessing(groupId: number): boolean {
  const state = groupQueues.get(groupId)
  return state?.processing ?? false
}

// 获取当前正在处理的用户 ID
export function getCurrentProcessingUserId(groupId: number): number | null {
  const state = groupQueues.get(groupId)
  return state?.currentUserId ?? null
}

// 将消息加入队列
export function enqueueMessage(groupId: number, event: GroupMessageEvent): void {
  const state = getOrCreateState(groupId)

  // 队列已满时丢弃最旧的消息
  if (state.queue.length >= MAX_QUEUE_SIZE) {
    const dropped = state.queue.shift()
    logger.warn('GroupQueue', '队列已满，丢弃最旧消息', {
      groupId,
      droppedUserId: dropped?.event.user_id,
    })
  }

  state.queue.push({
    event,
    addedAt: Date.now(),
  })

  logger.debug('GroupQueue', '消息已入队', {
    groupId,
    userId: event.user_id,
    queueLength: state.queue.length,
  })
}

// 开始处理，返回 AbortSignal
export function startProcessing(groupId: number, userId: number): AbortSignal {
  const state = getOrCreateState(groupId)

  state.processing = true
  state.currentUserId = userId
  state.abortController = new AbortController()

  logger.debug('GroupQueue', '开始处理', { groupId, userId })

  return state.abortController.signal
}

// 打断当前处理
export function abortCurrentProcessing(groupId: number): void {
  const state = groupQueues.get(groupId)
  if (!state || !state.processing) return

  if (state.abortController) {
    state.abortController.abort()
    logger.info('GroupQueue', '已打断当前处理', {
      groupId,
      userId: state.currentUserId,
    })
  }
}

// 完成处理，返回下一条消息（如果有）
export function finishProcessing(groupId: number): QueuedMessage | null {
  const state = groupQueues.get(groupId)
  if (!state) return null

  state.processing = false
  state.currentUserId = null
  state.abortController = null

  // 取出队列中的下一条消息
  const next = state.queue.shift() ?? null

  if (next) {
    logger.debug('GroupQueue', '取出队列消息', {
      groupId,
      userId: next.event.user_id,
      remainingQueue: state.queue.length,
    })
  }

  return next
}

// 清空群队列
export function clearGroupQueue(groupId: number): void {
  const state = groupQueues.get(groupId)
  if (!state) return

  // 打断当前处理
  if (state.abortController) {
    state.abortController.abort()
  }

  state.processing = false
  state.currentUserId = null
  state.abortController = null
  state.queue = []

  logger.debug('GroupQueue', '已清空群队列', { groupId })
}

// 清空所有队列（断开连接时调用）
export function clearAllQueues(): void {
  for (const [groupId, state] of groupQueues) {
    if (state.abortController) {
      state.abortController.abort()
    }
  }
  groupQueues.clear()
  logger.debug('GroupQueue', '已清空所有队列')
}

// 获取队列状态（用于调试/监控）
export function getQueueStatus(groupId: number): {
  processing: boolean
  currentUserId: number | null
  queueLength: number
} | null {
  const state = groupQueues.get(groupId)
  if (!state) return null

  return {
    processing: state.processing,
    currentUserId: state.currentUserId,
    queueLength: state.queue.length,
  }
}
