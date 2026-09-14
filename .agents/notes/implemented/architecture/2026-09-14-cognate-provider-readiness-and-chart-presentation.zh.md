# Agent Note：Cognate Provider 就绪状态和图表展示

Status: implemented

English | [中文](2026-09-14-cognate-provider-readiness-and-chart-presentation.md)

## Problem

Cognate 模式宣传了一些没有配置后端的 AkashXDB 能力。MySQL Provider 只会报告笼统的"已配置的 Cognate Provider 不可用"，读者无法判断是 Provider 缺失、配置错误，还是数据库不可达。`render_chart` 自称消费"已经由 `run_sql` 返回的数据"，这让一个确定性的展示工具在没有配置数据库 Provider 时变得不可达。图表工具返回了结构化展示元数据，但没有任何客户端渲染它，因此视觉上什么都不会出现。

## Decision

Cognate 工具提示会报告所选 Provider 是否可用。Provider 在有信息可提供时给出可操作的不可用原因——MySQL Provider 会指出缺少 `AKASHXDB_URL` 设置——运行时会把这个原因包含在失败执行结果中，而不是笼统的不可用诊断。

`render_chart` 接受明确提供的、有界行数据，并且从不执行 SQL，因此这个确定性的图表能力不需要任何数据库 Provider 即可使用。

Web Tool card 会把图表 Tool 调用的持久化展示元数据渲染为原生 SVG 图表。因此图表展示既不依赖数据库 Provider，也不依赖第三方浏览器图表包。

## Alternatives considered

**放弃第三方浏览器图表库。** 原生 SVG 渲染器已能覆盖工具产生的持久化展示元数据，而引入浏览器依赖会为工具自身契约并不要求的能力增大客户端包体积。

**放弃要求先执行 `run_sql` 再执行 `render_chart`。** 把一个确定性展示工具耦合到已配置的数据库，会让它在那些仍能渲染所提供行数据的部署中恰好不可达。

**放弃把缺少渲染器记录为已知限制。** 该工具已经持久化了完整的展示元数据，可见的缺口是缺少消费者，而不是能力缺失。

## Consequences

Provider 就绪状态对模型可见，因此模型可以解释数据库未配置，而不是展示它无法执行的能力。`render_chart` 可以独立于任何 Provider 使用。图表卡片自己拥有 SVG 布局和样式，因此它像其他 Tool card 一样继承主题 Token，并且不增加浏览器运行时依赖。真实 AkashXDB 执行仍然需要可访问的部署、凭据和 `AKASHXDB_URL`。

## Testing

聚焦的 Provider、工具和客户端测试覆盖了可操作的不可用诊断、不执行 SQL 的图表接受路径，以及 SVG 图表卡片渲染。无 Key 的 Web replay 套件覆盖组装后的客户端。
