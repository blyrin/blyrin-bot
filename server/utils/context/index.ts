export function getContext(groupId: number): GroupContext {
  const context = getContextFromDb(groupId)
  if (context) {
    return context
  }

  return {
    groupId,
    messages: [],
    lastUpdated: Date.now(),
  }
}

export function saveContext(context: GroupContext): void {
  saveContextToDb(context)
}

export function addMessage(groupId: number, message: ChatMessage): GroupContext {
  const context = getContext(groupId)
  context.messages.push({
    ...message,
    timestamp: message.timestamp ?? Date.now(),
  })
  context.lastUpdated = Date.now()
  saveContext(context)
  return context
}

export function getMemory(groupId: number): GroupMemory | null {
  return getMemoryFromDb(groupId)
}

export function saveMemory(memory: GroupMemory): void {
  saveMemoryToDb(memory)
}

export async function checkAndCompress(groupId: number): Promise<boolean> {
  const config = getAIConfig()
  const context = getContext(groupId)

  if (context.messages.length < config.context.compressionThreshold) {
    return false
  }

  // 获取要压缩的消息（保留一些最近的消息）
  const keepCount = Math.floor(config.context.maxMessages / 3)
  const toCompress = context.messages.slice(0, -keepCount)
  const toKeep = context.messages.slice(-keepCount)

  if (toCompress.length === 0) {
    return false
  }

  // 备份当前状态用于回滚
  const backupContext = { ...context, messages: [...context.messages] }
  const existingMemory = getMemory(groupId)

  try {
    // 压缩旧消息
    const summary = await compressContext(toCompress, groupId)

    // 获取已有记忆并追加
    const newSummary = existingMemory
      ? `${existingMemory.summary}\n\n---\n\n${summary}`
      : summary

    // 保存新记忆
    saveMemory({
      groupId,
      summary: newSummary,
      lastCompressed: Date.now(),
    })

    // 仅保留最近消息更新上下文
    context.messages = toKeep
    context.lastUpdated = Date.now()
    saveContext(context)

    const removedMessageIds = toCompress
      .map(msg => msg.messageId)
      .filter((id): id is number => typeof id === 'number')
    if (removedMessageIds.length > 0) {
      try {
        deleteMessageImages(groupId, removedMessageIds)
      } catch (error) {
        logger.warn('Context', 'Failed to delete message images', {
          groupId,
          error: String(error),
        })
      }
    }

    logger.info('Context', '上下文压缩成功', {
      groupId,
      compressedCount: toCompress.length,
      keptCount: toKeep.length,
    })

    return true
  } catch (error) {
    // 压缩失败，回滚到备份状态
    logger.error('Context', '上下文压缩失败，回滚到备份状态', {
      groupId,
      error: String(error),
    })

    // 恢复上下文
    saveContext(backupContext)

    // 恢复记忆（如果有）
    if (existingMemory) {
      saveMemory(existingMemory)
    }

    return false
  }
}

export function clearContext(groupId: number): void {
  deleteContextFromDb(groupId)
  try {
    deleteGroupImages(groupId)
  } catch (error) {
    logger.warn('Context', 'Failed to delete group images', { groupId, error: String(error) })
  }
}

export function clearMemory(groupId: number): void {
  deleteMemoryFromDb(groupId)
}

export function listContexts(): number[] {
  return listContextGroupIds()
}

export function getContextMessages(groupId: number): ChatMessage[] {
  const context = getContext(groupId)
  const memory = getMemory(groupId)
  const config = getAIConfig()

  // 限制消息数量为 maxMessages
  const recentMessages = context.messages.slice(-config.context.maxMessages)

  // 如果有记忆，将其作为类似系统消息的上下文前置
  if (memory && memory.summary) {
    return [
      {
        role: 'system',
        content: `之前的对话摘要：\n${memory.summary}`,
        timestamp: memory.lastCompressed,
      },
      ...recentMessages,
    ]
  }

  return recentMessages
}

export function listMemories(): number[] {
  return listMemoryGroupIds()
}

export function importContext(groupId: number, context: GroupContext): void {
  const normalizedContext: GroupContext = {
    ...context,
    groupId,
    lastUpdated: context.lastUpdated ?? Date.now(),
  }
  saveContext(normalizedContext)
}

export function importMemory(groupId: number, memory: GroupMemory): void {
  const normalizedMemory: GroupMemory = {
    ...memory,
    groupId,
    lastCompressed: memory.lastCompressed ?? Date.now(),
  }
  saveMemory(normalizedMemory)
}
