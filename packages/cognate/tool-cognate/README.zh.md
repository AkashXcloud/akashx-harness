---
description: "面向模型的 Cognate SQL 和确定性图表工具。"
kind: "package-reference"
---

# @akashx/akx-tool-cognate

[English](README.md) | 中文

## 概述

`akx-tool-cognate` 注册 `run_sql` 和 `render_chart`。`run_sql` 将单条语句发送到 `ctx.cognate`；服务负责 SQL 策略、取消、Provider 选择和结果限制。`render_chart` 只验证显式传入的表格数据，不打开数据库连接。

## 目录

- [使用](#use-this-package)
- [进一步阅读](#further-exploration)
- [实现说明](#implementation-notes)
- [Model Experience](#model-experience)
- [已知限制](#known-limitations-and-deferred-work)

## 配置与模型体验

<a id="use-this-package"></a>
## 使用

`contextMaxChars` 限制动态语义上下文，`maxChartPoints` 限制图表行数。模型可使用一个必填 SQL 字符串调用 `run_sql`，并使用图表类型、标签列、数值列和已有行调用 `render_chart`。查询结果包含列、行、截断标记、操作分类、答案和引用；图表输出由已验证输入确定性生成。

<a id="further-exploration"></a>
## 进一步阅读

参见 [Cognate 子系统参考](../../../docs/subsystems/cognate.zh.md)。

<a id="implementation-notes"></a>
## 实现说明

不发布运行时 invariant companion，因为工具注册和模型可见结果由组合与工具测试覆盖，适配器不拥有独立的事件或状态关系。

<a id="model-experience"></a>
## Model Experience

### 工具 Schema 和结果

#### What the model sees

生成的 [`run_sql` 和 `render_chart` Schema](../../../docs/tool-catalog.zh.md#akashxakx-tool-cognate) 提供 SQL 参数或图表元数据和数据行。`render_chart` 不能执行查询或访问 Provider。

#### Token effect

工具 Schema Token 在每次请求中重复。结果 Token 数量随有界行、引用和传给模型的图表点增长。

#### KV Cache effect

稳定的工具定义和语义上下文保留请求前缀复用。工具配置或上下文限制变化会改变提示词前缀。

## 已知限制
<a id="known-limitations-and-deferred-work"></a>

- 图表以结构化展示元数据返回，并由 Web Tool 卡片使用原生 SVG 渲染。
- 工具不提供独立的知识搜索 schema；生产文档检索使用已配置 Provider 提供的 AkashXDB 操作。

### 开发备注
<a id="dev-note"></a>

除 Provider 提供的知识操作外，本包没有待维护者决定的开放事项。
