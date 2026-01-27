export function getUserMemory(groupId: number, userId: number): UserMemory | null {
  return getUserMemoryFromDb(groupId, userId)
}

export function saveUserMemory(memory: UserMemory): void {
  saveUserMemoryToDb(memory)
}

export function createUserMemory(
  groupId: number,
  userId: number,
  nickname: string,
): UserMemory {
  return {
    userId,
    groupId,
    nicknames: [nickname],  // 初始化时添加第一个昵称
    traits: [],
    preferences: [],
    topics: [],
    lastSeen: Date.now(),
    messageCount: 0,
  }
}

export function updateUserMemory(
  groupId: number,
  userId: number,
  updates: Partial<UserMemory>,
): UserMemory {
  let memory = getUserMemory(groupId, userId)

  if (!memory) {
    const firstNickname = updates.nicknames?.[0] ?? String(userId)
    memory = createUserMemory(groupId, userId, firstNickname)
  }

  const updated: UserMemory = {
    ...memory,
    ...updates,
    lastSeen: Date.now(),
  }

  saveUserMemory(updated)
  return updated
}

export function incrementMessageCount(
  groupId: number,
  userId: number,
  nickname: string,
): UserMemory {
  let memory = getUserMemory(groupId, userId)

  if (!memory) {
    memory = createUserMemory(groupId, userId, nickname)
  } else {
    // 检查昵称是否变化，如果变化则添加到历史记录
    if (memory.nicknames[0] !== nickname) {
      // 移除已存在的相同昵称（如果有）
      const filteredNicknames = memory.nicknames.filter(n => n !== nickname)
      // 将新昵称添加到最前面
      memory.nicknames = [nickname, ...filteredNicknames]
    }
  }

  memory.messageCount += 1
  memory.lastSeen = Date.now()

  saveUserMemory(memory)
  return memory
}

export async function analyzeAndUpdateUser(
  groupId: number,
  userId: number,
  messages: ChatMessage[],
): Promise<UserMemory> {
  const memory = getUserMemory(groupId, userId)

  // 构建已有信息字符串
  const existingInfo = memory
    ? [
      memory.traits.length > 0 ? `特征: ${memory.traits.join(', ')}` : '',
      memory.preferences.length > 0 ? `偏好: ${memory.preferences.join(', ')}` : '',
      memory.topics.length > 0 ? `话题: ${memory.topics.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n')
    : ''

  // 从消息中提取新信息
  const newInfo = await extractUserInfo(messages, existingInfo, groupId)

  // 解析提取的信息（简单解析）
  const traits: string[] = []
  const preferences: string[] = []
  const topics: string[] = []

  const lines = newInfo.split('\n').filter(Boolean)
  for (const line of lines) {
    const trimmed = line.replace(/^[-•*]\s*/, '').trim()
    if (trimmed.includes('特征') || trimmed.includes('性格')) {
      traits.push(trimmed)
    } else if (trimmed.includes('偏好') || trimmed.includes('喜欢')) {
      preferences.push(trimmed)
    } else if (trimmed.includes('话题') || trimmed.includes('聊')) {
      topics.push(trimmed)
    } else {
      traits.push(trimmed)
    }
  }

  return updateUserMemory(groupId, userId, {
    traits: traits.slice(0, 5),
    preferences: preferences.slice(0, 5),
    topics: topics.slice(0, 5),
  })
}

export function deleteUserMemory(groupId: number, userId: number): boolean {
  return deleteUserMemoryFromDb(groupId, userId)
}

export function listGroupUsers(groupId: number): number[] {
  return listGroupUserIds(groupId)
}

export function getUserMemoryContext(groupId: number, userId: number): string {
  const memory = getUserMemory(groupId, userId)

  if (!memory) {
    return ''
  }

  const parts: string[] = []

  if (memory.nicknames.length > 0) {
    const currentNickname = memory.nicknames[0]
    parts.push(`用户当前昵称: ${currentNickname}`)
    if (memory.nicknames.length > 1) {
      parts.push(`历史昵称: ${memory.nicknames.slice(1).join(', ')}`)
    }
  }

  if (memory.traits.length > 0) {
    parts.push(`用户特征: ${memory.traits.join('; ')}`)
  }

  if (memory.preferences.length > 0) {
    parts.push(`用户偏好: ${memory.preferences.join('; ')}`)
  }

  if (memory.topics.length > 0) {
    parts.push(`常聊话题: ${memory.topics.join('; ')}`)
  }

  return parts.join('\n')
}

// 获取用户当前昵称（用于构建 AI 消息时显示名称）
export function getUserNickname(groupId: number, userId: number) {
  const memory = getUserMemory(groupId, userId)
  if (memory && memory.nicknames.length > 0) {
    return memory.nicknames[0]
  }
  return null
}

// 获取多个用户的信息摘要（用于 system prompt）
export function getMultipleUsersContext(
  groupId: number,
  userIds: number[],
  highlightUserId?: number,
): string {
  const parts: string[] = []

  for (const userId of userIds) {
    const memory = getUserMemory(groupId, userId)
    if (!memory) continue

    const isHighlighted = userId === highlightUserId
    const userParts: string[] = []

    // 用户基本信息
    const currentNickname = memory.nicknames[0] || String(userId)
    userParts.push(`- ${currentNickname}(${userId})${isHighlighted ? ' [当前对话者]' : ''}`)

    if (memory.nicknames.length > 1) {
      userParts.push(`  历史昵称: ${memory.nicknames.slice(1).join(', ')}`)
    }

    if (memory.traits.length > 0) {
      userParts.push(`  特征: ${memory.traits.join('; ')}`)
    }

    if (memory.preferences.length > 0) {
      userParts.push(`  偏好: ${memory.preferences.join('; ')}`)
    }

    if (memory.topics.length > 0) {
      userParts.push(`  常聊话题: ${memory.topics.join('; ')}`)
    }

    parts.push(userParts.join('\n'))
  }

  return parts.join('\n')
}

// 构建用户名称映射（userId -> nickname）
export function buildUserNameMap(groupId: number, userIds: number[]): Map<number, string> {
  const map = new Map<number, string>()

  for (const userId of userIds) {
    const nickname = getUserNickname(groupId, userId)
    if (nickname) {
      map.set(userId, nickname)
    }
  }

  return map
}

// 导入用户记忆
export function importUserMemory(memory: UserMemory): void {
  const normalizedMemory: UserMemory = {
    ...memory,
    lastSeen: memory.lastSeen ?? Date.now(),
    messageCount: memory.messageCount ?? 0,
  }
  saveUserMemory(normalizedMemory)
}

// 获取群组所有用户记忆
export function getAllGroupUserMemories(groupId: number): UserMemory[] {
  return getAllGroupUserMemoriesFromDb(groupId)
}
