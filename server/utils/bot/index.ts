import { NapLink } from '@naplink/naplink'
import type { SenderInfo } from './response-decider'
import { buildFullMessageContent, extractImageFiles, extractMessageMeta, shouldReply } from './response-decider'
import { isGroupInCooldown, scheduleReply } from './message-aggregator'
import {
  abortCurrentProcessing,
  clearAllQueues,
  enqueueMessage,
  finishProcessing,
  getCurrentProcessingUserId,
  isGroupProcessing,
  startProcessing,
} from './group-queue'

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

// 单例机器人实例
let client: NapLink | null = null
let selfId: number | null = null
let selfNickname: string | null = null

// 群信息缓存
interface GroupInfoCache {
  groupId: number
  groupName: string
  memberCount: number
  botRole: 'owner' | 'admin' | 'member'
}

const groupInfoCache = new Map<number, GroupInfoCache>()

// 自动重连相关
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectAttempt = 0
const RECONNECT_INTERVALS = [1000, 2000, 5000, 10000, 30000, 60000] // 重连间隔递增

// 连接锁，防止并发连接
let isConnecting = false
let connectPromise: Promise<void> | null = null

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function getReconnectDelay(): number {
  const index = Math.min(reconnectAttempt, RECONNECT_INTERVALS.length - 1)
  return RECONNECT_INTERVALS[index]!
}

function clearReconnectTimer(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

function scheduleReconnect(): void {
  clearReconnectTimer()
  const delayMs = getReconnectDelay()
  logger.info('Bot', `将在 ${delayMs / 1000} 秒后尝试重连 (第 ${reconnectAttempt + 1} 次)`)

  reconnectTimer = setTimeout(async () => {
    reconnectAttempt++
    try {
      await connectBot()
    } catch (err) {
      logger.error('Bot', '重连失败', { error: String(err) })
      scheduleReconnect()
    }
  }, delayMs)
}

function getRandomDelay(): number {
  const config = getBotConfig()
  const min = config.behavior.replyDelayMin
  const max = config.behavior.replyDelayMax
  return Math.floor(Math.random() * (max - min + 1)) + min
}

async function storeIncomingImages(
  groupId: number,
  messageId: number,
  userId: number,
  message: MessageSegment[],
): Promise<void> {
  if (!client) return
  const imageFiles = extractImageFiles(message)
  if (imageFiles.length === 0) return

  const imageSources: Array<{ url: string; imageIndex: number }> = []
  for (const [index, file] of imageFiles.entries()) {
    try {
      const imageInfo = await client.getImage(file)
      if (imageInfo.url) {
        imageSources.push({ url: imageInfo.url, imageIndex: index })
      }
    } catch (err) {
      logger.error('Bot', '获取图片URL失败', { error: String(err) })
    }
  }

  if (imageSources.length > 0) {
    await storeMessageImagesFromUrls(groupId, messageId, userId, imageSources)
  }
}

async function handleGroupMessage(event: GroupMessageEvent): Promise<void> {
  const groupId = event.group_id
  const userId = event.user_id
  const nickname = event.sender.card || event.sender.nickname

  // 检查白名单
  if (!isGroupWhitelisted(groupId)) {
    return
  }

  // 获取群组设置
  const groupSettings = getGroupSettings(groupId)
  if (!groupSettings.enabled) {
    return
  }

  // 更新用户消息计数
  const userMemory = incrementMessageCount(groupId, userId, nickname)

  logger.info('Bot', `收到群消息`, {
    groupId,
    userId,
    nickname,
    rawMessage: event.raw_message.slice(0, 100),
  })

  // 提取消息元数据（@ 和引用信息，保留所有信息包括 @bot）
  const messageMeta = extractMessageMeta(event.message, selfId!)

  // 构建发送者信息
  const senderInfo: SenderInfo = {
    userId: userId,
    nickname: nickname,
  }

  // 获取当前上下文中所有用户ID，用于构建名称映射
  const context = getContext(groupId)
  const contextUserIds = new Set<number>()
  for (const msg of context.messages) {
    if (msg.userId) {
      contextUserIds.add(msg.userId)
    }
    // 也收集消息中 @ 的用户
    if (msg.meta?.atUsers) {
      for (const atUserId of msg.meta.atUsers) {
        contextUserIds.add(atUserId)
      }
    }
  }
  // 添加当前消息的发送者和 @ 的用户
  contextUserIds.add(userId)
  if (messageMeta?.atUsers) {
    for (const atUserId of messageMeta.atUsers) {
      contextUserIds.add(atUserId)
    }
  }

  // 构建用户名称映射
  const userNameMap = buildUserNameMap(groupId, Array.from(contextUserIds))
  // 确保当前发送者的名称在映射中
  userNameMap.set(userId, nickname)

  // 构建包含元数据的完整消息内容（传入上下文用于关联引用）
  const fullContent = buildFullMessageContent(event.message, messageMeta, senderInfo, userNameMap, context.messages)

  // 无论是否回复，都将消息添加到上下文
  const userMessage: ChatMessage = {
    role: 'user',
    content: fullContent,
    messageId: event.message_id,
    userId: userId,
    timestamp: Date.now(),
    meta: messageMeta,
  }
  addMessage(groupId, userMessage)

  // 保存消息中的图片
  try {
    await storeIncomingImages(groupId, event.message_id, userId, event.message)
  } catch (error) {
    logger.error('Bot', '保存图片失败', { error: String(error), groupId, messageId: event.message_id })
  }

  // 每条消息后检查并压缩上下文
  await checkAndCompress(groupId)

  // 检查是否需要回复
  const decision = shouldReply(event, groupSettings, selfId!)

  // 如果该群正在冷却中，不管是否决定回复，消息已经添加到上下文了
  // 只需要记录日志
  if (isGroupInCooldown(groupId)) {
    if (decision.shouldReply) {
      logger.debug('Bot', `群正在冷却中，消息已聚合`, { groupId, reason: decision.reason })
    }
    return
  }

  if (!decision.shouldReply) {
    logger.debug('Bot', `决定不回复`, { groupId, reason: decision.reason })
    return
  }

  logger.info('Bot', `决定回复消息`, { groupId, userId, reason: decision.reason })

  // 检查群是否正在处理中
  if (isGroupProcessing(groupId)) {
    const currentUserId = getCurrentProcessingUserId(groupId)

    if (currentUserId === userId) {
      // 同一用户触发，打断当前处理
      logger.info('Bot', '同用户触发新对话，打断当前处理', { groupId, userId })
      abortCurrentProcessing(groupId)
      // 消息已添加到上下文，等待当前处理结束后会从上下文获取最新消息
    } else {
      // 不同用户，入队等待
      enqueueMessage(groupId, event)
      logger.info('Bot', '群正在处理中，消息已入队', { groupId, userId })
    }
    return
  }

  // 获取冷却时间配置
  const cooldownMs = groupSettings.aggregationCooldown ?? 3000

  if (cooldownMs > 0) {
    // 使用消息聚合机制
    scheduleReply(event, cooldownMs, processReply)
  } else {
    // 冷却时间为0，直接处理
    await processReply(event, [])
  }
}

// 实际处理回复的函数
async function processReply(triggerEvent: GroupMessageEvent, _aggregatedEvents: GroupMessageEvent[]): Promise<void> {
  const groupId = triggerEvent.group_id
  const userId = triggerEvent.user_id
  const nickname = triggerEvent.sender.card || triggerEvent.sender.nickname

  // 获取 AbortSignal 并标记开始处理
  const abortSignal = startProcessing(groupId, userId)

  try {
    // 获取上下文消息（包含冷却期间收集的所有消息）
    const contextMessages = getContextMessages(groupId)

    // 获取当前上下文中所有用户ID
    const context = getContext(groupId)
    const contextUserIds = new Set<number>()
    for (const msg of context.messages) {
      if (msg.userId) {
        contextUserIds.add(msg.userId)
      }
      if (msg.meta?.atUsers) {
        for (const atUserId of msg.meta.atUsers) {
          contextUserIds.add(atUserId)
        }
      }
    }
    contextUserIds.add(userId)

    // 获取上下文中所有群友的信息（重点突出触发消息的发送者）
    const allUsersContext = getMultipleUsersContext(groupId, Array.from(contextUserIds), userId)

    // 构建系统提示词
    let systemPrompt = buildSystemPrompt(groupId)

    // 添加机器人自身信息
    if (selfId) {
      const botName = selfNickname || '机器人'
      systemPrompt += `\n\n你的身份信息：${botName}(${selfId})`
    }

    // 添加当前群信息
    const groupInfo = groupInfoCache.get(groupId)
    if (groupInfo) {
      systemPrompt += `\n\n当前群信息：${groupInfo.groupName}(${groupId})，成员数：${groupInfo.memberCount}`
    }

    if (allUsersContext) {
      systemPrompt += `\n\n当前对话上下文中的群友信息：\n${allUsersContext}`
    }

    // 构建工具上下文（使用触发消息的信息）
    const toolContext: ToolContext = {
      groupId,
      userId,
      nickname,
      messageId: triggerEvent.message_id,
    }

    // 中间输出回调 - 工具调用期间发送 AI 的文本输出
    const onIntermediateOutput = async (content: string) => {
      if (abortSignal.aborted) return
      if (!content.trim() || !client) return

      await delay(getRandomDelay())
      await client.sendGroupMessage(String(groupId), [
        { type: 'text', data: { text: content.trim() } },
      ])
      // 中间输出已在 AI 模块中记录到 toolMessages，这里不重复添加
      logger.debug('Bot', '发送中间输出', { groupId, content: content.slice(0, 100) })
    }

    // 构建聊天选项
    const chatOptions: import('../ai').ChatOptions = {
      toolContext,
      onIntermediateOutput,
      abortSignal,
    }

    // 如果支持视觉功能，提取图片
    const aiConfig = getAIConfig()
    let result: import('../ai').ChatResult

    if (aiConfig.provider.supportsVision) {
      const imageUrls = getMessageImageDataUrls(groupId, triggerEvent.message_id)
      if (imageUrls.length > 0) {
        result = await chatWithVision(contextMessages, imageUrls, systemPrompt, groupId, chatOptions)
      } else {
        result = await chat(contextMessages, systemPrompt, groupId, chatOptions)
      }
    } else {
      result = await chat(contextMessages, systemPrompt, groupId, chatOptions)
    }

    // 检查是否被打断
    if (result.aborted || abortSignal.aborted) {
      logger.info('Bot', '处理被打断，跳过发送最终回复', { groupId, userId })
      return
    }

    // 保存工具调用历史到上下文
    if (result.toolMessages?.length) {
      for (const msg of result.toolMessages) {
        addMessage(groupId, msg)
      }
      logger.debug('Bot', '已保存工具调用历史', { groupId, count: result.toolMessages.length })
    }

    // 对响应内容进行 trim 处理
    const reply = result.content.trim()

    // 检查响应是否为空
    if (!reply) {
      logger.warn('Bot', 'AI 响应内容为空，跳过发送', { groupId, userId })
      return
    }

    // 回复前添加延迟
    await delay(getRandomDelay())

    // 发送回复（回复触发消息）
    if (client) {
      const replyMessage: MessageSegment[] = [
        { type: 'reply', data: { id: String(triggerEvent.message_id) } },
        { type: 'text', data: { text: reply } },
      ]
      const sendResult = await client.sendGroupMessage(String(groupId), replyMessage)

      logger.info('Bot', `发送回复成功`, {
        groupId,
        userId,
        replyLength: reply.length,
        replyPreview: reply.slice(0, 100),
      })

      // 将机器人回复添加到上下文
      const botMessage: ChatMessage = {
        role: 'assistant',
        content: reply,
        messageId: sendResult?.message_id,
        timestamp: Date.now(),
      }
      addMessage(groupId, botMessage)

      // 每 10 条消息分析一次用户特征
      const userMemory = getUserMemory(groupId, userId)
      if (userMemory && userMemory.messageCount % 10 === 0) {
        analyzeAndUpdateUser(groupId, userId, contextMessages.slice(-10)).catch(err => {
          logger.error('Bot', '更新用户记忆失败', { error: String(err) })
        })
      }
    }
  } catch (error) {
    // 如果是打断错误，不记录为错误
    if (error instanceof Error && error.message === '操作已被打断') {
      logger.info('Bot', '处理被打断', { groupId, userId })
      return
    }
    logger.error('Bot', '处理消息时出错', { error: String(error), groupId, userId })
  } finally {
    // 释放锁并处理队列中的下一条消息
    const nextMessage = finishProcessing(groupId)
    if (nextMessage) {
      // 使用 setImmediate 避免栈溢出
      setImmediate(() => {
        processReply(nextMessage.event, []).catch(err => {
          logger.error('Bot', '处理队列消息时出错', { error: String(err) })
        })
      })
    }
  }
}

export async function connectBot(): Promise<void> {
  // 如果正在连接中，返回现有的 Promise
  if (isConnecting && connectPromise) {
    logger.debug('Bot', '连接正在进行中，等待现有连接完成')
    return connectPromise
  }

  if (client) {
    logger.warn('Bot', '机器人已连接，跳过重复连接')
    return
  }

  isConnecting = true
  connectPromise = doConnect()

  try {
    await connectPromise
  } finally {
    isConnecting = false
    connectPromise = null
  }
}

async function doConnect(): Promise<void> {
  // 清除重连定时器
  clearReconnectTimer()

  const config = getBotConfig()
  logger.info('Bot', '正在连接到 NapCat', { url: config.connection.url })

  client = new NapLink({
    connection: {
      url: config.connection.url,
      token: config.connection.token || undefined,
    },
  })

  client.on('connect', async () => {
    logger.info('Bot', '已连接到 NapCat')
    reconnectAttempt = 0 // 连接成功，重置重连计数

    try {
      const loginInfo = await client!.getLoginInfo()
      selfId = loginInfo.user_id
      selfNickname = loginInfo.nickname || null

      const groups = await client!.getGroupList()

      logger.info('Bot', '登录成功', { selfId, selfNickname, groupCount: groups.length })

      // 缓存白名单群信息
      await refreshGroupInfoCache(groups)
    } catch (err) {
      logger.error('Bot', '获取登录信息失败', { error: String(err) })
    }
  })

  client.on('disconnect', () => {
    logger.warn('Bot', '已断开与 NapCat 的连接')
    client = null

    // 触发自动重连
    scheduleReconnect()
  })

  client.on('message.group', (data) => {
    handleGroupMessage(data as unknown as GroupMessageEvent).catch(err => {
      logger.error('Bot', '消息处理器出错', { error: String(err) })
    })
  })

  await client.connect()
}

export function getClient(): NapLink | null {
  return client
}

export async function reconnectBot(): Promise<void> {
  logger.info('Bot', '手动触发重连')

  // 清除自动重连定时器
  clearReconnectTimer()

  // 如果已连接，先断开
  if (client) {
    try {
      client.removeAllListeners()
      client.disconnect()
    } catch (err) {
      logger.warn('Bot', '断开连接时出错', { error: String(err) })
    }
    client = null
  }

  // 重置重连计数
  reconnectAttempt = 0

  // 重新连接
  await connectBot()
}

export async function disconnectBot(): Promise<void> {
  logger.info('Bot', '正在断开连接...')

  // 清除自动重连定时器，防止自动重连
  clearReconnectTimer()

  // 清空所有群队列
  clearAllQueues()

  if (client) {
    try {
      client.removeAllListeners()
      client.disconnect()
      logger.info('Bot', '已断开连接')
    } catch (err) {
      logger.warn('Bot', '断开连接时出错', { error: String(err) })
    }
    client = null
  }

  selfId = null
  selfNickname = null
}

// 检查机器人是否为群管理员
export function isBotAdmin(groupId: number): boolean {
  const info = groupInfoCache.get(groupId)
  return info?.botRole === 'owner' || info?.botRole === 'admin'
}

// 刷新群信息缓存（只缓存白名单群）
interface GroupListItem {
  group_id: number
  group_name: string
  member_count: number
}

export async function refreshGroupInfoCache(groupList?: GroupListItem[]): Promise<void> {
  if (!client || !selfId) {
    logger.warn('Bot', '机器人未连接，无法刷新群信息缓存')
    return
  }

  // 如果没有传入群列表，则获取
  const groups = groupList ?? await client.getGroupList()
  const whitelist = getGroupsConfig().whitelist

  groupInfoCache.clear()

  for (const group of groups) {
    // 只缓存白名单中的群
    if (!whitelist.includes(group.group_id)) {
      continue
    }

    try {
      const memberInfo = await client.getGroupMemberInfo(
        String(group.group_id),
        String(selfId),
      )
      groupInfoCache.set(group.group_id, {
        groupId: group.group_id,
        groupName: group.group_name,
        memberCount: group.member_count,
        botRole: memberInfo.role as 'owner' | 'admin' | 'member',
      })
    } catch (err) {
      // 获取失败时使用默认值
      groupInfoCache.set(group.group_id, {
        groupId: group.group_id,
        groupName: group.group_name,
        memberCount: group.member_count,
        botRole: 'member',
      })
    }
  }

  logger.info('Bot', '群信息缓存完成', { groupCount: groupInfoCache.size })
}

// 获取机器人状态
export interface BotStatus {
  connected: boolean
  selfId: number | null
  selfNickname: string | null
  groupCount: number
  reconnectAttempt: number
}

export function getBotStatus(): BotStatus {
  return {
    connected: client !== null,
    selfId,
    selfNickname,
    groupCount: groupInfoCache.size,
    reconnectAttempt,
  }
}
