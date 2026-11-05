# 本地演示操作

## 评委通过稳定 URL 演示

1. 在自己的 Railway 账户创建服务，连接私有 GitHub 仓库 `liee4/anmai` 的 `main` 分支，选择仓库根目录的 `Dockerfile` 构建。服务用一个端口同时提供页面和 API；无需分别部署 Vite 与 API。
2. 给该服务挂载持久化 Volume，挂载路径 `/data`。在服务 Variables 设置 `PUBLIC_DEMO=1`、`DATABASE_PATH=/data/anmai.sqlite`、`DEEPSEEK_API_KEY`（你的真实密钥）、`DEMO_ACCESS_TOKEN`（随机访问凭证）、`DEMO_DEEPSEEK_SESSION_LIMIT=20`、`DEMO_DEEPSEEK_GLOBAL_LIMIT=100`。`PORT` 使用 Railway 提供的值。不要把真实 Key 写进 GitHub、前端或分享链接。
3. 随机凭证可在本机终端用 `node -e "console.log(require('node:crypto').randomBytes(24).toString('hex'))"` 生成。保留这个值并填入 `DEMO_ACCESS_TOKEN`。它只是评委入口凭证，**不是** DeepSeek Key。
4. Railway 服务健康检查可设为 `/api/health`。在服务设置的 Public Networking 生成 HTTPS 域名。把 `https://<你的域名>/join/<DEMO_ACCESS_TOKEN>` 发给评委；首次打开会建立演示会话并跳转到不含凭证的页面。每位评委的模拟数据和模式独立。
5. 评委在页面“演示模型”处点 DeepSeek，之后新开始的基线、异常复核与事件文案任务使用你的后端 Key。已有基线与事件不会重算。当前有活跃事件或模型复核时，先完成流程再切换。点 Fake 可回到离线演示。
6. 用另一台设备通过评委链接完整试跑：导入 14 天数据、切换 DeepSeek、再导入下一周期以触发真实基线调用、触发普通异常查看复核 Provider。检查 Railway 日志和 DeepSeek 账户用量。若 Key 未配置、请求失败或演示额度用尽，页面会给出状态或安全回退；不要把回退结果说成真实模型结果。

Railway 的服务、持久化卷与 DeepSeek API 用量可能产生费用。公开演示只使用模拟体征、模拟联系人和模拟呼救。访问凭证应只发给评委；如需撤销旧链接，在 Railway 更换 `DEMO_ACCESS_TOKEN` 并重新部署。Railway 账户创建、支付、真实 Key 填写与生成域名由账户持有人在平台完成。

## 准备

在 `anmai` 目录运行 `pnpm install`、`pnpm verify`、`pnpm dev`。打开 `http://127.0.0.1:5173`。默认使用三个离线 Fake Provider，可稳定演示基线、风险复核与事件文案。需要真实 DeepSeek 调用时，先在 API 进程环境配置需要启用的 Provider 和 `DEEPSEEK_API_KEY`；不要把密钥放进演示页面或仓库。

现场展示真实 DeepSeek 调用时，在**新的 PowerShell 窗口**进入 `anmai`，执行：

```powershell
$env:BASELINE_PROVIDER = 'deepseek'
$env:RISK_REVIEW_PROVIDER = 'deepseek'
$env:MESSAGE_PROVIDER = 'deepseek'
$env:DEEPSEEK_API_KEY = Read-Host '请输入 DeepSeek API Key'
$env:DATABASE_PATH = 'data/deepseek-demo.sqlite'
pnpm dev
```

密钥仅存在于该终端启动的进程环境中。三个 Provider 可分别设置为 `fake` 或 `deepseek`，不必同时启用。`DATABASE_PATH` 使用新的本地文件，是为了避免先前已处理过相同的 14 天周期而跳过模型调用。首次导入后，界面应显示基线 Provider 为 `deepseek` 且版本为 `v1`；随后触发普通异常，模型复核区应显示 `deepseek` 和实际结论。若仍无基线版本，或复核区显示回退原因，应先检查 API 进程日志与网络，不要将 Fake 或回退结果称为真实模型结果。现场使用自己的密钥完整试跑一次，API 用量由 DeepSeek 账户计费。

## 场景一：基线

点击“填入下一轮 14 天数据”与“导入并检查基线”。观察历史模式、14 天覆盖、有效日、完整周期和基线版本。个人基线卡显示本地统计的观察值与 Provider 名。每次导入后再次填入，会得到下一周期且体征数值有所变化；再次导入同一批 JSON 不会重复生成版本。旧数据库的基线若使用旧版分钟聚合，页面会给出提示；演示新算法前重置测试数据并重新导入。

## 场景二：佩戴者表示无事

生成基线后点击“持续异常”，观察模型建议短时观察或立即询问。Fake Provider 默认建议观察一次；默认 30 秒，可在“演示等待时间”修改。观察期间“我不舒服，需要亲属”始终可用；再次输入异常并在观察截止后仍异常时，佩戴者进入询问阶段。点击“我没事”后事件关闭，卡片显示后台继续监测和一次复查时间。同级持续异常不会立即重复询问；点击“明显恶化”会直接进入主要亲属阶段。

## 场景三：佩戴者不舒服

先结束上一事件，重新点击“持续异常”和“我不舒服，需要亲属”。基线学习状态变为暂停。主要亲属可点击“亲属已接管”；或者点击“无法接管”转到其他亲属。主要亲属等待期间触发“明显恶化”也会立即通知其他亲属。事件卡显示当前体征、反馈、位置及已登记资料；未知资料显示“未登记”。亲属接管时自行参考事件卡，不播放模拟自动呼救脚本。其他亲属也未接管时才进入模拟接线端，屏幕显示位置和播报文本，可手动重播语音。整个过程不拨打真实急救电话。

## 恢复与复位

亲属接管或模拟呼救结束后点击“结束事件”。佩戴者确认恢复时，再点击“我已恢复，重新开启基线学习”。演示计时只能在没有活跃事件或正在进行的模型复核时修改；已开始的观察和事件截止时间不会被新设置覆盖。模型观察设置在 API 重启后恢复为环境变量 `RISK_OBSERVATION_SECONDS`（默认 30 秒），事件阶段截止时间会从 SQLite 恢复。

若要从第一轮重新测试，在“统一数据输入”中点击“重置测试数据”并确认。此操作会清空 `demo-wearer` 的导入体征、每日统计、历史与当前基线、排除记录、监测状态和应急事件；下次“填入下一轮 14 天数据”重新从 2026-10-01 开始，成功生成的基线版本从 v1 计起。其他佩戴者的数据不受影响。SQLite 文件本身仍保留，演示计时设置也不改变。

## 检查点

- `pnpm verify` 覆盖单元、API 与 Web 组件测试、TypeScript 检查、生产构建和 Playwright 浏览器全流程。浏览器测试会占用本机 3000、5173 端口，并使用隔离的内存 SQLite；先关闭正在运行的 `pnpm dev`。测试需要安装 Microsoft Edge。
- `/api/health` 应返回 `demoOnly: true`。
- 页面刷新后活跃事件和剩余倒计时仍出现；API 使用同一 SQLite 文件重启后，过期计时会继续推进且模拟通知不会重复创建。
- 浏览器端到端测试使用 Fake Provider；真实 DeepSeek 接入是上述人工演示检查，不进入自动测试。
