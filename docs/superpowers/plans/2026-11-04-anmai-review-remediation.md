# 安脉审查后修改 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 修复审查发现的错误，并把 DeepSeek 有边界地接入普通异常的人工确认前流程，形成可重复验证的比赛原型。

**Architecture:** 保留规则检测、确定性应急状态机和基线安全校验器。统一历史导入与实时采集的内部处理链；新增独立 RiskReviewProvider 与持久化的单次观察过程。模型只建议普通异常立即询问或限时观察，不能阻断固定阈值、明显恶化或佩戴者主动求助。

**Tech Stack:** React、TypeScript、Vite、Fastify、Node.js、SQLite、Vitest；基线和风险复核 Provider 均可配置 Fake 或 DeepSeek。

**Spec:** docs/安脉-Agent-设计方案.md，重点为第 8.12、9、12、16 节。该文件与工作区 outputs/安脉-Agent-设计方案.md 同步。

## 审查基线

当前 25 个测试文件、78 个测试可通过原有 pnpm verify，但现有测试没有覆盖两项 P0，且有测试把首次 worsening 停在 wearer_alert 当成正确结果。实际代码还存在：高频样本冒充持续异常、分钟记录保留首条值、导入与实时评价两条链路、超过四个周期的早期证据被跳过、亲属通知只按两个模拟接收者记录、事件卡缺字段、DeepSeek 只在基线生成中被调用，以及缺少 Web 组件和浏览器端到端测试。本计划以这些已核对差距为修改对象，不把现有 pnpm verify 通过当成方案已实现。

## Global Constraints

- 仅使用模拟体征、模拟亲属通知和模拟急救呼叫；不接入真实穿戴设备、短信、电话或 120。
- 固定安全阈值由代码控制；大模型不得修改风险等级、跳过升级或直接调用亲属通知和急救工具。
- 普通异常仅在存在有效个人基线时调用 RiskReviewProvider；没有基线时直接询问佩戴者。
- 模型只能建议一次观察，默认 30 秒，可人为设置；期满仍异常必须询问。模型超时、失败、无效或不确定时直接询问。
- 固定安全阈值、明显恶化和佩戴者主动选择“不舒服”优先于任何在途或已返回的模型结果。
- 继续保留统一对外数据输入体验、内部逐日与历史两个 Adapter，以及 14 天基线周期、历史权重、安全校验和 12 个月历史保存规则。
- 原型不能宣称具备临床灵敏度、可靠监护或真实急救能力。

## Review Focus

以下五类输入最容易产生漏报或错误升级；对应任务必须各有定向测试。

1. 30 秒窗口前端有旧样本、末尾 1 秒密集异常：任务 1 应判定不满足 24 个异常秒。
2. 模型请求未返回时新命中固定阈值：任务 4 应立即升级并丢弃迟到结果。
3. 观察期内断流、重启或佩戴者主动求助：任务 4 应保留状态并按约定提示或升级。
4. 主要亲属等待期间恶化、通知重试与亲属接管并发：任务 2 和 6 应只产生一次合法转换及逐人状态。
5. 一次导入超过四个 14 天周期：任务 5 应保留更早周期的确定性长期摘要，不静默丢失。

## 交付阶段

- **阶段 A，比赛原型必修：任务 1—5。** 两项 P0 修复、采集链整合、模型复核和基线历史遗漏均须通过自动化测试。
- **阶段 B，比赛展示补齐：任务 6—8。** 逐联系人模拟通知、事件卡、模型可见性、浏览器全流程和故障场景。
- **阶段 C，真实部署前研究：本计划末节。** 不把研究项误写为已实现功能。

### Task 1: 按时间覆盖计算持续异常并完善数据质量

**Files:** Modify apps/api/src/features/monitoring/risk-detector.ts、apps/api/src/features/monitoring/detection-config.ts；Create apps/api/src/features/monitoring/second-window.ts；Test apps/api/tests/features/monitoring/risk-detector.test.ts。

**Interfaces:** second-window.ts 导出按时间戳生成 30 个自然秒桶的函数，每秒最多贡献一次异常判定，并输出有效覆盖秒数、异常秒数与末尾连续异常秒数；RiskDetector.evaluate 接口保持不变。

- [ ] 写失败测试：旧正常样本与末尾 870 毫秒内 30 条异常样本因中间断流得到 untrusted_data，绝不能得到 abnormal；30 个有效异常秒仍得到 abnormal。
- [ ] 写失败测试：乱序、重复时间戳、缺秒、稀疏采样不能凑足 24/30 与最后 5 秒；不可信设备状态在固定阈值之前拦截。
- [ ] 运行 pnpm exec vitest run apps/api/tests/features/monitoring/risk-detector.test.ts，确认新测试先失败。
- [ ] 以真实时间桶计算 10 秒稳定值与 30 秒持续性，缺失秒不计为异常秒；增加冻结时间戳、断流、采样节奏、物理上不合理跳变的工程质量标记，数值重复本身不单独判定冻结。
- [ ] 重跑定向测试与 pnpm verify，通过后单独提交。

### Task 2: 修复恶化转换矩阵

**Files:** Modify apps/api/src/features/agent/anmai-agent.ts、apps/api/src/features/emergency/state-machine.ts、apps/api/src/features/emergency/emergency-service.ts；Test apps/api/tests/features/emergency/state-machine.test.ts、apps/api/tests/features/agent/agent.test.ts、apps/api/tests/http/api.test.ts。

**Interfaces:** EmergencyService 在观察活跃风险时返回前后风险与是否首次进入明显恶化的确定性信息；Agent 用同一事件版本执行转换，不直接操作通知表。

- [ ] 写失败测试：首次风险即 worsening 时，同时记录佩戴者警告并直接进入 primary_contact；已有 primary_contact 的风险首次明显恶化时立即进入 other_contacts。
- [ ] 写失败测试：佩戴者询问中恶化、选择“我没事”后恶化、其他亲属阶段再次恶化、重复输入与并发回应均符合原方案；更新目前期待首次 worsening 停在 wearer_alert 的旧断言。
- [ ] 运行相应 Vitest 文件，确认测试先失败。
- [ ] 实现状态转移与升级原因审计；事件初始风险、最近风险及前次风险分开记录，避免依赖创建时的旧 event.risk。通知由事件状态变化统一触发。
- [ ] 重跑定向测试与 pnpm verify，通过后单独提交。

### Task 3: 统一采集、聚合、风险与异常审计

**Files:** Create apps/api/src/features/ingestion/sample-pipeline.ts、apps/api/src/infra/migrations/008_minute_aggregation.sql；Modify apps/api/src/features/ingestion/ingestion-service.ts、apps/api/src/features/ingestion/daily-summary-builder.ts、apps/api/src/features/baseline/observation-baseline.ts、apps/api/src/app.ts、apps/api/src/infra/migrate.ts；Test apps/api/tests/features/ingestion/ingestion.test.ts、apps/api/tests/http/baseline-exclusions.test.ts 及新增 pipeline 集成测试。

**Interfaces:** sample-pipeline.ts 提供 processSamples(wearerId, samples, source)，其中 source 区分 daily、history、live、scenario；各入口共用标准化、去重、质量、分钟聚合和异常审计。基线资格由同一排除规则决定；模拟场景样本默认不可用于基线学习。

- [ ] 写失败测试：同一分钟多条不同值形成该分钟中位数与样本数；历史导入和实时评价的异常样本进入同一审计及排除记录；重复批次不重复计数。
- [ ] 写失败测试：风险异常、佩戴者表示不舒服、基线暂停、设备不可信时，该段样本不会进入个人基线；正常实时样本可形成日总结。
- [ ] 运行定向测试确认失败，再实现共享处理链与数据库迁移。
- [ ] 迁移或重建演示数据库的既有分钟统计时保留原始样本及旧基线审计；旧版基线不得悄然声称依据新聚合值。发布前提供明确的演示数据重置或重建步骤。
- [ ] 重跑定向测试与 pnpm verify，通过后单独提交。

### Task 4: 有边界的 DeepSeek 风险复核与一次观察

**Files:** Create packages/contracts/src/risk-review.ts、apps/api/src/features/monitoring/risk-review-provider.ts、apps/api/src/features/monitoring/deepseek-risk-review-provider.ts、apps/api/src/features/monitoring/fake-risk-review-provider.ts、apps/api/src/features/monitoring/risk-review-registry.ts、apps/api/src/features/monitoring/risk-review-service.ts、apps/api/src/infra/migrations/009_risk_review.sql；Modify packages/contracts/src/index.ts、apps/api/src/features/agent/anmai-agent.ts、apps/api/src/app.ts、apps/api/src/main.ts、apps/api/src/infra/migrate.ts；Test 新增 RiskReviewProvider、RiskReviewService 和 HTTP 集成测试。

**Interfaces:** RiskReviewProvider.review(request: RiskReviewRequest): Promise<RiskReviewDecision>。request 只含最近 60 秒精简趋势、最新体征、活动状态、质量、规则原因、有效基线版本与相关值；decision 只允许 ask、observe、uncertain 和短依据。独立配置 RISK_REVIEW_PROVIDER=fake|deepseek，默认 fake；DeepSeek 复用后端环境中的 API Key；页面只读显示真实 Provider。

- [ ] 写失败测试：无基线直接询问；普通异常有基线时同一连续过程只调用模型一次；ask、uncertain、无效 JSON、错误和 5 秒超时均询问。
- [ ] 写失败测试：observe 只创建一次可配置的默认 30 秒绝对截止时间；到期仍异常询问，正常可信数据结束观察；断流提示检查设备且不认定恢复；主动“不舒服”直接联系亲属。
- [ ] 写失败测试：模型在途时命中固定阈值或明显恶化立即升级；迟到模型结果因任务版本变化不能覆盖升级；刷新和后端重启不重置观察时钟。
- [ ] 运行定向测试确认失败，再实现结构校验、短超时、任务去重、SQLite 持久化和版本比较。模型不得调用应急工具或修改规则分数。
- [ ] 将每次复核的 Provider、结论、依据、时间、输入摘要哈希与回退原因写入审计；模拟数据不含姓名或位置，API Key 仅在后端。
- [ ] 重跑定向测试与 pnpm verify，通过后单独提交。

### Task 5: 补齐超过四个周期的长期记忆

**Files:** Modify apps/api/src/features/baseline/baseline-service.ts、apps/api/src/features/baseline/long-term-summary.ts、apps/api/src/features/baseline/memory-assembler.ts、apps/api/src/infra/migrate.ts；Create apps/api/src/infra/migrations/010_older_cycle_summary.sql；Test apps/api/tests/features/baseline/baseline-service.test.ts、apps/api/tests/features/baseline/long-term-summary.test.ts。

**Interfaces:** 将超过最近四个合格周期的更早周期按日期和场景压缩为确定性统计摘要，包含周期 ID、时间范围、有效天数及可追溯数值；BaselineService 生成最近四轮候选时将该摘要作为长期证据，不为旧周期逐个调用模型。

- [ ] 写失败测试：一次导入五个及以上 14 天周期，最早周期不生成完整基线版本，但其统计证据出现在长期摘要和后续模型请求中。
- [ ] 写失败测试：摘要仅使用有效且未被排除的数据；12 个月外信息被清理，当前有效基线与既定历史权重不被静默删除。
- [ ] 运行定向测试确认失败，再实施摘要存储、增量重算与权重组装。
- [ ] 重跑定向测试与 pnpm verify，通过后单独提交。

### Task 6: 逐联系人模拟通知和可追溯接管

**Files:** Create apps/api/src/features/emergency/notification-service.ts、apps/api/src/infra/migrations/011_demo_contacts.sql；Modify apps/api/src/features/emergency/emergency-service.ts、apps/api/src/features/emergency/state-machine.ts、apps/api/src/infra/migrate.ts、packages/contracts/src/emergency.ts；Test apps/api/tests/features/emergency/emergency-service.test.ts 及新增通知集成测试。

**Interfaces:** 演示联系人使用独立 ID 和角色；每个事件与联系人保存 pending、delivered、delivery_failed、declined、taken_over、timeout。模拟发送最多两次，失败后 5 秒重试一次；eventId、contactId 与通知阶段组成幂等键。

- [ ] 写失败测试：主要联系人失败或拒绝立即通知其余联系人；其余联系人仍有人等待时不提前模拟呼救；全部失败或拒绝则立即模拟呼救。
- [ ] 写失败测试：亲属接管与超时并发只有一个生效；刷新、重启、重试不重复创建首条通知；明显恶化即时通知其余联系人。
- [ ] 运行定向测试确认失败，再实现模拟投递与逐人状态；保留当前“主要联系人/其他亲属”的简洁演示入口，但后台逐人记录。
- [ ] 重跑定向测试与 pnpm verify，通过后单独提交。

### Task 7: 事件卡、交互文案与模型复核界面

**Files:** Create apps/api/src/features/agent/message-provider.ts、apps/api/src/features/agent/deepseek-message-provider.ts、apps/api/src/features/agent/fake-message-provider.ts；Modify apps/api/src/app.ts、packages/contracts/src/emergency.ts、apps/web/src/app/App.tsx、apps/web/src/app/TimerPanel.tsx、apps/web/src/app/EventTimeline.tsx、apps/web/src/api/client.ts、apps/web/src/styles/app.css；Test 新增消息 Provider 测试和 apps/web/src/app 的组件测试。

**Interfaces:** Dashboard 增加风险复核状态、Provider、结论、依据、观察截止时间和模拟事件卡资料。MessageProvider 根据已确定的事件事实生成 wearerPrompt、relativeSummary 与 emergencyScript；失败时固定模板立即可用，生成文本不能更改收件人、计时和状态。emergencyScript 仅供无人接管后的模拟自动呼救，不用于亲属自行拨打急救电话。个人资料只用明确标注的模拟或已授权字段；缺失项显示“未登记”。

- [ ] 写组件测试：页面可区分 Fake 与 DeepSeek、显示模型结论和观察倒计时；不展示 API Key；观察期间始终可主动请求亲属。
- [ ] 写组件测试：事件卡展示姓名、年龄、最新体征及时间、趋势、佩戴者反馈、病史、过敏和位置；未知字段不编造；严重风险视觉状态明显但保持原有克制设计。
- [ ] 写消息测试：DeepSeek 可生成佩戴者询问与亲属摘要；仅在模拟自动呼救阶段生成 emergencyScript。模型超时或文本不合格时用本地模板，已发生的状态转换及通知不等待文本生成。
- [ ] 运行组件测试确认失败，再更新契约、API 与页面。
- [ ] 重跑组件测试、pnpm verify 和浏览器人工检查，通过后单独提交。

### Task 8: 浏览器全流程与故障回归

**Files:** Create playwright.config.ts、apps/web/e2e 下的场景测试；Modify package.json、docs/demo-runbook.md、README.md。

**Interfaces:** 离线 Fake Provider 驱动稳定的端到端测试；DeepSeek HTTP 适配器用受控响应测试，不在 CI 使用真实 API Key。保留一个明确标识为人工的真实 API 演示检查步骤。

- [ ] 加入 Playwright 浏览器测试：首轮 14 天导入与 v1、普通异常模型 observe、30 秒仍异常询问、主动求助、首次 worsening 直达亲属、主要亲属阶段恶化、无人接管模拟呼救。
- [ ] 加入断网、模型迟到、设备断流、乱序高频与稀疏采样、页面刷新和后端重启回归；所有测试使用隔离 SQLite，不重置用户当前演示数据。
- [ ] 将组件与浏览器测试接入 pnpm verify，并在演示手册写清 Fake/DeepSeek 切换和服务重启方法。
- [ ] 运行 pnpm verify 与 pnpm exec playwright test，检查全通过后单独提交。

## 阶段 C：真实部署前的独立门槛

比赛原型通过以上任务后仍不能用于真实监护或自动呼救。真实部署前另行完成：穿戴设备协议与信号质量验证；由医疗专业人员确定适用人群、阈值与误报/漏报目标；真实世界回顾与前瞻验证及人因测试；真实联系人身份认证、权限、失败重试、传输和存储保护；个人健康及位置数据治理；急救机构与通信服务的正式协作及适用监管评估。任何临床或法律结论需由相应专业机构确认。

## 计划验收

- 两项审查 P0 均有先失败后通过的回归测试，且真实时间窗口和恶化转换与设计方案一致。
- 模型参与普通异常的主循环，只有一次可追溯的暂缓机会；所有严重风险和主动求助均不受模型阻断。
- 输入到风险、异常片段、基线排除和事件审计可由同一批样本追溯。
- 逐联系人模拟通知、事件卡和浏览器全流程有自动化证据；pnpm verify 包含 Web 组件和浏览器测试。
- 文档明确区分已实现、待实现和真实部署前的外部验证。
