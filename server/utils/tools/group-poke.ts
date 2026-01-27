import { registerTool } from './index'

// 戳一戳工具定义
const groupPokeDefinition: ToolDefinition = {
  name: 'group_poke',
  description: '戳一戳群成员。可以用来打招呼、提醒某人，注意短时间内不要执行多次。',
  parameters: {
    type: 'object',
    properties: {
      user_id: {
        type: 'number',
        description: '要戳的用户QQ号。可以从对话上下文中获取用户ID。',
      },
    },
    required: ['user_id'],
  },
}

// 戳一戳工具执行函数
async function executeGroupPoke(
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  const client = getClient()

  if (!client) {
    return {
      success: false,
      message: '机器人未连接，无法执行戳一戳操作',
    }
  }

  const userId = args.user_id as number

  if (!userId) {
    return {
      success: false,
      message: '缺少用户ID参数',
    }
  }

  try {
    await client.sendGroupPoke(String(context.groupId), String(userId))

    logger.info('Tools', `戳一戳成功`, {
      targetUserId: userId,
      operatorUserId: context.userId,
      groupId: context.groupId,
    })

    return {
      success: true,
      message: `已成功戳了用户 ${userId}`,
      data: { userId, groupId: context.groupId },
    }
  } catch (error) {
    logger.error('Tools', `戳一戳失败`, {
      targetUserId: userId,
      groupId: context.groupId,
      error: String(error),
    })

    return {
      success: false,
      message: `戳一戳失败: ${String(error)}`,
    }
  }
}

function register(): void {
  registerTool(groupPokeDefinition, executeGroupPoke)
}

register()
