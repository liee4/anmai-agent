import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Presentation, PresentationFile } from '@oai/artifact-tool';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outputDir = path.join(root, 'output');
const previewDir = path.join(here, 'competition-previews');
const skillDir = 'C:\\Users\\lieyi\\.codex\\plugins\\cache\\openai-primary-runtime\\presentations\\26.1105.12137\\skills\\presentations';
const python = 'C:\\Users\\lieyi\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe';
process.env.RUNTIME_NODE_MODULES = 'C:\\Users\\lieyi\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules';

const W = 1280, H = 720;
const C = { bg: '#F5F7F6', ink: '#142B32', muted: '#50666C', teal: '#0A687A', light: '#DDE9E9', line: '#B6CCCD', coral: '#B65C44', white: '#FFFFFF', green: '#33765D' };
const FONT = 'Noto Sans SC';
const p = Presentation.create({ slideSize: { width: W, height: H } });

function text(s, value, x, y, w, h, size = 24, color = C.ink, bold = false) {
  const shape = s.shapes.add({ geometry: 'textbox', position: { left: x, top: y, width: w, height: h }, fill: 'none', line: { style: 'solid', fill: 'none', width: 0 } });
  shape.text = value;
  shape.text.style = { typeface: FONT, fontSize: size, color, bold, wrap: true };
  return shape;
}
function rule(s, x, y, w, color = C.line, height = 2) {
  s.shapes.add({ geometry: 'rect', position: { left: x, top: y, width: w, height }, fill: color, line: { style: 'solid', fill: color, width: 0 } });
}
function slide(title, no, section, notes = '') {
  const s = p.slides.add();
  s.background.fill = C.bg;
  text(s, section, 78, 31, 950, 25, 16, C.teal, true);
  text(s, title, 76, 64, 1128, 60, 34, C.ink, true);
  rule(s, 78, 135, 1123, C.teal, 3);
  text(s, String(no).padStart(2, '0'), 1151, 674, 50, 20, 15, C.muted);
  if (notes) s.speakerNotes.text = notes;
  return s;
}
function row(s, y, num, title, body, width = 1110) {
  text(s, num, 82, y, 72, 48, 28, C.teal, true);
  text(s, title, 166, y, 310, 48, 26, C.ink, true);
  text(s, body, 495, y + 3, width - 413, 85, 22, C.muted);
  rule(s, 82, y + 96, width, C.line, 1);
}
function pair(s, x, y, w, label, body, accent = C.teal) {
  text(s, label, x, y, w, 42, 22, accent, true);
  text(s, body, x, y + 55, w, 120, 26, C.ink);
}
function flowBox(s, x, y, w, h, label, body, accent = C.teal) {
  s.shapes.add({ geometry: 'rect', position: { left: x, top: y, width: w, height: h }, fill: C.white, line: { style: 'solid', fill: C.line, width: 1 } });
  text(s, label, x + 13, y + 10, w - 26, 35, 20, accent, true);
  text(s, body, x + 13, y + 49, w - 26, h - 52, 18, C.ink);
}
function caption(s, value, y = 633, color = C.muted) { text(s, value, 80, y, 1110, 42, 18, color); }
async function addImage(s, filename, x, y, w, h, alt) {
  const bytes = await fs.readFile(path.join(root, 'assets', filename));
  s.images.add({ blob: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), contentType: 'image/png', alt, fit: 'contain', position: { left: x, top: y, width: w, height: h } });
}

// 01 Cover
{
  const s = p.slides.add(); s.background.fill = C.ink;
  text(s, '安脉 Agent', 82, 125, 1010, 92, 66, C.white, true);
  text(s, '高风险老年人的异常体征响应原型', 84, 244, 1080, 80, 36, '#E5F1F0');
  rule(s, 86, 366, 230, '#70B9C0', 5);
  text(s, '体征证据 · 本人确认 · 亲属接管 · 模拟呼救', 84, 411, 1090, 70, 28, C.white);
  text(s, '医疗赛道  |  南京邮电大学  |  队长：宋奕霖', 84, 610, 1100, 43, 22, '#C7DCDD');
  s.speakerNotes.text = '当前作品使用模拟体征和模拟通知，不构成医疗诊断或真实呼救系统。';
}

// 02 Background and sources
{
  const s = slide('异常被发现以后，谁来响应？', 2, '一 作品背景与说明', '参考来源：项目需求访谈形成的场景假设；安脉现有原型与设计方案；公开健康数据发布页。目标价值尚未经临床或用户试验量化。');
  text(s, '面向独处、心脑血管风险较高的老年人，系统需要把异常信号转成有人处理的事件。', 80, 168, 1110, 88, 29);
  row(s, 286, '01', '发现是否可信', '运动、松动、缺测和短时波动都会影响判断');
  row(s, 397, '02', '先问本人感受', '佩戴者的回答决定是否立即联系亲属');
  row(s, 508, '03', '无人回应再升级', '按截止时间逐人联系，保留事件与位置记录');
  caption(s, '参考：安脉需求与设计方案；PhysioNet BIDMC/BUT PPG；UCI PPG-DaLiA。', 633);
}

// 03 Current inputs and acquisition channels
{
  const s = slide('数据渠道：模拟历史与真实记录回放', 3, '二 数据收集与处理 · 数据来源');
  row(s, 177, 'A', '模拟历史', '程序生成逐秒情景体征与逐日历史数据；用于可重复演示');
  row(s, 298, 'B', 'PhysioNet BIDMC', '已纳入 bidmc_01 原始数值记录；481 秒、1 Hz，可回放心率与血氧');
  row(s, 419, 'C', '后续候选', 'UCI PPG-DaLiA 的活动数据；PhysioNet BUT PPG 的质量标签');
  text(s, '获取方式：模拟 JSON 经统一入口导入；BIDMC 文件保留原始哈希与许可，按 35 秒窗口回放。', 82, 555, 1100, 80, 23, C.teal, true);
  caption(s, 'BIDMC 是医院床旁记录，不代表居家高风险老年人的真实病程。', 638, C.coral);
  s.speakerNotes.text = 'BIDMC: https://physionet.org/content/bidmc/1.0.0/ 。已纳入 bidmc_01_Numerics.csv，原文件 SHA-256: 27d43794cf2e7150db10e8bfe61d2bfdb26873a8f1629ffc5fbee5c9a4eb6ef5，ODC-By 许可。BUT PPG 与 PPG-DaLiA 只核查来源，未接入。';
}

// 04 Dataset authority and limits
{
  const s = slide('一份已接入记录，两份待验证候选', 4, '二 数据收集与处理 · 数据来源');
  row(s, 175, '01', 'BIDMC 已接入', 'PhysioNet 开放数据；回放 bidmc_01 数值，保留 13 秒血氧缺测');
  row(s, 297, '02', 'PPG-DaLiA', 'UCI 收录、15 名受试者；适合活动干扰与腕部心率回放');
  row(s, 419, '03', 'BUT PPG', 'PhysioNet v2；3,888 段 10 秒片段；适合质量门控验证');
  text(s, '限制：住院、活动实验和手机 PPG 均不能直接代表居家高风险老年人。', 83, 552, 1100, 76, 25, C.coral, true);
  caption(s, '回放只测试数据接入和判断路径；目标人群的误报、漏报仍无数据可评估。', 637);
  s.speakerNotes.text = 'BIDMC: https://physionet.org/content/bidmc/1.0.0/ ，已纳入 bidmc_01 原始数值记录。PPG-DaLiA: https://archive.ics.uci.edu/dataset/495/ppg%2Bdalia ; BUT PPG: https://physionet.org/content/butppg/2.0.0/ ，两者尚未接入。BUT 的血压/血氧只是单值标注，不能当连续腕戴时序；三份数据不能拼成同一人的真实病程。';
}

// 05 Knowledge layer
{
  const s = slide('行业知识已标注来源，临床审核待完成', 5, '二 数据收集与处理 · 知识库内容');
  pair(s, 82, 183, 495, '可执行规则', '数据可信度、持续异常、固定安全边界、本人回应与亲属升级由代码控制。');
  pair(s, 662, 183, 505, '版本化参考知识', '三条官方来源：心脏症状、血氧仪局限、脑卒中诊疗指南；当前只选取心脏与血氧条目。', C.teal);
  rule(s, 82, 450, 1083, C.line, 1);
  text(s, 'Agent 的使用方式', 82, 476, 330, 43, 22, C.teal, true);
  text(s, '普通异常复核接收相关参考条目与体征证据；参考知识只辅助解释，不修改阈值或直接触发升级。', 82, 528, 1090, 88, 25);
  caption(s, '来源已核对，尚未经临床专家审核；没有指南自动更新机制。', 637, C.coral);
  s.speakerNotes.text = '心脏症状：https://www.nhc.gov.cn/xcs/c100122/202511/b622555670fa4f2388eb35f1c339195f.shtml ；血氧仪局限：https://www.fda.gov/medical-devices/products-and-medical-procedures/pulse-oximeters ；卒中指南：https://www.nhc.gov.cn/ylyjs/zcwj/202412/ba037e931fff4870930f65ff667ea9ed/files/1736390751587_80714.pdf 。卒中条目目前仅在目录中，因为系统没有面瘫、肢体或语言症状输入。';
}

// 06 Preprocessing diagram
{
  const s = slide('数据预处理：两种输入，共用一条可信链路', 6, '二 数据收集与处理 · 预处理与利用');
  text(s, '体征数据：统一入口自动识别逐日与历史导入', 83, 165, 1090, 35, 21, C.teal, true);
  const data = [['输入识别', '逐日 / 历史 Adapter'], ['规范化', '时间、字段、活动标记'], ['质量与聚合', '缺测、冲突、分钟中位数'], ['分流利用', '14 天基线 / 实时风险']];
  data.forEach((item, i) => { const x = 83 + i * 273; flowBox(s, x, 207, 231, 111, item[0], item[1]); if (i < 3) text(s, '→', x + 238, 245, 32, 40, 24, C.teal, true); });
  text(s, '知识处理：官方来源按风险原因进入模型复核', 83, 354, 1090, 35, 21, C.teal, true);
  const knowledge = [['来源登记', '机构、链接与版本'], ['范围匹配', '心脏与血氧条目按需选取'], ['审核状态', '已核对来源，待临床审核'], ['受控使用', '只供解释，不改变动作权限']];
  knowledge.forEach((item, i) => { const x = 83 + i * 273; flowBox(s, x, 395, 231, 111, item[0], item[1], i === 1 || i === 2 ? C.coral : C.teal); if (i < 3) text(s, '→', x + 238, 433, 32, 40, 24, C.teal, true); });
  rule(s, 83, 541, 1090, C.line, 1);
  text(s, '共同输出：带来源的证据、排除原因与事件审计；不舒服期间暂停基线学习。', 83, 566, 1090, 75, 24, C.ink, true);
}

// 07 Method choice
{
  const s = slide('方法选择：逐项证据链代替综合加减分', 7, '三 分析过程 · 分析方法选择');
  row(s, 167, '01', '可信度', '逐通道检查有效性；不可信数据提示重测');
  row(s, 272, '02', '持续性', '按自然秒统计覆盖与异常时长，抵抗高频采样误判');
  row(s, 377, '03', '安全边界', '固定阈值优先；个人基线仅调节软预警范围');
  row(s, 482, '04', '趋势变化', '相邻时间窗比较，明显恶化立即升级');
  text(s, '输出包含等级、质量、覆盖秒数、异常秒数、方向和原因，供模型与人工查看。', 82, 601, 1100, 62, 23, C.teal, true);
  s.speakerNotes.text = '这里的阈值和规则是工程演示参数，不是临床认可的预测模型。';
}

// 08 Baseline method and memory
{
  const s = slide('方法选择：14 天个人基线和跨周期记忆', 8, '三 分析过程 · 分析方法选择');
  text(s, '代码计算中位数与 MAD，再给模型一份有边界的候选任务；不合格字段反馈重试，总共最多五次。', 82, 172, 1090, 106, 27);
  text(s, '60%', 93, 311, 210, 75, 54, C.teal, true); text(s, '最新周期', 93, 390, 240, 40, 23);
  text(s, '30%', 470, 311, 210, 75, 54, C.teal, true); text(s, '近期历史', 470, 390, 240, 40, 23);
  text(s, '10%', 850, 311, 210, 75, 54, C.teal, true); text(s, '长期摘要', 850, 390, 240, 40, 23);
  rule(s, 82, 474, 1090, C.line, 1);
  text(s, '仅在已积累近期版本与长期摘要时采用 60/30/10；首轮为当前数据 100%。', 82, 517, 1090, 70, 24, C.ink, true);
  caption(s, '权重是产品设计参数，尚未通过真实人群评估。', 636, C.coral);
}

// 09 Scenario evidence instead of invented user trend
{
  const s = slide('场景推演：不同输入触发不同动作', 9, '三 分析过程 · 问题理解与逻辑论证');
  text(s, '模拟情景', 84, 163, 245, 43, 20, C.teal, true);
  text(s, '关键证据', 385, 163, 345, 43, 20, C.teal, true);
  text(s, 'Agent 动作', 785, 163, 350, 43, 20, C.teal, true);
  rule(s, 84, 208, 1080, C.teal, 2);
  const cases = [
    ['平稳 / 活动', '处于个人范围；有活动标记', '继续后台监测'],
    ['普通异常', '心率 112；持续 35 秒', '模型复核后询问本人'],
    ['明显恶化', '心率 142；血氧 90%', '提醒本人并立即联系亲属'],
    ['设备松动', '设备数据不可信', '提示检查设备'],
  ];
  cases.forEach((item, i) => { const y = 230 + i * 91; text(s, item[0], 84, y, 280, 67, 23, C.ink, true); text(s, item[1], 385, y, 350, 67, 21, C.muted); text(s, item[2], 785, y, 365, 67, 22, i === 2 ? C.coral : C.ink); rule(s, 84, y + 75, 1080, C.line, 1); });
  caption(s, '以上为原型的模拟情景与状态转移，不代表真实用户行为趋势或临床发生率。', 614, C.coral);
}

// 10 Logic map and concrete example
{
  const s = slide('一条普通异常的证据与行动路径', 10, '三 分析过程 · 问题理解与逻辑论证');
  text(s, '模拟输入：静息心率 112 次/分，血氧 97%，持续 35 秒', 83, 166, 1090, 54, 26, C.ink, true);
  flowBox(s, 82, 260, 237, 99, '数据可信', '心率覆盖 10/10 秒');
  flowBox(s, 82, 397, 237, 99, '异常持续', '心率异常 30/30 秒');
  flowBox(s, 471, 327, 322, 104, '普通异常证据', '进入模型复核与状态机', C.coral);
  flowBox(s, 930, 260, 245, 99, '模型复核', 'Fake：观察 30 秒');
  flowBox(s, 930, 397, 245, 99, '人工反馈', '不舒服则联系亲属');
  rule(s, 319, 309, 152, C.line, 2); rule(s, 319, 447, 152, C.line, 2);
  rule(s, 793, 309, 137, C.line, 2); rule(s, 793, 447, 137, C.line, 2);
  text(s, '模型观察、本人回应和亲属接管时间均可设置；事件开始后锁定本次计时。', 83, 554, 1090, 67, 23, C.teal, true);
  caption(s, '演示结果可复现；真实误报率和抢救收益尚无验证数据。', 638, C.coral);
}

// 11 Innovation: agent loop
{
  const s = slide('创新点一：持续追踪事件的 Agent 主循环', 11, '四 创新性与独特视角 · 创新点');
  text(s, 'Agent 读取体征与事件状态，选择受控工具，等待人工与计时反馈，再决定下一步。', 81, 168, 1090, 98, 29);
  row(s, 300, '看', '观察', '体征、当前基线、佩戴者回答和亲属接管状态');
  row(s, 409, '做', '工具调用', 'evaluate_risk / create_alert / record_response / run_deadlines');
  row(s, 518, '再看', '继续循环', '截止时间到达或状态改变后再次读取，保留调用轨迹');
  caption(s, '状态机决定升级权限；模型输出不能直接触发呼救。', 640, C.coral);
}

// 12 Innovation: cross-disciplinary
{
  const s = slide('创新点二：把个人差异与照护反馈放在同一链路', 12, '四 创新性与独特视角 · 跨学科视角');
  pair(s, 83, 180, 500, '信号处理 × 统计', '逐秒质量门控、持续时间、个人中位数与 MAD，给出可审计证据。');
  pair(s, 662, 180, 500, '语言模型 × 人机协作', '模型处理有限复核与文案；佩戴者反馈直接改变下一步动作。');
  rule(s, 83, 462, 1080, C.line, 1);
  text(s, '照护流程 × 软件工程', 83, 491, 440, 42, 22, C.teal, true);
  text(s, '逐人联系、送达重试、事件卡与截止时间持久化，使家庭照护环节可追踪。', 83, 548, 1090, 90, 27);
}

// 13 Results: interpretation
{
  const s = slide('原型结果：先解释异常，再请本人判断', 13, '五 结果解释与建议 · 结果解读');
  await addImage(s, 'demo-glass-wearer.png', 82, 172, 1110, 449, '本地模拟原型：普通异常进入佩戴者确认');
  caption(s, '图为本地 Fake 模型演示：心率持续异常，经一次观察后询问本人。', 639);
  s.speakerNotes.text = '真实 DeepSeek 可在公开演示模式切换，但本图使用 Fake Provider。截图在 2026-11-10 从本地原型采集。';
}

// 14 Results: family takeover
{
  const s = slide('原型结果：本人求助后进入亲属接管', 14, '五 结果解释与建议 · 结果解读');
  await addImage(s, 'demo-glass-relative.png', 82, 171, 1110, 450, '本地模拟原型：亲属接管与紧急事件卡摘要');
  caption(s, '事件卡含体征、本人反馈与预设演示位置；真实设备定位尚未接入。', 638);
}

// 15 Problems and recommendations: data and algorithm
{
  const s = slide('问题与建议：补足数据代表性和模型验证', 15, '五 结果解释与建议 · 问题与建议');
  row(s, 175, '01', '数据覆盖有限', '已接入一条 BIDMC 床旁记录；后续增加腕戴与活动数据');
  row(s, 297, '02', '阈值仅供演示', '取得去标识化事件标签后，评估误报、漏报与分人群表现');
  row(s, 419, '03', '基线模型待选型', '保持 Provider 接口，比较可解释性、稳定性和失败回退');
  text(s, '重点：不能把跨数据集片段拼成同一位老人的真实病程。', 83, 566, 1090, 66, 25, C.coral, true);
}

// 16 Problems and recommendations: service
{
  const s = slide('问题与建议：真实服务还缺三段连接', 16, '五 结果解释与建议 · 问题与建议');
  row(s, 175, '01', '穿戴设备', '接入设备 SDK、时间同步、断流检测及袖带血压离散读数');
  row(s, 297, '02', '联系人终端', '实现短信/电话送达、身份认证、逐人接管和失败重试');
  row(s, 419, '03', '急救协作', '确认当地流程与机构接口，再讨论真实自动呼救');
  text(s, '当前系统只有演示位置与模拟通知，不会真的拨打急救电话。', 83, 566, 1090, 66, 25, C.coral, true);
}

// 17 Risks
{
  const s = slide('两类关键风险与可执行的防护', 17, '五 结果解释与建议 · 风险识别与应对');
  pair(s, 83, 181, 500, '误报、漏报与延误', '质量门控和固定边界先行；模型故障回退；真实部署前开展临床与人因验证。', C.coral);
  pair(s, 662, 181, 500, '健康与位置隐私', '演示会话隔离；模型复核不发送位置；真实版需授权、加密、最小化与删除机制。', C.coral);
  rule(s, 83, 462, 1080, C.line, 1);
  text(s, '边界', 83, 505, 190, 45, 23, C.teal, true);
  text(s, '目前仅是比赛概念验证，未完成医疗软件合规、真实设备验证和院前急救合作。', 83, 557, 1090, 72, 26, C.ink, true);
}

// 18 Interaction interface
{
  const s = slide('应用交互：佩戴者与亲属在事件中给出回应', 18, '六 应用结果呈现 · 应用对话界面');
  text(s, '本人可选择固定按钮，也可输入简短文字；系统先给出理解结果，再由本人确认。', 82, 168, 1090, 62, 25);
  await addImage(s, 'demo-glass-wearer.png', 86, 245, 1090, 371, '佩戴者确认界面，包含我不舒服与我没事两个操作');
  caption(s, '受控词句匹配不能理解任意表达；确认前不推进事件，语音识别尚未接入。', 639, C.coral);
}

// 19 Prompts and link
{
  const s = slide('三个提示词任务与评委演示入口', 19, '六 应用结果呈现 · 提示词示例与链接');
  text(s, '① 基线：根据 14 天统计与历史证据，在允许范围内生成软阈值。', 83, 168, 1100, 48, 21, C.ink, true);
  text(s, '示例输出：resting.heartRateWarningUpper 候选值及规律摘要；代码校验后发布。', 105, 216, 1060, 58, 19, C.muted);
  rule(s, 83, 283, 1085, C.line, 1);
  text(s, '② 复核：阅读质量、持续秒数和趋势，只返回 ask / observe / uncertain。', 83, 300, 1100, 48, 21, C.ink, true);
  text(s, '示例输出：observe，建议一次 30 秒观察；异常仍持续则询问本人。', 105, 348, 1060, 58, 19, C.muted);
  rule(s, 83, 415, 1085, C.line, 1);
  text(s, '③ 文案：为已确定的事件写简短提醒，不改变接收者与计时。', 83, 431, 1100, 48, 21, C.ink, true);
  text(s, '示例输出：佩戴者表示不舒服，请主要亲属查看紧急事件卡。', 105, 478, 1060, 56, 19, C.muted);
  rule(s, 83, 546, 1085, C.teal, 2);
  text(s, '演示网址  https://anmai-production.up.railway.app', 83, 559, 1100, 50, 23, C.teal, true);
  caption(s, '当前托管服务已暂停；评审前需恢复部署并通过官方渠道提供访问链接。', 632, C.coral);
  s.speakerNotes.text = '提示词为代码中的任务约束摘要，示例输出取自 Fake 演示语义，不声称是本次 DeepSeek 实时调用。项目网址目前暂停；DeepSeek API Key 不放在 PPT。';
}

await fs.mkdir(previewDir, { recursive: true });
await fs.mkdir(outputDir, { recursive: true });
for (let i = 0; i < p.slides.items.length; i++) {
  const blob = await p.export({ slide: p.slides.items[i], format: 'png', scale: 1 });
  await fs.writeFile(path.join(previewDir, `slide-${String(i + 1).padStart(2, '0')}.png`), new Uint8Array(await blob.arrayBuffer()));
}
const draft = path.join(here, 'anmai-competition-draft.pptx');
await (await PresentationFile.exportPptx(p)).save(draft);
const { finalizePresentation } = await import(pathToFileURL(path.join(skillDir, 'container_tools', 'artifact_tool_utils.mjs')).href);
const finalPath = path.join(outputDir, '【医疗-南京邮电大学-宋奕霖-安脉Agent】.pptx');
const result = await finalizePresentation({
  workspaceDir: root,
  candidatePath: draft,
  finalPath,
  pythonExecutable: python,
  integrityValidatorPath: path.join(skillDir, 'container_tools', 'inspect_presentation_package_integrity.py'),
  layoutValidatorPath: path.join(skillDir, 'container_tools', 'inspect_presentation_layout_geometry.py'),
  layoutArgs: ['--expected-slide-size-emu', '12192000,6858000', '--validate-heading-fit'],
  fontPolicy: { basis: 'design', families: [FONT], scriptFonts: { ea: FONT } },
  verifyArtifactToolImport: true,
  receiptPath: path.join(here, 'competition-validation.json'),
});
console.log(JSON.stringify({ slides: p.slides.items.length, finalPath, result }, null, 2));
