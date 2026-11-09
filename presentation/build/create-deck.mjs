import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Presentation, PresentationFile } from '@oai/artifact-tool';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outputDir = path.join(root, 'output');
const previewDir = path.join(here, 'previews');
const skillDir = 'C:\\Users\\lieyi\\.codex\\plugins\\cache\\openai-primary-runtime\\presentations\\26.1105.12137\\skills\\presentations';
const python = 'C:\\Users\\lieyi\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe';
process.env.RUNTIME_NODE_MODULES = 'C:\\Users\\lieyi\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules';
const W = 1280, H = 720;
const C = { bg: '#F5F7F6', ink: '#142B32', muted: '#50666C', teal: '#0A687A', light: '#DDE9E9', line: '#B6CCCD', coral: '#B65C44', white: '#FFFFFF' };
const FONT = 'Noto Sans SC';
const p = Presentation.create({ slideSize: { width: W, height: H } });

function text(slide, value, x, y, w, h, size = 25, color = C.ink, bold = false) {
  const shape = slide.shapes.add({ geometry: 'textbox', position: { left: x, top: y, width: w, height: h }, fill: 'none', line: { style: 'solid', fill: 'none', width: 0 } });
  shape.text = value;
  shape.text.style = { typeface: FONT, fontSize: size, color, bold, wrap: true };
  return shape;
}
function rule(slide, x, y, w, color = C.line, height = 2) {
  slide.shapes.add({ geometry: 'rect', position: { left: x, top: y, width: w, height }, fill: color, line: { style: 'solid', fill: color, width: 0 } });
}
function slide(title, no, notes = '') {
  const s = p.slides.add();
  s.background.fill = C.bg;
  text(s, title, 74, 50, 1132, 65, 36, C.ink, true);
  rule(s, 76, 126, 1128, C.teal, 3);
  text(s, String(no).padStart(2, '0'), 1154, 675, 50, 22, 15, C.muted);
  if (notes) s.speakerNotes.text = notes;
  return s;
}
function block(s, x, y, w, label, body, { bodySize = 25, color = C.teal } = {}) {
  text(s, label, x, y, w, 44, 21, color, true);
  text(s, body, x, y + 53, w, 148, bodySize, C.ink);
}
function row(s, y, num, title, body, x = 84, width = 1110) {
  text(s, num, x, y, 76, 48, 30, C.teal, true);
  text(s, title, x + 80, y, 285, 48, 27, C.ink, true);
  text(s, body, x + 377, y + 2, width - 377, 88, 23, C.muted);
  rule(s, x, y + 94, width, C.line, 1);
}
async function addImage(s, filename, x, y, w, h) {
  const bytes = await fs.readFile(path.join(root, 'assets', filename));
  s.images.add({ blob: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), contentType: 'image/png', alt: '安脉本地原型界面截图', fit: 'contain', position: { left: x, top: y, width: w, height: h } });
}

// 1. Cover
{
  const s = p.slides.add(); s.background.fill = C.ink;
  text(s, '安脉 Agent', 84, 140, 900, 94, 64, C.white, true);
  text(s, '面向高风险独处老年人的异常体征响应', 86, 258, 1040, 78, 35, '#E4F0F0');
  rule(s, 88, 370, 215, '#6AB0B8', 5);
  text(s, '从体征异常到佩戴者确认、亲属接管与模拟呼救', 86, 415, 1050, 70, 26, C.white);
  text(s, '通用赛道 · 医疗健康 · 模拟数据原型', 86, 610, 1000, 40, 20, '#BFD5D7');
  s.speakerNotes.text = '开场用一句话解释产品：安脉把体征异常后的确认与联系人协同做成可追踪的 Agent 流。当前为模拟数据原型，不进行真实诊断或呼救。';
}
// 2. Problem
{
  const s = slide('异常被发现以后，谁来响应？', 2);
  text(s, '独处老人出现持续异常时，单一阈值报警无法回答三个关键问题。', 80, 165, 1110, 70, 28);
  row(s, 278, '01', '是真异常吗', '运动、设备松动和短时波动会制造误报');
  row(s, 390, '02', '本人能回应吗', '只有数值提醒，可能停在无人处理的状态');
  row(s, 502, '03', '亲属能接管吗', '紧急信息需要在正确时点交给合适的人');
}
// 3. Product flow
{
  const s = slide('安脉的响应链路', 3);
  const steps = [
    ['接收体征', '心率、血氧、离散血压、活动状态'],
    ['判定风险', '质量门控与持续时间形成证据'],
    ['询问佩戴者', '本人反馈优先进入决策'],
    ['联系亲属', '主要亲属、其他亲属依次接管'],
    ['模拟呼救', '无人接管时展示位置与事件卡'],
  ];
  steps.forEach((a, i) => { const y=165+i*99; text(s, String(i+1).padStart(2,'0'), 80,y,70,50,28,C.teal,true); text(s,a[0],170,y,290,50,29,C.ink,true); text(s,a[1],500,y+3,700,60,23,C.muted); if(i<4)rule(s,80,y+84,1110,C.line,1); });
  s.speakerNotes.text = '强调“先本人、后亲属、再模拟呼救”。明显恶化和固定安全边界有快速升级分支；真实电话尚未接入。';
}
// 4. Data
{
  const s = slide('数据来源：先用模拟流跑通，再接真实片段', 4, '公开数据候选来源：BIDMC https://physionet.org/content/bidmc/1.0.0/；PPG-DaLiA https://archive.ics.uci.edu/dataset/495/ppg%2Bdalia；BUT PPG https://physionet.org/content/butppg/2.0.0/。本项目目前只完成官方资料选型，未下载并验证原始记录。');
  block(s, 78, 172, 500, '当前演示', '可重复的模拟逐秒体征与 14 天历史数据', {bodySize:28});
  block(s, 655, 172, 520, '下一步离线回放', '选择开放数据中的真实心率、血氧和信号质量片段', {bodySize:28});
  rule(s, 78, 414, 1096, C.line, 1);
  text(s, '候选来源', 80, 443, 250, 48, 23, C.teal, true);
  text(s, 'BIDMC：同步多体征　　PPG-DaLiA：腕部活动干扰　　BUT PPG：信号质量标签', 80, 502, 1096, 102, 24);
  text(s, '不同数据集不能拼成同一位患者的真实病程。', 80, 622, 1070, 40, 20, C.coral, true);
}
// 5. Preprocess
{
  const s = slide('一处输入，兼容逐日积累和历史批量导入', 5);
  text(s, '页面只有一个数据入口；内部按覆盖自然日自动分流到两个 Adapter。', 80, 170, 1100, 70, 26);
  row(s, 275, 'A', '逐日采集', '每日保存、检查质量，攒满完整 14 天周期');
  row(s, 397, 'B', '历史导入', '一次传入多日数据，按日期整理后进入同一流程');
  text(s, '共同输出：分钟聚合、每日总结、排除原因、基线资格', 82, 555, 1100, 66, 28, C.teal, true);
}
// 6. Memory
{
  const s = slide('个人基线：14 天周期与跨周期记忆', 6);
  text(s, '本地统计形成观察基线；模型根据长期规律提出个性化软阈值候选。', 80, 168, 1110, 70, 27);
  text(s, '60%', 84, 288, 200, 90, 56, C.teal, true); text(s, '最新 14 天', 84, 375, 280, 45, 22, C.ink, true);
  text(s, '30%', 478, 288, 200, 90, 56, C.teal, true); text(s, '近期历史基线', 478, 375, 300, 45, 22, C.ink, true);
  text(s, '10%', 880, 288, 200, 90, 56, C.teal, true); text(s, '长期摘要', 880, 375, 260, 45, 22, C.ink, true);
  rule(s, 80, 475, 1110, C.line, 1);
  text(s, '异常且佩戴者表示不舒服时，基线学习暂停；本人确认恢复后才重启。', 80, 520, 1110, 90, 28, C.coral, true);
  s.speakerNotes.text = '记忆包避免 API 无跨调用记忆的问题；权重来自项目设计，不是临床参数。旧版本滚动保留 12 个月。';
}
// 7. Risk evidence
{
  const s = slide('风险判断改为逐项证据，不使用综合分数', 7);
  row(s, 172, '01', '数据是否可信', '逐通道检查缺失、冲突与不合理读数');
  row(s, 278, '02', '偏离是否持续', '按自然秒统计覆盖和异常时长，不按采样条数');
  row(s, 384, '03', '是否达到边界', '固定安全边界优先，个人基线只调软预警');
  row(s, 490, '04', '趋势是否恶化', '相邻时间窗比较，达到条件即提升等级');
  text(s, '输出：风险等级 + 数据质量 + 覆盖时间 + 异常证据 + 原因', 82, 616, 1100, 43, 23, C.teal, true);
  s.speakerNotes.text = '这是工程演示规则，不是临床阈值。分层证据减少原加减分机制的权重任意性，也让每次升级可以审计。';
}
// 8. Agent loop
{
  const s = slide('Agent 主循环：看状态、选工具、等待反馈、再判断', 8);
  text(s, '目标', 80, 177, 180, 48, 22, C.teal, true); text(s, '让异常事件有人接管，并避免无效打扰', 300, 177, 840, 60, 29, C.ink, true);
  rule(s, 80, 251, 1110, C.line, 1);
  row(s, 283, '1', '观察', '接收体征、读取基线与事件状态');
  row(s, 386, '2', '行动', '调用质量检查、风险复核、提醒与联系人工具');
  row(s, 489, '3', '反馈', '等待佩戴者与亲属回应，按截止时间重新决策');
  text(s, '状态机控制应急升级；模型只在限定节点给出候选结论。', 82, 615, 1100, 44, 23, C.coral, true);
}
// 9. Models
{
  const s = slide('DeepSeek 参与三个明确任务', 9);
  row(s, 180, '01', '生成软阈值', '接收 14 天统计与历史记忆包，候选必须通过代码校验');
  row(s, 302, '02', '复核普通异常', '接收最近 60 秒精简特征和证据，返回询问或一次观察');
  row(s, 424, '03', '组织事件文案', '生成佩戴者提醒、亲属摘要和模拟呼救文案');
  text(s, '固定安全边界、明显恶化、倒计时和升级均由代码执行。', 82, 582, 1100, 70, 27, C.teal, true);
  s.speakerNotes.text = '评委可在页面一键切换 Fake 与 DeepSeek，三个模型功能一起切换。DeepSeek 复核输入不带佩戴者身份和位置。模型失败时主流程安全回退。';
}
// 10. Human in loop
{
  const s = slide('人工反馈直接改变下一步动作', 10);
  block(s, 80, 179, 460, '佩戴者：我没事', '停止当前提醒，继续后台监测；持续异常再复查，明显恶化重新升级。', {bodySize:26});
  block(s, 675, 179, 500, '佩戴者：我不舒服', '立即联系主要亲属，并暂停基线学习。', {bodySize:26, color:C.coral});
  rule(s, 80, 431, 1095, C.line, 1);
  text(s, '无人回应：默认 60 秒后联系主要亲属；主要亲属、其他亲属各等待 30 秒。', 80, 479, 1100, 114, 27, C.ink, true);
  text(s, '等待时间可在事件开始前配置。', 80, 613, 950, 39, 21, C.muted);
}
// 11. Ordinary anomaly screenshot
{
  const s = slide('界面示例：普通异常先复核，再询问本人', 11);
  await addImage(s, 'demo-main-screenshot.png', 150, 157, 980, 484);
  s.speakerNotes.text = '本页为本地原型真实截图，使用 Fake 模型演示。心率持续异常 30/30 秒，模型建议一次限时观察，佩戴者可随时主动请求亲属。';
}
// 12. Relative screenshot
{
  const s = slide('界面示例：本人表示不舒服，亲属立即接管', 12);
  await addImage(s, 'demo-relative-screenshot.png', 150, 157, 980, 484);
  s.speakerNotes.text = '本页为本地原型真实截图。页面显示当前体征、本人反馈、模拟位置与亲属接管按钮；电话尚未真实拨出。';
}
// 13. Innovation/value
{
  const s = slide('创新点与应用价值', 13);
  block(s, 80, 180, 480, '把“异常”变成可接管的事件', '持续读取状态，按人工反馈和截止时间推进任务。', {bodySize:27});
  block(s, 670, 180, 500, '用分层证据解释每一步', '数据质量、持续时间、固定边界和个人基线分别展示。', {bodySize:27});
  rule(s, 80, 455, 1090, C.line, 1);
  text(s, '面向独居老人及家庭照护：减少无效提醒，缩短无人响应时的升级链路。', 80, 512, 1090, 110, 29, C.teal, true);
  s.speakerNotes.text = '这里讲的是产品目标与设计上的潜在价值，不宣称已测得临床误报率或救治时间改善。';
}
// 14. Verification
{
  const s = slide('当前验证：原型流程可重复，临床效果仍待研究', 14);
  text(s, '133', 85, 188, 280, 100, 68, C.teal, true); text(s, '自动测试通过', 85, 289, 360, 53, 25, C.ink);
  text(s, '8', 505, 188, 180, 100, 68, C.teal, true); text(s, '浏览器全流程测试', 505, 289, 350, 53, 25, C.ink);
  text(s, '3', 870, 188, 180, 100, 68, C.teal, true); text(s, '模型任务可切换', 870, 289, 320, 53, 25, C.ink);
  rule(s, 80, 402, 1100, C.line, 1);
  text(s, '已覆盖：持续时间、乱序/高频采样、恶化升级、亲属接管、重启恢复。', 80, 457, 1100, 85, 27);
  text(s, '尚未完成：真实设备接入、开放数据回放、临床阈值与人因验证。', 80, 566, 1100, 80, 26, C.coral, true);
}
// 15. Risks
{
  const s = slide('风险与保护边界', 15);
  row(s, 181, '01', '误报或漏报', '质量门控、固定边界和人工反馈共同约束；临床验证仍必要');
  row(s, 306, '02', '健康与位置隐私', '模型复核只收精简匿名特征；亲属联系阶段才共享位置');
  row(s, 431, '03', '接口失败', '模型超时转入安全回退，状态与截止时间持久化');
  text(s, '当前所有通知与呼救均为模拟，不接入真实急救体系。', 82, 590, 1090, 63, 27, C.coral, true);
}
// 16. Roadmap
{
  const s = slide('下一阶段的三项实用改进', 16);
  row(s, 182, '01', '替换基线模型', '用公开数据与后续合规数据比较候选模型，保留 Provider 接口');
  row(s, 305, '02', '接入真实设备', '连接腕戴心率/血氧与袖带血压，建立传感器质量校验');
  row(s, 428, '03', '验证真实服务', '开展临床阈值、人因、通知送达与机构协作评估');
  text(s, '每一步都保留可追溯证据，再决定是否扩大真实应用。', 82, 588, 1100, 62, 27, C.teal, true);
}
// 17. Prompt and link
{
  const s = slide('模型任务示例与演示入口', 17);
  text(s, '① 基线提示：总结 14 天统计与历史规律。\n示例输出：软阈值候选和理由，交由代码逐字段校验。', 80, 161, 1110, 84, 22);
  text(s, '② 复核提示：评估最近 60 秒异常证据。\n示例输出：observe，一次限时 30 秒观察。', 80, 252, 1110, 84, 22);
  text(s, '③ 文案提示：说明已确认事件和本人反馈。\n示例输出：佩戴者表示不舒服，请主要亲属查看事件卡。', 80, 343, 1110, 84, 22);
  rule(s, 80, 449, 1110, C.line, 1);
  text(s, '演示地址', 80, 479, 230, 48, 22, C.teal, true);
  text(s, 'https://anmai-production.up.railway.app', 80, 531, 1060, 57, 29, C.ink, true);
  text(s, '当前已暂停托管服务；比赛演示前需恢复部署并提供评委访问凭证。', 80, 613, 1100, 47, 20, C.coral);
  s.speakerNotes.text = '这三个示例分别对应 Baseline、RiskReview 和 Message Provider。页面目前是按钮引导的情景演示，不提供自由聊天输入。评委访问链接包含单独凭证，由参赛者提交时提供，不应把 DeepSeek API Key 写入 PPT。';
}

await fs.mkdir(previewDir, { recursive: true });
await fs.mkdir(outputDir, { recursive: true });
for (let i = 0; i < p.slides.items.length; i++) {
  const blob = await p.export({ slide: p.slides.items[i], format: 'png', scale: 1 });
  await fs.writeFile(path.join(previewDir, `slide-${String(i+1).padStart(2,'0')}.png`), new Uint8Array(await blob.arrayBuffer()));
}
const draft = path.join(here, 'anmai-deck-draft.pptx');
await (await PresentationFile.exportPptx(p)).save(draft);
const { finalizePresentation } = await import(pathToFileURL(path.join(skillDir, 'container_tools', 'artifact_tool_utils.mjs')).href);
const finalPath = path.join(outputDir, '安脉-Agent-赛事答辩-v3.pptx');
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
  receiptPath: path.join(here, 'validation-v3.json'),
});
console.log(JSON.stringify({ slides: p.slides.items.length, finalPath, result }, null, 2));
