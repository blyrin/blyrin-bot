import { registerTool } from './index'

// Exa 搜索工具定义
const exaSearchDefinition: ToolDefinition = {
  name: 'exa_search',
  description: '使用 Exa 搜索引擎搜索网络信息。可以搜索最新的新闻、文章、技术文档等内容。',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '搜索查询内容',
      },
      num_results: {
        type: 'number',
        description: '返回结果数量，默认为 5，最大 10',
      },
      type: {
        type: 'string',
        description: '搜索类型：keyword（关键词搜索）或 neural（语义搜索），默认为 neural',
        enum: ['keyword', 'neural'],
      },
    },
    required: ['query'],
  },
}

interface ExaSearchResult {
  title: string
  url: string
  text?: string
  publishedDate?: string
  author?: string
}

interface ExaSearchResponse {
  results: ExaSearchResult[]
}

// Exa 搜索工具执行函数
async function executeExaSearch(
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  const toolsConfig = getToolsConfig()
  const exaConfig = toolsConfig.exa

  if (!exaConfig?.baseUrl || !exaConfig?.apiKey) {
    return {
      success: false,
      message: 'Exa 搜索未配置，请在 AI 设置中配置 Exa API 地址和密钥',
    }
  }

  const query = args.query as string
  let numResults = (args.num_results as number) || 5
  const searchType = (args.type as string) || 'neural'

  // 限制结果数量
  numResults = Math.max(1, Math.min(10, numResults))

  if (!query) {
    return {
      success: false,
      message: '缺少搜索查询参数',
    }
  }

  try {
    const response = await fetch(`${exaConfig.baseUrl}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': exaConfig.apiKey,
      },
      body: JSON.stringify({
        query,
        numResults,
        type: searchType,
        contents: {
          text: true,
        },
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Exa API 错误: ${response.status} ${errorText}`)
    }

    const data: ExaSearchResponse = await response.json()

    logger.info('Tools', `Exa 搜索成功`, {
      query,
      numResults: data.results.length,
      userId: context.userId,
      groupId: context.groupId,
    })

    // 格式化搜索结果
    const formattedResults = data.results.map((result, index) => {
      let text = `${index + 1}. ${result.title}\n   链接: ${result.url}`
      if (result.publishedDate) {
        text += `\n   发布时间: ${result.publishedDate}`
      }
      if (result.text) {
        // 截取摘要，最多 200 字符
        const summary = result.text.length > 200
          ? result.text.substring(0, 200) + '...'
          : result.text
        text += `\n   摘要: ${summary}`
      }
      return text
    }).join('\n\n')

    return {
      success: true,
      message: `搜索 "${query}" 找到 ${data.results.length} 条结果:\n\n${formattedResults}`,
      data: data.results,
    }
  } catch (error) {
    logger.error('Tools', `Exa 搜索失败`, {
      query,
      error: String(error),
    })

    return {
      success: false,
      message: `搜索失败: ${String(error)}`,
    }
  }
}

function register(): void {
  registerTool(exaSearchDefinition, executeExaSearch)
}

register()
