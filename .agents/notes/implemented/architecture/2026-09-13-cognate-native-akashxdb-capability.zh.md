# Agent Note：Cognate 使用原生 Harness 循环和 AkashXDB 能力接口

Status: implemented

[English](2026-09-13-cognate-native-akashxdb-capability.md) | 中文

## 问题

Cognate 需要在 Harness 中执行结构化 AkashXDB 查询、文档检索、语义模型上下文和图表输出。第二个 Router、ReAct 循环、工具注册表或综合流程会重复 Harness 的生命周期、取消、审批、Session 日志和 Token 统计。AkashXDB 还会通过服务和 UDF 执行认知 SQL，因此 SQL 语法本身不能证明操作是只读的。

## 决策

Cognate 是附加的 Harness 能力。`@deepseek-ai/dsh-cognate` 提供 `ctx.cognate`、Provider 选择、SQL 分类、外部操作授权、结果限制和 Provider 提供的语义上下文。`@deepseek-ai/dsh-cognate-mysql` 提供直接 MySQL 协议执行，并在取消时销毁当前连接。`@deepseek-ai/dsh-cognate-local` 为离线开发和测试提供确定性的按标题划分 Markdown 检索，已发布的生产 preset 不挂载它。`@deepseek-ai/dsh-tool-cognate` 提供面向模型的 `run_sql`、确定性的 `render_chart` 和 Cognate 来源选择指引。

`cognate` Agent preset 复制 Standard 工具组合，并在 Agent 本地 realm 中添加 Cognate 服务、MySQL Provider 和工具。Bash、文件系统、Web、Skill、Session、Goal、Plan、Workflow、Subagent 和 MCP 仍是独立的 Harness 能力。

服务允许单条元数据或普通读取语句，限制 SQL、行数和序列化结果，并拒绝变更及管理语句。`ASK`、`PROMPT`、`cognitive_*` 和 `excel_ai_*` 属于外部操作，必须配置 `allowExternalOperations: true`。服务不暴露原始 MCP 写操作、凭据，也不回退到 Bash。

`render_chart` 使用已返回的表格数据，验证图表列和数值序列，限制点数，并且不依赖数据库 Provider。它不调用第二个图表选择模型，而是返回结构化展示元数据。

## Alternatives considered

**第二个 Cognate Agent 框架被放弃**，因为 Harness 已经负责模型循环、工具生命周期、取消、持久化事件、重放和 Token 统计。

**原始 AkashXDB MCP SQL Bridge 被放弃**，因为其读取路径不保证只读，写入路径暴露变更和管理操作。直接 Provider 将策略保留在 Harness 能力接口中。

**独立的图表选择模型被放弃**，因为可以从已有的有界查询结果中确定性地验证并生成图表元数据。

## 结果

原生 Agent 循环仍是唯一编排路径，并继续负责审批、取消、持久化工具事件、重放和 Token 统计。直接 MySQL 传输可用；测试通过显式 Executor 接口而不需要实时数据库；本地 Provider 保留离线 Markdown 检索路径。语义模型持久化和实时目录发现仍由部署通过 Provider 提供；Superset/SSE 兼容属于独立适配器。

## 必需验证

Cognate 软件包测试 SQL 分类和拒绝、Provider 取消和生命周期、行数及字节限制、语义上下文提示词组装、图表验证和真实 Loader 组合。仓库检查必须包括 TypeScript 编译、Cognate 聚焦测试、软件包及依赖检查、Cordis 配置验证、文档检查以及生成路径和目录的新鲜度检查。
