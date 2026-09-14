# Agent Note：AkashX Web 品牌、Database 设置和 Session 删除

Status: implemented

English | [中文](2026-09-14-akashx-web-dressing-database-and-session-deletion.md)

## Problem

AkashX Web 客户端需要统一的品牌外观、Cognate 语义模型能力的可见入口，以及完整的 Session 删除方式。浏览器不能自行假定数据库连接，删除 Session 也必须移除持久化历史，而不只是隐藏列表行。

## Decision

Web 主题通过现有 `ui-theme` Token 样式表，在浅色模式使用 AkashX 紫白别名，在深色模式使用深海军蓝别名。官方品牌插件渲染 AkashX 标记和名称，不增加第二套客户端组合机制。

`ui-settings-general` 注册 id 为 `database` 的 `settings.section` 项。该页面是只读状态视图：Host 持有的 Cognate 配置仍是权威来源，凭据不会进入浏览器状态，后端不可用时显示 `AKASHXDB_URL` 修复提示。页面不执行 SQL，也不声称语义资产已经可用。

Session 删除使用一个 Host Remote 命令。命令通过控制器保留的 `AgentHandle` 销毁活动 Agent，通过 `SessionPersistence.remove()` 移除 Session，解除它与所有 Workspace 的关联，并返回持久化成功结果。Agent 必须使用句柄自身的 `dispose()` 销毁：它会等待循环的反向销毁并关闭 Session 写入句柄；而销毁 Agent 的 context fiber 会提前返回并留下已注册的写入者。JSONL Provider 仍然在写入者活动时拒绝删除，移除完整 generation 目录并清理读取缓存。Client Session manager 投影删除结果；如果被删 Session 是当前项，它会清理持久化选择；Workspace 浏览器在调用命令前要求确认。

能力演示使用现有的原生 Harness 循环和无 Key 的 task/thread fixture，包括 Agent Team headless 场景和 Web replay 套件。不引入第二个 Router、演示框架或数据库客户端。

## Alternatives considered

**放弃单独的 AkashX 主题包。** 现有主题已经拥有全局别名和生命周期管理的样式，第二个主题包会重复 Token 所有权和加载顺序。

**放弃浏览器数据库连接。** Cognate Provider 和凭据属于 Host；浏览器连接会暴露部署细节并绕过 Provider 就绪诊断。

**放弃用隐藏列表行代替删除。** Archive 已经负责可逆隐藏。Session 删除必须移除持久化历史和 Workspace 成员关系，因此是一个需要确认的独立操作。

**放弃第二套 task 或 thread 运行时。** 现有 Harness 的 task admission、Session 日志、Agent Team 和 replay fixture 已经通过受支持的循环覆盖单个任务和委派工作。

## Consequences

AkashX 品牌通过共享语义别名表达，因此现有组件无需逐个写颜色字面量即可继承视觉处理。Database 页面可以准确报告部署不可用，但不提供配置编辑器。删除是永久操作，对已打开的 Session 和冷 Session 同样适用，并且会显示 Remote 错误而不是静默移除列表行。

## Testing

聚焦的客户端和持久化测试覆盖 Database 注册、Session 菜单派发、JSONL 文件删除和生成的 Remote 表面。`pnpm run test:gui`、`pnpm run build` 以及无 Key 的 Web replay 套件覆盖组装后的客户端和原生 task/thread 路径。真实 AkashXDB 执行仍依赖部署提供 `AKASHXDB_URL` 和可访问凭据。
