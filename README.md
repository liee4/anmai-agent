# 安脉 Agent

面向心脑血管高风险老年人的体征监测与分级响应原型。当前使用模拟体征、模拟亲属通知和模拟急救接线端；所有阈值只是比赛演示参数，不是医疗诊断标准。

## 技术栈

- 前端：React、TypeScript、Vite。
- 后端：Fastify、TypeScript、Node.js 24。
- 数据库：本地 SQLite（`node:sqlite`），迁移脚本保存在 `apps/api/src/infra/migrations`。
- 基线模型：可替换的 `BaselineModelProvider`；默认使用本地假 Provider，配置后可调用 DeepSeek。

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
$env:DEEPSEEK_API_KEY = Read-Host '请输入 DeepSeek API Key'
$env:DATABASE_PATH='data/deepseek-demo.sqlite'
pnpm dev
```

可通过 `DEEPSEEK_BASE_URL` 和 `DEEPSEEK_MODEL` 覆盖接口地址和模型名。密钥只留在本机环境变量，不要写进仓库。模型调用失败时，既有基线仍可用于检测；新软阈值不会绕过校验器发布。
现场接入步骤见 [演示操作](docs/demo-runbook.md)。

## 演示流程

1. 点击“填入 14 天演示数据”，然后点击“导入并检查基线”。系统自动识别为历史数据，按本地日期拆分，保存每日统计；满足 14 天周期与有效日条件后调用基线 Provider。若要演示逐日积累，也可通过同一个输入口每天传入一份数据。
2. 点击“持续异常”。异常检测器根据近 10 秒稳定值、近 30 秒持续性、个性化软阈值与固定演示阈值发起佩戴者询问。
3. 点击“我没事”：当前事件关闭，后台记录已确认异常，同级异常暂不重复询问；持续 5 分钟可复查一次，明显恶化立即新建事件并联系主要亲属。
4. 重新触发异常并点击“我不舒服，需要亲属”：系统立即联系主要亲属，暂停基线学习；亲属可接管或拒绝。无人接管时进入模拟急救接线端并播报模拟脚本，不会拨打真实电话。
5. 可在没有活跃事件时修改佩戴者、主要亲属、其他亲属及复查计时。事件创建时保留本次计时快照。

数据和事件写入 SQLite，页面刷新和 API 重启后仍可读取。基线学习暂停后，必须在事件结束时由佩戴者点击“我已恢复，重新开启基线学习”。

## 主要模块

- `apps/api/src/features/ingestion`：统一输入识别、逐日与历史 Adapter、归一化和每日统计。
- `apps/api/src/features/baseline`：14 天周期、观察基线、60/30/10 记忆证据、模型 Provider、逐字段校验与最多五次生成。
- `apps/api/src/features/monitoring`：可解释的实时风险检测。固定演示阈值独立配置，不由模型修改。
- `apps/api/src/features/emergency`：佩戴者回应、亲属分阶段接管、持久化截止时间与已确认异常监测。
- `apps/api/src/features/agent`：观察体征或用户操作，调用有类型校验的工具，读取执行结果。关键升级使用确定性状态机。
- `apps/web`：统一演示界面和模拟接线端。

## 验证

```powershell
pnpm test
pnpm typecheck
pnpm build
pnpm verify
```

当前实现为可运行的流程原型。真实穿戴设备接入、亲属消息通道、拨打急救电话、临床阈值验证和个人信息合规处理均不在这版模拟范围内。
