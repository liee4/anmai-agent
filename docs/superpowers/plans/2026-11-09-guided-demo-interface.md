# 安脉单线引导演示界面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 将已确认的单线草图接到真实模拟 API，使评委能看懂和操作完整流程。

**Architecture:** 保留 Fastify 状态机、SQLite 与现有 React 组件。后端补充最近基线对比并保证各轮模拟数据不同；前端以 dashboard 状态为真相来源，按草图重组为情景选择、基线栏、步骤条、主操作区、状态说明和高级详情。

**Tech Stack:** React 19、TypeScript 6、Vite 8、Fastify、SQLite、Vitest、Playwright。

**Spec:** `docs/superpowers/specs/2026-11-09-guided-demo-interface-design.md`

## Global Constraints

- 所有亲属通知和呼救均为模拟；模型结果不得直接触发呼救。
- 基线发布、暂停、恢复、事件升级以现有后端结果为准；不能在前端假增版本或跳过状态。
- 保留 JSON 自由输入、时间设置、事件卡、时间线和页面模型切换。
- 本地实现和验证完成后才同步 GitHub；Railway 不自动重新部署。

## Review Focus

- 重复导入/刷新页面：下一周期不得重复、上一版对比仍正确。
- 进行中的事件：情景切换不能静默覆盖事件；重置可清空并回到首轮。
- 模型观察/无回应：界面必须显示真实倒计时和下一步，而非立即跳阶段。
- 基线暂停：事件期间不能重新导入或恢复；事件结束后可恢复。
- 网络/模型失败：错误可见，页面仍可继续操作。

---

### Task 1: 多轮演示数据与基线对比

**Files:** `apps/api/src/features/simulator/demo-history.ts`, `apps/api/tests/http/demo-history.test.ts`, `apps/api/src/features/baseline/baseline-service.ts`, `apps/api/src/app.ts`, `apps/web/src/api/client.ts`

**Interfaces:** dashboard 增加 `baselineHistory: BaselineView[]`，最多当前与上一版；最新 14 天生成器保持现有响应格式。

- [x] 扩充失败测试：第 1 至第 6 轮的日期不重叠、体征统计不同；dashboard 在 v2 后返回 v2 与 v1，重置后为空。
- [x] 运行测试确认失败。
- [x] 修正模拟数据生成并添加近期基线只读视图。
- [x] 运行定向测试确认通过。

### Task 2: 引导页面与保留的详细功能

**Files:** `apps/web/src/app/App.tsx`, `apps/web/src/app/GuidedDemo.tsx`（新建）, `apps/web/src/app/BaselineStrip.tsx`（新建）, `apps/web/src/styles/app.css`, `apps/web/src/styles/details.css`, `apps/web/e2e/flow.spec.ts`

**Interfaces:** `App` 处理会话、轮询、输入与 API 动作；`GuidedDemo` 接收 `Dashboard` 和动作回调并呈现情景/步骤/主区/状态；`BaselineStrip` 接收两版基线与回调并呈现数据对比、权重和重置。

- [x] 更新浏览器测试定位和断言，覆盖首轮/下一轮/重置、七种情景和真实事件反馈；先观察失败。
- [x] 实现基线栏和引导主流程，保留 JSON、计时设置、事件卡、时间线及模型切换。
- [x] 按草图重写布局与响应式样式。
- [x] 运行浏览器测试及桌面/手机截图检查，修复实际问题。

### Task 3: 验证与本地交付

**Files:** 仅必要的修复与文档。

- [x] 运行 `pnpm verify`，确认测试、类型检查、构建、公开页面烟雾测试和浏览器流程通过。
- [x] 检查真实 API 结果与页面文案一致，不暴露 Key，不自动启动 Railway。
- [x] 提交本地变更，随后同步 GitHub 私有仓库；记录提交号和本地验证结果。
