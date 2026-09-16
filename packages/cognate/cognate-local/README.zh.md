---
description: "面向 Cognate 开发和测试的离线 Markdown Provider。"
kind: "package-reference"
---

# @akashx/akx-cognate-local

[English](README.md) | 中文

## 概述

`akx-cognate-local` 在不增加第二个 Agent、工具注册表或编排循环的前提下保留离线 Cognate 知识检索。它加载按标题划分的 Markdown 段落，并通过现有 `run_sql` 路径回答单条本地 `ASK` 语句，返回有界行和引用。已发布的 `cognate` preset 不挂载此 Provider；生产检索仍使用 AkashXDB。

## 目录

- [使用本包](#use-this-package)
- [进一步阅读](#further-exploration)
- [实现说明](#implementation-notes)
- [Model Experience](#model-experience)
- [已知限制](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## 使用本包

将 `knowledgeDir` 配置为 Markdown 语料目录，并将 Cognate 服务的 Provider 设置为 `local-markdown`。Provider 接受 `ASK '问题' ON <bucket>`，返回排序后的段落；它拒绝普通 SQL，并且不会替代生产 MySQL Provider。

<a id="further-exploration"></a>
## 进一步阅读

参见 [Cognate 子系统参考](../../../docs/subsystems/cognate.zh.md) 和 [原生 Cognate Provider](../cognate-mysql/README.zh.md)。

<a id="implementation-notes"></a>
## 实现说明

不发布运行时 invariant companion，因为 Provider 不拥有共享注册表或持久关系，只有自身的 Provider 注册 effect。

<a id="model-experience"></a>
## Model Experience

### 离线检索

#### What the model sees

模型通过 `run_sql` 看到有界 Markdown 段落、文档路径、标题引用、相关性分数和由匹配段落组成的答案。

#### Token effect

结果 Token 数量随配置的结果数量和 4,000 字符段落上限增长。Provider 除有界 RagBucket 元数据外不会增加模型提示词上下文。

#### KV Cache effect

Provider 不改变工具或提示词前缀。改变本地语料只会改变结果 Token。

## 已知限制
<a id="known-limitations-and-deferred-work"></a>

- 检索使用确定性的词项重叠而不是 Embedding；生产质量检索必须使用部署原生的 AkashXDB。
- Provider 只支持 `ASK`，不执行结构化 SQL、Ontology 提取或 concept-tree UDF。

### 开发备注
<a id="dev-note"></a>

本包用于离线开发和测试，并且有意不出现在已发布的生产 preset 中。
