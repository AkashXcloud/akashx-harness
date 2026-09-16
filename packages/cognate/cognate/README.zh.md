---
description: "供 Cognate Agent 使用的 AkashXDB Provider 服务定义。"
kind: "package-reference"
---

# @akashx/akx-cognate

[English](README.md) | 中文

## 概述

`akx-cognate` 提供 `ctx.cognate`。它在执行前分类并授权单条 SQL，限制 SQL 长度、行数和序列化结果，并且只暴露 Provider 提供的语义元数据。服务本身不执行 SQL，也不暴露凭据。

## 目录

- [使用](#use-this-package)
- [进一步阅读](#further-exploration)
- [实现说明](#implementation-notes)
- [Model Experience](#model-experience)
- [已知限制](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## 使用

将服务与一个 Provider 和一个模型工具 Consumer 一起挂载。`registerProvider()` 返回清理函数。启用 `ASK`、`PROMPT`、`cognitive_*` 或 `excel_ai_*` 前，必须显式配置 `allowExternalOperations`。

<a id="further-exploration"></a>
## 进一步阅读

参见 [Cognate 子系统参考](../../../docs/subsystems/cognate.zh.md)。

<a id="implementation-notes"></a>
## 实现说明

不发布运行时 invariant companion，因为 Provider 注册和策略观察由本服务负责，并由 Provider 与工具组合测试覆盖。

<a id="model-experience"></a>
## Model Experience

### Provider 策略

#### What the model sees

模型通过 `run_sql` 结果看到策略：获准的元数据和读取语句返回标准化数据；变更、堆叠、未知函数和禁用外部操作请求返回明确错误。

#### Token effect

策略诊断只在调用失败时产生。成功结果的 Token 数量随有界的行、列、引用和可选答案增长。

#### KV Cache effect

策略不会改变提示词前缀。稳定的工具定义和语义上下文保留请求前缀复用。

## 已知限制
<a id="known-limitations-and-deferred-work"></a>

- Provider 选择在进程内完成，必须存在一个可用 Provider，或配置明确的 Provider ID。
- 语义上下文由 Provider 提供；服务不会自行发现实时目录。

### 开发备注
<a id="dev-note"></a>

除部署负责的目录发现和未来 Provider 适配器外，本包没有待维护者决定的开放事项。
