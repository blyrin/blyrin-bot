# Blyrin Bot

基于 Nuxt.js 的 QQ 群聊 AI 机器人，通过 NapLink SDK 连接 NapCat，使用 OpenAI 兼容 API 进行对话。

## 技术栈

- **框架**: Nuxt 4 + Vue 3
- **UI**: Nuxt UI + TailwindCSS 4
- **数据库**: SQLite
- **QQ 协议**: NapCat (WebSocket)
- **AI**: OpenAI 兼容 API

## 功能特性

- 群聊消息监听与智能回复
- 支持图片识别
- MCP (Model Context Protocol) 集成
- 用户记忆与上下文管理
- 消息聚合与智能回复决策
- Web 管理界面

## 安装

```bash
pnpm install
```

## 使用

```bash
# 开发模式
pnpm dev

# 构建生产版本
pnpm build

# 预览生产构建
pnpm preview
```

## 配置

首次运行时会自动生成配置，管理密码将输出到控制台。

通过 Web 界面配置:

- 机器人连接 (NapCat WebSocket 地址)
- AI 模型 (API 地址、密钥、模型名称)
- 提示词
- 工具管理
- 群设置

## 许可证

MIT
