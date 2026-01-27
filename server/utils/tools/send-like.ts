import { registerTool } from './index'

// 点赞工具定义
const sendLikeDefinition: ToolDefinition = {
  name: 'send_like',
  description: '给指定用户点赞（赞名片）。可以给群友点赞表示喜欢或感谢。每次最多点10个赞。',
  parameters: {
    type: 'object',
    properties: {
      user_id: {
        type: 'number',
        description: '要点赞的用户QQ号。可以从对话上下文中获取用户ID。',
      },
      times: {
        type: 'number',
        description: '点赞次数，1-10之间，默认为1',
      },
    },
    required: ['user_id'],
  },
}

// 点赞工具执行函数
async function executeSendLike(
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  const client = getClient()

  if (!client) {
    return {
      success: false,
      message: '机器人未连接，无法执行点赞操作',
    }
  }

  const userId = args.user_id as number
  let times = (args.times as number) || 1

  // 限制点赞次数在 1-10 之间
  times = Math.max(1, Math.min(10, times))

  if (!userId) {
    return {
      success: false,
      message: '缺少用户ID参数',
    }
  }

  try {
    await client.sendLike(String(userId), times)

    logger.info('Tools', `点赞成功`, {
      targetUserId: userId,
      times,
      operatorUserId: context.userId,
      groupId: context.groupId,
    })

    return {
      success: true,
      message: `已成功给用户 ${userId} 点了 ${times} 个赞`,
      data: { userId, times },
    }
  } catch (error) {
    logger.error('Tools', `点赞失败`, {
      targetUserId: userId,
      times,
      error: String(error),
    })

    return {
      success: false,
      message: `点赞失败: ${String(error)}`,
    }
  }
}

function register(): void {
  registerTool(sendLikeDefinition, executeSendLike)
}

register()
