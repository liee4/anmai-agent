# 安脉 Agent

面向心脑血管高风险老年人的体征监测与分级响应原型。当前使用模拟体征、模拟亲属通知和模拟急救接线端；所有阈值只是比赛演示参数，不是医疗诊断标准。

[设计方案](docs/安脉-Agent-设计方案.md)和[修改实施计划](docs/superpowers/plans/2026-11-04-anmai-review-remediation.md)记录了流程及实现边界。当前代码已包含规则异常检测、普通异常模型复核、人工确认、模拟亲属接管和模拟自动呼救。真实部署前验证仍是独立工作。

## 技术栈

- 前端：React、TypeScript、Vite。
- 后端：Fastify、TypeScript、Node.js 24。
- 数据库：本地 SQLite（`node:sqlite`），迁移脚本保存在 `apps/api/src/infra/migrations`。
- 模型接口：可替换的基线、风险复核、事件文案和佩戴者文字理解 Provider；公开演示的模型开关同时切换四项功能。

## 本地启动

安装 Node.js 24+ 和 pnpm 11+，在本目录执行：

```powershell
pnpm install
pnpm dev
```

打开 `http://127.0.0.1:5173`。API 默认运行在 `http://127.0.0.1:3000`，SQLite 默认位于 `apps/api/data/anmai.sqlite`。界面默认使用 `demo-wearer`；数据输入 JSON 中的 `wearerId` 也应使用这个值。

如果要测试真实 DeepSeek API，在启动 API 的终端先设置环境变量：

```powershell
$env:BASELINE_PROVIDER='deepseek'
$env:RISK_REVIEW_PROVIDER='deepseek'
$env:MESSAGE_PROVIDER='deepseek'
$env:DEEPSEEK_API_KEY = Read-Host '请输入 DeepSeek API Key'
$env:DATABASE_PATH='data/deepseek-demo.sqlite'
pnpm dev
```

三个 Provider 可以独立选择 `fake` 或 `deepseek`，共用后端的 `DEEPSEEK_API_KEY`；可通过 `DEEPSEEK_BASE_URL` 和 `DEEPSEEK_MODEL` 覆盖接口地址和模型名。密钥只留在本机环境变量，不要写进仓库。风险复核失败或超时时直接询问佩戴者；文案生成失败时使用固定模板；基线候选最多生成五次，仍不合格则不发布。
现场接入步骤见 [演示操作](docs/demo-runbook.md)。

## 给评委的稳定演示链接

项目现在可用根目录 `Dockerfile` 部署为单个服务：同一 HTTPS 域名同时提供页面和 API。推荐在自己的 Railway 账户中连接私有仓库，挂载 `/data` 持久化卷，并设置 `PUBLIC_DEMO=1`、`DATABASE_PATH=/data/anmai.sqlite`、`DEMO_ACCESS_TOKEN` 与 `DEEPSEEK_API_KEY`。Key 只在 Railway 的服务 Variables 中填写，页面仅显示“已配置”和剩余额度。[完整操作与分享链接格式](docs/demo-runbook.md)。

公开模式下，每位评委的模拟数据和模型模式按浏览器会话隔离；默认 Fake，页面可一次切换四个模型功能到 DeepSeek。佩戴者自由文字在 DeepSeek 模式下由模型理解，结果仅作为待确认建议；本地不适规则可覆盖模型的错误安全判断，模型失败时会标明本地回退。DeepSeek 调用默认每会话最多 20 次、全站最多 100 次，可用环境变量调整。请在比赛前用自己的账号检查 Railway 与 DeepSeek 的实际计费和额度。

## 演示流程

1. 页面上方按顺序展示“个人基线 → 实时体征 → 判断并询问 → 联系亲属或模拟呼救”。点击“导入首轮 14 天”，之后点击“继续导入下一轮 14 天”；每轮日期和体征不同，页面显示当前版、上轮对比及历史权重。若要演示逐日积累或自定义数据，展开“判断依据、原始记录与演示设置”，使用同一个 JSON 输入口。
2. 在“选择患者情景”中任选正常静息、正常活动、异常有回应、异常无回应、明显恶化或设备松动。主区展示模拟输入、真实规则与模型结果；右侧说明系统当前动作。正常情景的模拟体征会跟随已建立的个人基线。
3. 普通异常由规则检测进入模型复核；模型可建议短时观察，观察到期且异常仍在时询问佩戴者。佩戴者可随时表示“不舒服”并进入亲属联系；选择“我没事”后继续后台检测，明显恶化仍立即升级。
4. 亲属按主要亲属、其他亲属顺序接管；均未接管才进入模拟呼救，不会拨打真实电话。佩戴者表示不舒服后基线学习暂停，事件结束且本人确认恢复后才可继续。
5. “重置演示数据”会清空该演示佩戴者的体征、基线和事件，并从首轮重新开始。原始 JSON、计时设置、完整事件卡与时间线在展开区；已开始的观察和事件保留各自的截止时间。

数据和事件写入 SQLite，页面刷新和 API 重启后仍可读取。基线学习暂停后，必须在事件结束时由佩戴者点击“我已恢复，重新开启基线学习”。

## 主要模块

- `apps/api/src/features/ingestion`：统一输入识别、逐日与历史 Adapter、实时样本处理、质量检查、分钟中位数及异常片段审计。
- `apps/api/src/features/baseline`：14 天周期、观察基线、60/30/10 记忆证据、模型 Provider、逐字段校验与最多五次生成。
- `apps/api/src/features/monitoring`：可解释的实时风险检测与有边界的模型复核。固定演示阈值独立配置，不由模型修改。
- `apps/api/src/features/emergency`：佩戴者回应、逐联系人模拟送达与接管、持久化截止时间、事件卡与已确认异常监测。
- `apps/api/src/features/agent`：观察体征或用户操作，调用有类型校验的工具，读取执行结果。关键升级使用确定性状态机。
- `apps/web`：统一演示界面和模拟接线端。

## 验证

```powershell
pnpm test
pnpm typecheck
pnpm build
pnpm e2e
pnpm verify
```

`pnpm verify` 包含单元、API、Web 组件、类型、构建和隔离 SQLite 的浏览器端到端测试。旧数据库中已发布的基线若依据旧版分钟聚合，页面会显示提示；演示新算法前可在页面重置测试数据并重新导入。

当前实现为可运行的流程原型。真实穿戴设备接入、亲属消息通道、拨打急救电话、临床阈值验证和个人信息合规处理均不在这版模拟范围内。
