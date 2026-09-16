# Agent Note: AkashX 启动器与隔离的 Harness home

Status: implemented

[English](2026-09-13-akashx-launcher-and-home.md) | 中文

## 问题

AkashX fork 需要独立的公开命令和用户数据目录，同时保留上游插件图，以便与已安装的 `akx` 版本进行并行比较。

## 决策

该 fork 通过 [`apps/cli/src/akashx.ts`](../../../../apps/cli/src/akashx.ts) 和 `apps/cli/package.json` 暴露 `akashx`；现有的 `akx` 入口继续用于比较。两个入口共用 profile 启动、解析器、组合包组装、关闭流程和插件管理代码。

`akashx` 入口设置 `AKX_CLI_NAME=akashx`，供应用帮助和进程诊断使用。当 `AKX_HOME` 未设置或为空时，它将这个内部 home 覆盖值设为 `~/.akashx`；显式的 `AKX_HOME` 仍然具有最高优先级。`akx` 入口继续使用普通的 `~/.akx` 默认值。

内部包名、组合包声明、profile 元数据键和 `AKX_*` 配置名保持不变。本次 fork 启动改动只引入公开可执行文件名和默认 home 两个专用标识。

本决策针对本 fork 特化了[单一 akx 应用启动器记录](2026-08-22-single-akx-application-launcher.zh.md)中的启动器名称和 home 事实，但不改变其由 profile 负责的组装与生命周期规则。

## 考虑过的替代方案

**随可执行文件一起重命名所有包名和配置标识。** 拒绝：继承的组合包图和 profile 元数据需要在加入 AkashX 专用能力之前完成大范围协调迁移。

**从 fork 中移除 `akx`。** 拒绝：已安装的 `akx` 版本是比较基线；保留 fork 中相同的入口，可以直接比较行为而不修改已安装的包。

**增加第二套 home 路径实现和新的环境变量族。** 拒绝：启动器已经接受显式 home 覆盖，因此在 AkashX 入口选择 `~/.akashx` 可以避免重复路径解析，并保留现有 profile 消费方。

## 后果

用户可以使用 `akashx` 运行 AkashX，默认状态保存在 `~/.akashx`；显式的 `AKX_HOME` 可以将它指向测试或部署专用 home。比较用的 `akx` 路径保留上游命令文本和 `~/.akx` 行为。帮助、诊断和面向模型的启动器引用会使用选定的入口名称，而继承组装中的内部 AKX 包和配置标识仍会出现。聚焦的源码、构建入口、profile dump 和应用入口检查覆盖两个启动路径。
