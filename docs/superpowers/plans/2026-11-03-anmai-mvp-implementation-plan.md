# 安脉 Agent MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `anmai` 目录实现一个可本地运行、可重启恢复、可用模拟体征完整演示个人基线学习与异常应急响应的安脉 Agent MVP。

**Architecture:** 使用 pnpm workspace 管理 Web、API 和共享契约三个包。API 以确定性领域模块为核心，通过 SQLite Repository、模型 Provider、工具注册表和受约束 Agent Loop 组合流程；React 单页只调用公开 API，并通过 SSE 接收实时状态。DeepSeek 只生成基线候选和说明文本，安全阈值、异常判断、计时器及应急状态转换全部由代码控制。

**Tech Stack:** Node.js 24 LTS、pnpm 11、TypeScript、React 19、Vite 8、Fastify 5、TypeBox、Node 内置 `node:sqlite`、Vitest、Testing Library、Playwright、SSE、浏览器 Web Speech API、DeepSeek Responses/JSON API。

**Spec:** `../../../../outputs/安脉-Agent-设计方案.md`

## Global Constraints

- 所有产品代码必须位于 `anmai/`，不得修改 `outputs/安脉-Agent-设计方案.md`。
- 第一版只支持 JSON 输入；外部只有一个 `POST /api/ingest`，内部保留 daily 与 historical 两个 Adapter。
- 相同导入数据必须幂等；批量导入必须在单个 SQLite 事务中成功或回滚。
- 日总结、排除原因、观察基线、风险评分、状态转换和安全校验必须由确定性代码完成。
- DeepSeek Provider 不得读取 SQLite；只接收 `BaselineGenerationRequest`。
- 单次基线任务最多调用模型 5 次，首次生成计入次数；已通过字段立即锁定。
- 最新周期、近期基线和长期摘要的证据权重分别为 60%、30%、10%，缺失历史时按设计方案重新分配。
- 异常事件一旦创建，必须锁定本次配置、基线版本、固定阈值和绝对截止时间。
- 页面刷新或 API 重启后，日数据、基线、活跃事件和倒计时不得丢失。
- 所有医学阈值必须标记为比赛演示参数，不得描述为临床诊断标准。
- 第一版所有电话、短信和急救行为均为模拟，不连接真实服务。
- 不在普通界面提供模型 Provider 切换入口；通过后端环境变量选择。
- 代码优先可读性：文件保持单一职责，领域逻辑不得写入路由或 React 组件。
- 用户已授权建立独立私有仓库 `liee4/anmai`；本地 `anmai` 已初始化 Git。当前环境命令行推送遇到 Windows TLS 凭据错误，远端文件由已连接的 GitHub 接口提交，并逐项核验。

## Reference Code Style Applied

参考 `shareAI-lab/learn-claude-code/s14_mcp_plugin/code.py`，本项目采用以下风格：

- 入口文件只负责装配依赖和启动服务，核心流程能从一个短函数中顺序读懂。
- 工具的元数据、处理器和授权策略分离，通过显式注册表装配。
- Agent Loop 保持 `观察 → 决策 → 调用工具 → 写回结果 → 再观察` 的直线结构。
- 外部调用统一经过边界函数，集中处理超时、错误、日志和输出校验。
- 高风险工具在执行前经过代码策略检查，不能信任模型描述或模型自行决定权限。
- 使用清楚的章节注释和小函数；不复制参考项目的教学型单文件结构。
- 不使用宽泛 `catch` 静默吞错；错误转换成稳定的领域错误码并保存必要上下文。
- 不依赖全局可变对象；注册表、时钟、数据库和 Provider 都通过构造参数注入。

## Selected Technical Approach

采用“TypeScript workspace + 模块化单体”方案。

考虑过的其他方式：

- React + Express + 单个大后端文件：启动更快，但数据、状态机和模型重试会迅速耦合，不利于测试和替换 Provider。
- React + Python/FastAPI：适合未来训练时序模型，但当前设计已确定 Node.js，双语言会增加演示部署和共享 Schema 成本。
- 微服务：边界清楚但对本地比赛原型明显过重，倒计时一致性和部署复杂度也更高。

当前选择保留单进程和单 SQLite 的简单部署，同时用模块接口形成可替换边界。未来若引入 Python 时序模型，只需新增远程 Provider/Detector Adapter。

## Target File Structure

```text
anmai/
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
  vitest.workspace.ts
  .env.example
  README.md
  apps/
    api/
      package.json
      src/
        app.ts
        main.ts
        config.ts
        clock.ts
        http/
          error-handler.ts
          routes/
        infra/
          database.ts
          migrate.ts
          migrations/
          event-bus.ts
        features/
          ingestion/
          baseline/
          monitoring/
          emergency/
          agent/
          simulator/
      tests/
    web/
      package.json
      index.html
      src/
        main.tsx
        app/
        api/
        features/
        styles/
      tests/
  packages/
    contracts/
      package.json
      src/
        common.ts
        vitals.ts
        baseline.ts
        emergency.ts
        api.ts
        index.ts
  e2e/
  data/
    .gitkeep
  docs/
    superpowers/plans/
```

## Review Focus

- 导入包含乱序、重复、跨时区和无效时间戳的数据时，只保存合法唯一样本，并返回稳定计数；由 Task 3 的导入事务测试覆盖。
- 异常事件中同时出现佩戴者响应、亲属接管和到期回调时，只允许一个符合 `stateVersion` 的转换；由 Task 7 的并发测试覆盖。
- API 在倒计时过期后重启时立即执行下一次合法转换，而已接管事件不恢复计时器；由 Task 7 的恢复测试覆盖。
- DeepSeek 返回空白、非 Schema JSON、越界字段或修改已锁定字段时，五次预算不会超支，最终按字段回退；由 Task 5 的 Provider 合约测试覆盖。
- 佩戴者选择“我没事”后体征持续异常或进一步恶化时，系统继续监测并按指纹/复查/恶化规则升级；由 Task 6 和 Task 7 的组合测试覆盖。

---

### Task 1: Workspace Foundation and Shared Contracts

**Files:**

- Create: `anmai/package.json`
- Create: `anmai/pnpm-workspace.yaml`
- Create: `anmai/tsconfig.base.json`
- Create: `anmai/vitest.workspace.ts`
- Create: `anmai/.env.example`
- Create: `anmai/packages/contracts/package.json`
- Create: `anmai/packages/contracts/src/common.ts`
- Create: `anmai/packages/contracts/src/vitals.ts`
- Create: `anmai/packages/contracts/src/baseline.ts`
- Create: `anmai/packages/contracts/src/emergency.ts`
- Create: `anmai/packages/contracts/src/api.ts`
- Create: `anmai/packages/contracts/src/index.ts`
- Test: `anmai/packages/contracts/src/contracts.test.ts`

**Interfaces:**

- Produces: TypeBox schemas and matching static types for `VitalSample`, `IngestRequest`, `IngestResult`, `DailySummary`, `BaselineGenerationRequest`, `BaselineCandidate`, `RiskAssessment`, `EmergencyEvent`, `TimelineEntry`, `TimerSettings` and API error envelopes.
- Produces: stable string unions for metric, context, exclusion reason, risk level, event state, response kind and tool result status.

- [ ] **Step 1: Write failing contract tests**

Assert that valid single-day and multi-day payloads decode, malformed timestamps and impossible blood-pressure pairs fail, and unknown fields are rejected.

- [ ] **Step 2: Run the contract test and verify failure**

Run: `pnpm --dir anmai vitest run packages/contracts/src/contracts.test.ts`

Expected: FAIL because workspace and schemas do not exist.

- [ ] **Step 3: Create the workspace and exact shared contracts**

Use ESM packages, strict TypeScript, `noUncheckedIndexedAccess`, TypeBox schemas as the runtime source of truth, and package exports from `@anmai/contracts`.

- [ ] **Step 4: Add environment contract**

Define `PORT`, `DATABASE_PATH`, `BASELINE_PROVIDER`, `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL`, and four default timer values in `.env.example`; never include a real key.

- [ ] **Step 5: Verify contracts and type checking**

Run: `pnpm --dir anmai test && pnpm --dir anmai typecheck`

Expected: contract tests PASS and TypeScript reports zero errors.

- [ ] **Step 6: Record checkpoint**

Record `Task 1 PASS` and the two commands in the plan execution log.

### Task 2: SQLite Schema, Migrations, and Repository Boundaries

**Files:**

- Create: `anmai/apps/api/package.json`
- Create: `anmai/apps/api/src/config.ts`
- Create: `anmai/apps/api/src/clock.ts`
- Create: `anmai/apps/api/src/infra/database.ts`
- Create: `anmai/apps/api/src/infra/migrate.ts`
- Create: `anmai/apps/api/src/infra/migrations/001_initial.sql`
- Create: `anmai/apps/api/src/infra/repositories/*.ts`
- Test: `anmai/apps/api/tests/infra/database.test.ts`
- Test: `anmai/apps/api/tests/infra/repositories.test.ts`

**Interfaces:**

- Consumes: shared IDs, timestamps and domain DTOs from `@anmai/contracts`.
- Produces: `DatabaseContext.transaction<T>(work)`, `VitalRepository`, `DailySummaryRepository`, `BaselineRepository`, `EmergencyRepository`, `DeadlineRepository`, and `ModelAttemptRepository` interfaces.
- Produces: injected `Clock` with `now(): Date`, plus `SystemClock` and `FakeClock`.

- [ ] **Step 1: Write failing migration and transaction tests**

Assert foreign keys are enabled, migrations are repeatable, rollback removes all rows from a failed batch, and a file database can be closed and reopened with data intact.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `pnpm --dir anmai --filter @anmai/api test -- database.test.ts repositories.test.ts`

Expected: FAIL because database modules do not exist.

- [ ] **Step 3: Implement the database boundary**

Use Node 内置 `node:sqlite`, WAL mode, foreign keys, prepared statements and explicit transactions. Keep raw SQL inside repositories and migrations only.

- [ ] **Step 4: Create initial schema**

Create tables for import batches, minute vitals, daily summaries, baseline state, baseline versions, baseline attempts, anomaly events, event timeline, anomaly snippets and deadlines. Store structured snapshots as JSON text only when their internal fields are not queried.

- [ ] **Step 5: Implement repositories with optimistic event updates**

`EmergencyRepository.transition(eventId, expectedVersion, nextState, patch)` must update only when current `state_version` matches and return a typed conflict otherwise.

- [ ] **Step 6: Run persistence tests**

Run: `pnpm --dir anmai --filter @anmai/api test -- database.test.ts repositories.test.ts`

Expected: all tests PASS, including reopen and rollback cases.

- [ ] **Step 7: Record checkpoint**

Record `Task 2 PASS` and database schema version `001`.

### Task 3: Unified Ingestion, Internal Adapters, and Daily Summaries

**Files:**

- Create: `anmai/apps/api/src/features/ingestion/ingestion-service.ts`
- Create: `anmai/apps/api/src/features/ingestion/input-classifier.ts`
- Create: `anmai/apps/api/src/features/ingestion/daily-input-adapter.ts`
- Create: `anmai/apps/api/src/features/ingestion/historical-input-adapter.ts`
- Create: `anmai/apps/api/src/features/ingestion/normalizer.ts`
- Create: `anmai/apps/api/src/features/ingestion/daily-summary-builder.ts`
- Create: `anmai/apps/api/src/features/ingestion/cycle-builder.ts`
- Test: `anmai/apps/api/tests/features/ingestion/*.test.ts`

**Interfaces:**

- Consumes: `IngestRequest`, `VitalRepository`, `DailySummaryRepository`, `Clock` and baseline pause state.
- Produces: `IngestionService.ingest(request: IngestRequest): IngestResult`.
- Produces: `CycleBuilder.findCompletedEligibleCycles(wearerId): BaselineCycle[]`.

- [ ] **Step 1: Write classifier tests**

Assert one natural day routes to `daily`, two or more natural days route to `historical`, and the optional test override only accepts `daily` or `historical`.

- [ ] **Step 2: Write normalization and idempotency tests**

Cover timezone conversion,乱序, duplicates, invalid timestamps, missing metrics, device-untrusted data, activity-unknown data, and repeated upload of the same batch.

- [ ] **Step 3: Write daily eligibility tests**

Assert a valid day requires at least 8 covered hours, at least 80% quality, and at least 2 resting hours; excluded reasons must match the design’s fixed reason codes.

- [ ] **Step 4: Run ingestion tests and verify failure**

Run: `pnpm --dir anmai --filter @anmai/api test -- tests/features/ingestion`

Expected: FAIL because ingestion modules do not exist.

- [ ] **Step 5: Implement the common normalization pipeline**

Both Adapters must call the same normalize, deduplicate, aggregate, summarize and persist functions. Historical input only splits by date and replays dates chronologically.

- [ ] **Step 6: Implement transactional import result accounting**

Return detected mode, covered days, successful/invalid days, duplicates, excluded samples, complete cycles, model calls and resulting baseline version. A failure anywhere rolls back the complete batch.

- [ ] **Step 7: Implement non-overlapping cycle construction**

Build chronological 14-calendar-day windows, require at least 7 eligible days, skip invalid cycles with saved reasons, and preserve old data for the 12-month summary rules.

- [ ] **Step 8: Run ingestion and repository suites**

Run: `pnpm --dir anmai --filter @anmai/api test -- tests/features/ingestion tests/infra`

Expected: all tests PASS, including the Review Focus mixed-invalid batch.

- [ ] **Step 9: Record checkpoint**

Record `Task 3 PASS` and attach one daily plus one historical import result fixture.

### Task 4: Deterministic Observation Baseline and Memory Package

**Files:**

- Create: `anmai/apps/api/src/features/baseline/observation-baseline.ts`
- Create: `anmai/apps/api/src/features/baseline/memory-assembler.ts`
- Create: `anmai/apps/api/src/features/baseline/long-term-summary.ts`
- Create: `anmai/apps/api/src/features/baseline/baseline-types.ts`
- Test: `anmai/apps/api/tests/features/baseline/observation-baseline.test.ts`
- Test: `anmai/apps/api/tests/features/baseline/memory-assembler.test.ts`

**Interfaces:**

- Consumes: eligible `BaselineCycle`, recent baseline versions and deterministic 12-month summary facts.
- Produces: `buildObservationBaseline(cycle): ObservationBaseline` with median, P10, P90, MAD, trend and coverage by resting/activity/night context.
- Produces: `MemoryAssembler.assemble(wearerId, cycle): BaselineGenerationRequest`.

- [ ] **Step 1: Write statistical tests with fixed fixtures**

Assert exact median, percentile convention, MAD, minimum sample duration per context, trend direction and exclusion of every `baselineEligible: false` sample.

- [ ] **Step 2: Write memory-weight tests**

Assert 60/30/10 allocation, 16/8/4/2 recent-baseline decay for four versions, 90/10 without recent history, and 100% current cycle without any history.

- [ ] **Step 3: Run focused tests and verify failure**

Run: `pnpm --dir anmai --filter @anmai/api test -- observation-baseline.test.ts memory-assembler.test.ts`

Expected: FAIL because baseline builders do not exist.

- [ ] **Step 4: Implement pure statistical functions**

Keep these functions free of database and model calls. Apply evidence weights to the structured statistics in code, not merely as prompt prose.

- [ ] **Step 5: Implement rolling memory selection**

Load at most four recent full baselines; include only valid records from the last 12 months; expose evidence IDs that the Provider must reference.

- [ ] **Step 6: Run tests and deterministic replay**

Run: `pnpm --dir anmai --filter @anmai/api test -- tests/features/baseline`

Expected: all current baseline tests PASS and repeated runs produce byte-equivalent request fixtures.

- [ ] **Step 7: Record checkpoint**

Record `Task 4 PASS` with the hash of the canonical memory-package fixture.

### Task 5: Baseline Provider, Safety Validator, and Five-Attempt Loop

**Files:**

- Create: `anmai/apps/api/src/features/baseline/baseline-model-provider.ts`
- Create: `anmai/apps/api/src/features/baseline/deepseek-baseline-provider.ts`
- Create: `anmai/apps/api/src/features/baseline/fake-baseline-provider.ts`
- Create: `anmai/apps/api/src/features/baseline/baseline-safety-validator.ts`
- Create: `anmai/apps/api/src/features/baseline/baseline-generation-module.ts`
- Create: `anmai/apps/api/src/features/baseline/provider-registry.ts`
- Test: `anmai/apps/api/tests/features/baseline/provider-contract.test.ts`
- Test: `anmai/apps/api/tests/features/baseline/safety-validator.test.ts`
- Test: `anmai/apps/api/tests/features/baseline/generation-loop.test.ts`

**Interfaces:**

- Consumes: `BaselineGenerationRequest`, repositories and configured `BaselineModelProvider`.
- Produces: `BaselineModelProvider.generateCandidate(request, correction?): Promise<BaselineCandidate>`.
- Produces: `BaselineSafetyValidator.validate(candidate, context): ValidationResult` with accepted, rejected and locked fields.
- Produces: `BaselineGenerationModule.generateForCycle(cycleId): Promise<BaselineGenerationResult>`.

- [ ] **Step 1: Write Provider contract tests**

Run the same fixtures against Fake and DeepSeek response parsers. Cover valid JSON Schema output, blank content, malformed output, unknown evidence IDs, timeout and HTTP error mapping.

- [ ] **Step 2: Write validator tests**

Cover fixed safety boundaries, maximum version deltas, insufficient context evidence, excluded evidence, unchanged candidate, paused learning and independent validation of long-term summary text.

- [ ] **Step 3: Write five-attempt loop tests**

Assert exactly one initial call plus at most four correction calls; accepted fields stay locked; only rejected fields return to the Provider; fifth-failure fields use previous or default values.

- [ ] **Step 4: Run focused tests and verify failure**

Run: `pnpm --dir anmai --filter @anmai/api test -- provider-contract.test.ts safety-validator.test.ts generation-loop.test.ts`

Expected: FAIL because Provider and generation modules do not exist.

- [ ] **Step 5: Implement the Provider boundary and registry**

Select Provider from `BASELINE_PROVIDER`; expose only `deepseek` and `fake` initially. Do not pass repositories or database handles into a Provider.

- [ ] **Step 6: Implement DeepSeek adapter**

Use Node `fetch`, an abort timeout, non-thinking `deepseek-flash`, temperature 0 where supported, and structured JSON/JSON Schema output. Validate every response locally before returning it to the generation module.

- [ ] **Step 7: Implement deterministic safety validation**

Return field-level reasons and allowed ranges. Never let model prose override the fixed boundary configuration.

- [ ] **Step 8: Implement generation and publication loop**

Persist request, raw response, parsed candidate, validator result and correction feedback for every attempt. Publish only accepted/fallback fields and create no new version when effective values are unchanged.

- [ ] **Step 9: Run baseline suites without a real API key**

Run: `pnpm --dir anmai --filter @anmai/api test -- tests/features/baseline`

Expected: all tests PASS using Fake Provider and mocked fetch.

- [ ] **Step 10: Record checkpoint**

Record `Task 5 PASS`, maximum observed call count and the fallback fixture result.

### Task 6: Vital Quality Gate and Explainable Risk Detector

**Files:**

- Create: `anmai/apps/api/src/features/monitoring/detection-config.ts`
- Create: `anmai/apps/api/src/features/monitoring/quality-gate.ts`
- Create: `anmai/apps/api/src/features/monitoring/sliding-window.ts`
- Create: `anmai/apps/api/src/features/monitoring/deviation-score.ts`
- Create: `anmai/apps/api/src/features/monitoring/risk-detector.ts`
- Test: `anmai/apps/api/tests/features/monitoring/*.test.ts`

**Interfaces:**

- Consumes: recent samples, active baseline snapshot, activity context and fixed demo thresholds.
- Produces: `RiskDetector.evaluate(input: DetectionInput): RiskAssessment` with level, score, reasons, stable values, abnormal-second flags and trend.

- [ ] **Step 1: Write data-quality tests**

Cover missing/stale values, impossible BP pair, engineering range, implausible jump, frozen values and explicit loose-device status. Untrusted data must never become a health emergency.

- [ ] **Step 2: Write window and persistence tests**

Assert 10-second median, 24 abnormal seconds in the last 30 plus five consecutive ending seconds, and BP confirmation rules.

- [ ] **Step 3: Write deviation and worsening tests**

Assert `max(1.4826 × MAD, minimum scale)`, significant deviation at 3, no double-counting when fixed safety threshold hits, and exact worsening behavior.

- [ ] **Step 4: Run monitoring tests and verify failure**

Run: `pnpm --dir anmai --filter @anmai/api test -- tests/features/monitoring`

Expected: FAIL because detector modules do not exist.

- [ ] **Step 5: Implement pure quality, window and score functions**

Keep all thresholds in `detection-config.ts`, label them `demoOnly`, and return machine-readable reason codes plus display details.

- [ ] **Step 6: Implement deterministic detector orchestration**

Quality gate runs first. Fixed safety threshold produces `worsening`; otherwise combine personal soft threshold, deviation, duration, trend and activity state according to the approved design.

- [ ] **Step 7: Run scenario fixtures twice**

Run twice: `pnpm --dir anmai --filter @anmai/api test -- tests/features/monitoring`

Expected: all tests PASS and serialized assessments are identical across runs.

- [ ] **Step 8: Record checkpoint**

Record `Task 6 PASS` with normal, untrusted, abnormal and worsening fixture IDs.

### Task 7: Emergency State Machine, Idempotency, and Restartable Deadlines

**Files:**

- Create: `anmai/apps/api/src/features/emergency/state-machine.ts`
- Create: `anmai/apps/api/src/features/emergency/emergency-service.ts`
- Create: `anmai/apps/api/src/features/emergency/deadline-scheduler.ts`
- Create: `anmai/apps/api/src/features/emergency/transition-policy.ts`
- Create: `anmai/apps/api/src/features/emergency/event-card-builder.ts`
- Test: `anmai/apps/api/tests/features/emergency/state-machine.test.ts`
- Test: `anmai/apps/api/tests/features/emergency/concurrency.test.ts`
- Test: `anmai/apps/api/tests/features/emergency/restart.test.ts`

**Interfaces:**

- Consumes: risk assessments, wearer/relative commands, `Clock`, emergency/deadline repositories and frozen timer settings.
- Produces: `EmergencyService.handle(command): TransitionResult`.
- Produces: `DeadlineScheduler.restoreAndRunOverdue(): Promise<void>`.

- [ ] **Step 1: Write transition matrix tests**

Cover wearer alert, no response, unwell response, safe response, primary-relative contact, other-relative contact, takeover, decline, timeout, simulated call and close/reset.

- [ ] **Step 2: Write safe-response override tests**

After “我没事”, create the abnormal fingerprint, continue background detection, reset only after 60 normal seconds, recheck once after the configured interval, and contact primary immediately on clear worsening.

- [ ] **Step 3: Write optimistic concurrency tests**

Race two commands with the same `eventId/stateVersion`; assert only one updates the event and the loser receives the latest state without overwriting it.

- [ ] **Step 4: Write restart tests with FakeClock**

Assert future deadlines resume, overdue deadlines execute once, and taken-over/closed event deadlines remain cancelled after reopen.

- [ ] **Step 5: Run emergency tests and verify failure**

Run: `pnpm --dir anmai --filter @anmai/api test -- tests/features/emergency`

Expected: FAIL because emergency modules do not exist.

- [ ] **Step 6: Implement a pure transition reducer**

`reduceEmergencyState(current, command, context): TransitionDecision` returns next state, side-effect intents and timeline records without performing I/O.

- [ ] **Step 7: Implement transactional service and scheduler**

Persist state transition, version increment, deadlines and timeline in one transaction, then execute external simulation intents idempotently.

- [ ] **Step 8: Build the relative emergency card**

Include current vitals, recent trend, location, risk reasons, wearer response, baseline version and timeline; do not require Agent voice narration when a relative calls emergency services.

- [ ] **Step 9: Run emergency and database suites**

Run: `pnpm --dir anmai --filter @anmai/api test -- tests/features/emergency tests/infra`

Expected: all tests PASS, including the Review Focus races and restart cases.

- [ ] **Step 10: Record checkpoint**

Record `Task 7 PASS` with one persisted active-event snapshot before and after restart.

### Task 8: Constrained Agent Loop and Tool Registry

**Files:**

- Create: `anmai/apps/api/src/features/agent/tool.ts`
- Create: `anmai/apps/api/src/features/agent/tool-registry.ts`
- Create: `anmai/apps/api/src/features/agent/tool-policy.ts`
- Create: `anmai/apps/api/src/features/agent/anmai-agent.ts`
- Create: `anmai/apps/api/src/features/agent/tools/*.ts`
- Test: `anmai/apps/api/tests/features/agent/tool-registry.test.ts`
- Test: `anmai/apps/api/tests/features/agent/agent-loop.test.ts`

**Interfaces:**

- Consumes: ingestion, baseline, detector, emergency, simulator and timeline services through explicit tool handlers.
- Produces: `ToolRegistry.register(definition, handler, policy)` and `execute(name, input, context)`.
- Produces: `AnmaiAgent.handle(trigger: AgentTrigger): Promise<AgentRunResult>`.

- [ ] **Step 1: Write registry tests**

Reject duplicate names, unknown handlers, invalid schemas and unauthorized emergency tools. Verify definitions and handlers remain separate.

- [ ] **Step 2: Write loop tests**

Assert the observable sequence `observe → assess → decide → act → persist → observe` for a normal sample, an abnormal sample, wearer unwell, wearer safe then worsening, relative takeover and no relative response.

- [ ] **Step 3: Run agent tests and verify failure**

Run: `pnpm --dir anmai --filter @anmai/api test -- tests/features/agent`

Expected: FAIL because Agent modules do not exist.

- [ ] **Step 4: Implement typed tool definitions and handlers**

Initial tools: ingest vitals, evaluate risk, load baseline, create wearer alert, record wearer response, notify relatives, build emergency card, simulate emergency call, schedule/cancel deadline, generate baseline, append timeline and close event.

- [ ] **Step 5: Implement code-owned policy**

Only legal state-machine intents may call contact or simulated-call tools. DeepSeek-generated text is data passed to a permitted tool, never the authority to select the tool.

- [ ] **Step 6: Implement the short readable Agent Loop**

Keep `AnmaiAgent.handle` small and linear. Delegate domain calculations to services, collect each tool result, persist the next observation and stop on a closed/stable terminal condition or a bounded step limit.

- [ ] **Step 7: Run all core domain suites**

Run: `pnpm --dir anmai --filter @anmai/api test -- tests/features`

Expected: all tests PASS with no real network calls.

- [ ] **Step 8: Record checkpoint**

Record `Task 8 PASS` with the ordered tool-call trace for the full escalation fixture.

### Task 9: Simulator, Fastify API, and SSE Event Stream

**Files:**

- Create: `anmai/apps/api/src/features/simulator/scenarios.ts`
- Create: `anmai/apps/api/src/features/simulator/simulator-service.ts`
- Create: `anmai/apps/api/src/infra/event-bus.ts`
- Create: `anmai/apps/api/src/http/error-handler.ts`
- Create: `anmai/apps/api/src/http/routes/*.ts`
- Create: `anmai/apps/api/src/app.ts`
- Create: `anmai/apps/api/src/main.ts`
- Test: `anmai/apps/api/tests/http/api.test.ts`
- Test: `anmai/apps/api/tests/http/sse.test.ts`

**Interfaces:**

- Consumes: `AnmaiAgent` and all application services.
- Produces: `buildApp(dependencies): FastifyInstance` for injection tests.
- Produces: REST endpoints and `GET /api/events/stream` SSE snapshots.

- [ ] **Step 1: Write API schema tests with Fastify injection**

Cover health, ingest, dashboard snapshot, simulator scenario, wearer response, relative response, baseline generation, baseline resume, close/reset and timer settings.

- [ ] **Step 2: Write SSE reconnect tests**

Assert initial full snapshot, ordered event IDs, keepalive, client disconnect cleanup and reconnect using `Last-Event-ID`.

- [ ] **Step 3: Run HTTP tests and verify failure**

Run: `pnpm --dir anmai --filter @anmai/api test -- tests/http`

Expected: FAIL because API modules do not exist.

- [ ] **Step 4: Implement deterministic simulator scenarios**

Provide normal, activity, suspected abnormal, worsening and loose-device streams with seeded randomness and configurable playback speed.

- [ ] **Step 5: Implement thin validated routes**

Each route validates with shared TypeBox schemas, calls one application service, and serializes one contract response. No domain decisions in handlers.

- [ ] **Step 6: Implement event stream and snapshots**

Emit monitoring, baseline, event, deadline and timeline updates; reconnect always recovers current truth from repositories even if an old transient event was missed.

- [ ] **Step 7: Restore deadlines at startup**

`main.ts` loads config, opens/migrates SQLite, builds dependencies, restores deadlines, then starts listening. Shutdown stops simulator and schedulers before closing the database.

- [ ] **Step 8: Run API and core tests**

Run: `pnpm --dir anmai --filter @anmai/api test`

Expected: all API tests PASS and no open-handle warning remains.

- [ ] **Step 9: Record checkpoint**

Record `Task 9 PASS` with a sample health response and one SSE event sequence.

### Task 10: React Demonstration Interface

**Files:**

- Create: `anmai/apps/web/package.json`
- Create: `anmai/apps/web/index.html`
- Create: `anmai/apps/web/src/main.tsx`
- Create: `anmai/apps/web/src/app/App.tsx`
- Create: `anmai/apps/web/src/api/client.ts`
- Create: `anmai/apps/web/src/api/event-stream.ts`
- Create: `anmai/apps/web/src/features/ingestion/*`
- Create: `anmai/apps/web/src/features/monitoring/*`
- Create: `anmai/apps/web/src/features/terminals/*`
- Create: `anmai/apps/web/src/features/timeline/*`
- Create: `anmai/apps/web/src/features/baseline/*`
- Create: `anmai/apps/web/src/styles/*`
- Test: `anmai/apps/web/tests/*.test.tsx`

**Interfaces:**

- Consumes: public REST/SSE contracts only.
- Produces: one responsive page with unified ingest/baseline panel, monitoring area, wearer/relative terminals, and timeline/emergency simulator.

- [ ] **Step 1: Write component behavior tests**

Cover JSON import mode/result, scenario controls, risk explanation, wearer choices, relative takeover/decline, timer lock during event, baseline pause/resume and Provider read-only display.

- [ ] **Step 2: Run Web tests and verify failure**

Run: `pnpm --dir anmai --filter @anmai/web test`

Expected: FAIL because Web application does not exist.

- [ ] **Step 3: Implement API client and SSE store**

Decode responses with shared schemas, expose connection status, reconnect with backoff and replace local state from server snapshots.

- [ ] **Step 4: Implement the four approved page regions**

Use semantic HTML, keyboard-accessible controls, visible focus, tabular numerals and direct labels. Keep the layout functional at desktop demo width and usable on narrower screens.

- [ ] **Step 5: Apply restrained framed-sheet styling**

Use light blue-gray framing, white content areas, muted teal data emphasis, red only for active emergency and amber for waiting/quality issues. No gradients, persistent shadows or decorative effects.

- [ ] **Step 6: Add optional Web Speech output**

Speak only wearer warnings and simulated automatic emergency script. Provide visible text and a manual replay button when autoplay or speech is unavailable.

- [ ] **Step 7: Run Web tests and production build**

Run: `pnpm --dir anmai --filter @anmai/web test && pnpm --dir anmai --filter @anmai/web build`

Expected: tests PASS and Vite build completes without warnings treated as errors.

- [ ] **Step 8: Record checkpoint**

Record `Task 10 PASS` with desktop and narrow-screen screenshots.

### Task 11: End-to-End Demo, Restart Verification, and Operator Documentation

**Files:**

- Create: `anmai/e2e/full-demo.spec.ts`
- Create: `anmai/e2e/restart.spec.ts`
- Create: `anmai/playwright.config.ts`
- Create: `anmai/scripts/generate-demo-data.ts`
- Create: `anmai/README.md`
- Create: `anmai/docs/architecture.md`
- Create: `anmai/docs/demo-runbook.md`
- Modify: `anmai/package.json`

**Interfaces:**

- Consumes: complete API and Web applications.
- Produces: one-command local demo, reproducible data fixtures, architecture explanation and operator runbook.

- [ ] **Step 1: Write failing full-flow E2E test**

Import 14+ days from the single input, generate baseline with Fake Provider, start abnormal scenario, answer unwell, contact primary, let primary timeout, let another relative take over, inspect card and close event.

- [ ] **Step 2: Write failing restart E2E test**

Create an active event with a future deadline, restart API using the same SQLite file, verify remaining time and the next legal transition, then confirm no duplicate notification.

- [ ] **Step 3: Run E2E tests and verify the first meaningful failure**

Run: `pnpm --dir anmai e2e`

Expected: FAIL until runner, fixtures and scripts are complete.

- [ ] **Step 4: Implement seeded demo-data generator and root scripts**

Add `dev`, `test`, `typecheck`, `build`, `e2e`, `demo:data` and `verify` scripts. Default demo uses Fake Provider; real DeepSeek requires an explicit environment setting and key.

- [ ] **Step 5: Complete E2E flows and restart harness**

Use temporary per-test SQLite files and dynamic ports. Do not make real external calls in CI or default verification.

- [ ] **Step 6: Write operator and architecture documentation**

README includes prerequisites, install, environment, demo start, fake/DeepSeek modes, reset steps and medical disclaimer. Architecture doc names Agent, tools, both Agent Loops and deterministic safety boundaries based on actual code.

- [ ] **Step 7: Run complete verification**

Run: `pnpm --dir anmai verify`

Expected: formatting, lint, typecheck, unit/integration tests, builds and E2E all PASS.

- [ ] **Step 8: Run a manual Chrome demo**

Verify one daily import, one historical import, baseline display, normal stream, device-untrusted stream, safe-then-worsening flow, unwell flow, relative takeover, no-response simulated call, refresh and restart.

- [ ] **Step 9: Record final checkpoint**

Record commands, test counts, build output, screenshots and any intentionally deferred items. Only after this evidence is captured may the MVP be called complete.

## Plan Self-Review

- Spec coverage: ingestion, storage, baseline memory, Provider correction, anomaly detection, response state, deadlines, Agent tools/loop, API, UI and demo verification each have an owning task.
- Step scan: every task follows failing test, minimal implementation and focused verification; no product code body is prescribed where a signature and assertion are sufficient.
- Type consistency: shared DTOs originate in `@anmai/contracts`; repositories, services, Agent tools and HTTP routes consume those same names.
- Review Focus: all five high-risk input/failure classes are assigned to explicit tests in Tasks 3, 5, 6 and 7.
- Proportion: the plan fixes boundaries and acceptance evidence without transcribing the implementation.

## Execution Log

2026-11-03 Task 1 PASS：`pnpm test`（5/5）、`pnpm typecheck`（零错误）。本地提交 `5fc6400`；远端提交 `d131e87`，已核验 `main` 和 `vitals.ts` 内容。

Ruling: 新建私有 GitHub 仓库后，本地 `git push` 受 `SEC_E_NO_CREDENTIALS` 阻断；已连接的 GitHub 接口能写入同一目标仓库，因此使用 Git Data API 构建单次远端提交。代价是本地与远端初始提交历史不一致，后续需用该接口持续同步，或在命令行凭据修复后先协调两条历史。

Task 2 Ruling: `better-sqlite3` 安装时原生模块构建因缺少 Python 失败，预编译缓存目录被拒绝写入。改用 Node 24 内置 `node:sqlite`，保持 SQLite 文件、WAL、事务和 Repository 接口；代价是内置模块在 Node 24 仍标为实验性，未来部署前需固定 Node 小版本并复测。
