---
description: "Cognate 能力使用的直接 MySQL 协议 AkashXDB Provider。"
kind: "package-reference"
---

# @akashx/akx-cognate-mysql

[English](README.md) | 中文

## 概述

`akx-cognate-mysql` 将 `MysqlCognateProvider` 注册到 `ctx.cognate`。它直接连接 AkashXDB/StarRocks MySQL 端点，将驱动值转换为无损 JSON，并在调用信号取消时销毁当前连接。上下文和结果中不会返回 URL 凭据。

## 目录

- [使用](#use-this-package)
- [进一步阅读](#further-exploration)
- [实现说明](#implementation-notes)
- [Model Experience](#model-experience)
- [已知限制](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## 使用

将 Provider 与 Cognate 服务一起挂载。

## 配置

使用 `mysql://` 或 `mariadb://` 的 `url`，或者提供 `host`、`port`、`user`、`password` 和 `database`。`semanticContext` 向 Cognate 提示词 Consumer 提供有界的表、Ontology View、RagBucket、指标、方言和指令元数据。`queryTimeoutMs` 是 Provider 的后备超时；Harness 工具策略仍是外层工具期限。

<a id="further-exploration"></a>
## 进一步阅读

参见 [Cognate 子系统参考](../../../docs/subsystems/cognate.zh.md)。

<a id="implementation-notes"></a>
## 实现说明

不发布运行时 invariant companion，因为连接生命周期和标准化结果由 Provider 测试直接观察，包内没有需要单独暴露的关系。

<a id="model-experience"></a>
## Model Experience

### 查询结果

#### What the model sees

模型通过 `run_sql` 看到有界 JSON 行、列名、可选答案、引用和外部操作标记。模型不会看到数据库凭据或连接选项。

#### Token effect

结果 Token 数量随有界的返回行和元数据增长。Provider 配置不会增加提示词 Token。

#### KV Cache effect

Provider 执行不会改变提示词前缀。复用相同语义上下文和工具定义可以保留请求前缀复用。

## 已知限制
<a id="known-limitations-and-deferred-work"></a>

- Provider 使用 MySQL 协议，不包含 Arrow Flight 或 Superset/SSE 适配器。
- 元数据发现和语义模型持久化由部署通过 `semanticContext` 提供。

### 开发备注
<a id="dev-note"></a>

除部署负责的元数据和未来传输适配器外，本 Provider 没有待维护者决定的开放事项。
