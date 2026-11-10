# 安脉模拟原型：开放健康体征数据选型

> 2026-11-10 进展：已将 BIDMC v1.0.0 的 `bidmc_01`、`bidmc_21`、`bidmc_32` 三份 Numerics CSV 原样纳入代码，提供 35 秒窗口回放，分别展示平稳/缺测、高心率和低血氧测量。详见 [数据文件说明](../../apps/api/data/README.md)。下文“未下载”的陈述记录的是 2026-11-09 研究时点。

核查日期：2026-11-09。用途限定为**第一版演示与离线回放**，不是临床算法验证或真实高风险老年人预警性能证明。下文的“可直接下载”指数据发布页标为开放访问且给出文件入口；不代表本次已下载全量数据、核对每个文件或取得真实设备的授权。

## 结论

第一版建议用 **BIDMC + PPG-DaLiA + BUT PPG**：BIDMC 供同步 ECG、PPG、HR、SpO₂ 的短时多体征回放；PPG-DaLiA 供腕部 PPG 与加速度的活动/运动伪影片段；BUT PPG 供“信号质量差→暂缓解释、提示重测”的真实质量标签。三者都能在官方页直接下载，许可分别为 ODC-By、CC BY 4.0、CC BY 4.0。[BIDMC](https://physionet.org/content/bidmc/1.0.0/)；[PPG-DaLiA](https://archive.ics.uci.edu/dataset/495/ppg%2Bdalia)；[BUT PPG](https://physionet.org/content/butppg/2.0.0/)

血压只能作为**独立的袖带读数/离散时间点**展示：PPG-BP 每人三段 2.1 秒 PPG 与同次约 3 分钟采集阶段的一个袖带 BP 读数配对，不能充当连续血压、腕部血压或高血压急症真值。它的论文和数据入口可核实，但本次无法直接读取 Figshare 条目上的具体许可标识；公开展示原始波形前需复核该条目许可。[原始论文](https://pmc.ncbi.nlm.nih.gov/articles/PMC5827692/)；[作者给出的 Figshare 数据入口](https://doi.org/10.6084/m9.figshare.5459299.v5)

**没有一个已核查数据集**同时提供居家高风险老年人、腕部连续 PPG、SpO₂、血压、活动、信号质量及经临床裁定的跌倒/恶化事件。不能把不同人的片段拼成“同一患者真实轨迹”；跨数据集拼接只能标为模拟情景。这是基于下表各数据集官方字段和采集场景的归纳。[PPG-DaLiA](https://archive.ics.uci.edu/dataset/495/ppg%2Bdalia)；[BIDMC](https://physionet.org/content/bidmc/1.0.0/)；[BUT PPG](https://physionet.org/content/butppg/2.0.0/)；[VitalDB](https://vitaldb.net/dataset/)

## 数据集逐项核查

| 数据集 | 可直接下载与许可 | 样本、时长与字段 | 质量/事件标签及场景差异 | 第一版用途 |
|---|---|---|---|---|
| [PPG-DaLiA](https://archive.ics.uci.edu/dataset/495/ppg%2Bdalia) | UCI 官方提供 2.7 GB 下载；CC BY 4.0。 | 15 名受试者，约 36 小时（[原论文](https://pmc.ncbi.nlm.nih.gov/articles/PMC6679242/)）；腕部 BVP/PPG 64 Hz、加速度 32 Hz，胸部 ECG/呼吸/加速度 700 Hz；ECG 可作 HR 参考（[UCI](https://archive.ics.uci.edu/dataset/495/ppg%2Bdalia)）。 | 预设日常活动与运动伪影，原论文列有坐着、爬楼、骑行、驾车、午餐、步行、工作等活动；无官方 SpO₂、BP 或临床恶化/跌倒事件标签。受试者在活动方案下佩戴胸/腕设备，不能视为高风险老年人日常居家队列（[原论文](https://pmc.ncbi.nlm.nih.gov/articles/PMC6679242/)；[UCI](https://archive.ics.uci.edu/dataset/495/ppg%2Bdalia)）。 | 腕部 HR/活动回放、运动干扰与缺测处理；不把活动标签当疾病事件。 |
| [BIDMC PPG and Respiration v1.0.0](https://physionet.org/content/bidmc/1.0.0/) | PhysioNet 开放访问，ZIP 约 207.8 MB；ODC-By 1.0（[发布页](https://physionet.org/content/bidmc/1.0.0/)；[许可全文](https://physionet.org/content/bidmc/view-license/1.0.0/)）。 | 53 段、每段 8 分钟；同步 PPG、II 导 ECG、阻抗呼吸波形 125 Hz，HR、PR、RR、SpO₂ 数值 1 Hz，年龄/性别等固定字段（[发布页](https://physionet.org/content/bidmc/1.0.0/)）。 | 有两名标注者的**呼吸**人工标记；无活动、跌倒或经裁定恶化事件标签。数据来自危重患者住院监护，监护仪 PPG 不是腕戴设备（[发布页](https://physionet.org/content/bidmc/1.0.0/)）。 | 同步短时多体征离线回放，展示 SpO₂ 与 HR 的时间对齐；“告警”只能是演示规则触发。 |
| [MIMIC-III Waveform Database v1.0](https://physionet.org/content/mimic3wdb/1.0/) | **波形库本身**在 PhysioNet 标为开放访问、ODbL 1.0；可按记录读取，但全量约 6.7 TB（[发布页](https://physionet.org/content/mimic3wdb/1.0/)）。[Matched subset](https://physionet.org/content/mimic3wdb-matched/1.0/) 也标开放访问，约 2.4 TB，ODbL 1.0。 | 全库超过 67,000 段、超过 300 万小时，来自成人及新生儿 ICU 床旁监护；记录可含 ECG、PPG、呼吸及数字 HR、SpO₂、无创 BP 等，但通道随记录变化（[全库说明](https://physionet.org/content/mimic3wdb/1.0/)）。Matched subset 有 22,317 波形记录、22,247 数值记录、10,282 名 ICU 患者（[匹配子集](https://physionet.org/content/mimic3wdb-matched/1.0/)）。 | 波形/数字记录不是统一的已裁定异常事件标签；若要联结临床记录，MIMIC-III **Clinical Database** 只向合格研究者开放，不能把波形开放等同于临床表开放（[全库说明](https://physionet.org/content/mimic3wdb/1.0/)）。ICU、床旁设备与居家腕戴明显不同。 | 后续按单记录选取较长、缺失/噪声更真实的多参数回放；首版不下载全库。 |
| [PPG-BP](https://doi.org/10.6084/m9.figshare.5459299.v5) | 原论文指向公开 Figshare 下载；本次网页读取 Figshare 条目失败，**具体条目许可未能从第一手页面确认**。论文自身 CC BY 4.0 只说明论文许可，不能据此认定数据许可（[原论文](https://pmc.ncbi.nlm.nih.gov/articles/PMC5827692/)）。 | 219 名受试者、657 段指尖 PPG；每人 3 段，每段 2.1 秒、1 kHz；同次袖带 SBP/DBP，年龄及高血压/糖尿病等信息。论文摘要称 20–89 岁，正文描述实际纳入者为 21–86 岁；此处以实际纳入范围描述，不混称一致（[原论文](https://pmc.ncbi.nlm.nih.gov/articles/PMC5827692/)）。 | 采集时用偏度 SQI 筛掉低质波形，提供每段 SQI 值；疾病是个体状态，不是时间点急性事件。受控环境、指尖短片段、单次袖带值，不适合验证连续腕部 BP 或运动下测量（[原论文](https://pmc.ncbi.nlm.nih.gov/articles/PMC5827692/)）。 | 可选静态 BP/PPG 示例；许可复核后再在公开演示中使用其原始数据。 |
| [VitalDB](https://vitaldb.net/dataset/) | 官方开放数据页及[公开 API](https://api.vitaldb.net/)提供按 case 文件/轨道读取；开放数据官方文档称 CC BY 4.0（[条款](https://vitaldb.net/docs/?documentId=OpenDataset/Overview.md)）。旧站的[注册协议](https://vitaldb.net/registration-agreement/)仍写明网站服务需要同意条款，故应以实际开放数据/API 入口为准，不假设所有服务都免注册。 | 6,388 个外科手术 case；高分辨率 ECG、PLETH、动脉压波形最高 500 Hz，HR、SpO₂、无创/有创 BP 等数值约 1–7 秒间隔，具体轨道需逐 case 检查（[数据页及参数表](https://vitaldb.net/dataset/)）。 | 有手术、麻醉与诊疗上下文，并非居家活动/跌倒标签；麻醉与手术会改变生理状态。数据是手术室监护仪，不是可穿戴设备；官方也未将每个异常数值作为临床裁定事件或统一信号质量标签（[数据页](https://vitaldb.net/dataset/)）。 | 可选第二阶段较长多参数回放或数值缺失展示；必须逐轨筛选。 |
| [BUT PPG v2.0.0](https://physionet.org/content/butppg/2.0.0/) | PhysioNet 开放访问，ZIP 约 86.7 MB；CC BY 4.0（[发布页](https://physionet.org/content/butppg/2.0.0/)）。 | 50 人、3,888 条 10 秒手机相机 PPG，配参考 ECG/QRS/HR；多数有加速度，另有单值 BP、SpO₂ 与血糖标注（[发布页](https://physionet.org/content/butppg/2.0.0/)）。 | 每段有二元 PPG 质量标签（好/差，针对可靠 HR 估计）；包括静息及步行、咳嗽、说话、光照变化等扰动。手机指/耳 PPG 不是连续腕戴 PPG，单值 SpO₂/BP 也不是连续时序，未提供跌倒/临床恶化事件标签（[发布页](https://physionet.org/content/butppg/2.0.0/)）。 | 信号质量门控与重测提示的可解释片段。 |

## 推荐的离线回放设计

1. **真实片段层**：保留每段数据集名、版本、记录 ID、原采样率、原字段、许可和时间相对坐标；BIDMC 片段内只回放其确有的 HR/PR/SpO₂/PPG/ECG，PPG-DaLiA 片段内只回放 PPG/活动/加速度/参考 HR，BUT PPG 按 10 秒片段回放质量判断。字段与时长均据各官方页：[BIDMC](https://physionet.org/content/bidmc/1.0.0/)、[PPG-DaLiA](https://archive.ics.uci.edu/dataset/495/ppg%2Bdalia)、[BUT PPG](https://physionet.org/content/butppg/2.0.0/)。
2. **模拟情景层**：在 UI 标明“基于公开数据的模拟回放”；阈值告警、照护流程、通知时刻等由原型生成，保存为 `simulated`，不得描述成数据集的临床结局。呼吸人工标注仅归于 BIDMC 的呼吸任务；BUT 的二元标签仅归于 PPG 质量任务。[BIDMC](https://physionet.org/content/bidmc/1.0.0/)；[BUT PPG](https://physionet.org/content/butppg/2.0.0/)
3. **缺失与质量**：跨来源未提供的 SpO₂、BP、活动等字段显示“未采集”，不要插值出看似真实的测量值。运动干扰可取 PPG-DaLiA 的活动片段；质量好/差可取 BUT PPG 的原标签，但不能把一个来源的质量标签移植到另一个来源而宣称为真值。[PPG-DaLiA](https://archive.ics.uci.edu/dataset/495/ppg%2Bdalia)；[BUT PPG](https://physionet.org/content/butppg/2.0.0/)
4. **血压**：若要演示 BP，应作为某次袖带测量的离散记录，并明确来自 PPG-BP 或 VitalDB；不能由其它 PPG 波形自动推算“真实连续 BP”。PPG-BP 的读数对应采集时段而非每个 2.1 秒片段的逐搏真值。[PPG-BP 原论文](https://pmc.ncbi.nlm.nih.gov/articles/PMC5827692/)；[VitalDB 参数表](https://vitaldb.net/dataset/)

## 获取与许可边界

- UCI 的 PPG-DaLiA 与 PhysioNet 的 BIDMC、BUT PPG 页面均列明文件下载入口和许可；公开演示需保留数据集归属/许可链接，并按相应条款署名。[UCI](https://archive.ics.uci.edu/dataset/495/ppg%2Bdalia)；[BIDMC 许可](https://physionet.org/content/bidmc/view-license/1.0.0/)；[BUT PPG](https://physionet.org/content/butppg/2.0.0/)
- MIMIC-III **波形库**的开放许可与 MIMIC-III **临床库**的合格研究者访问不能混为一谈；后者若用于结局标签，另需按其访问流程办理。[波形库](https://physionet.org/content/mimic3wdb/1.0/)；[PhysioNet 访问说明](https://physionet.org/about/faqs/)
- PPG-BP 的 Figshare 条目在本次检索工具中返回访问错误，因此未从发布方核实**该数据版本的许可字段和下载可达性**；原论文可证实作者发布意图和数据入口，但不足以替代条目许可核查。[原论文](https://pmc.ncbi.nlm.nih.gov/articles/PMC5827692/)；[数据 DOI](https://doi.org/10.6084/m9.figshare.5459299.v5)
- 本次只审阅公开说明、原论文和许可页面，未下载/抽检原始文件，未验证每段信号的缺测率、质量、异常事件比例或实际适用于安脉目标人群的性能。因此“适合演示”仅指字段和回放素材匹配，不是算法有效性结论。[UCI](https://archive.ics.uci.edu/dataset/495/ppg%2Bdalia)；[PhysioNet BIDMC](https://physionet.org/content/bidmc/1.0.0/)；[VitalDB](https://vitaldb.net/dataset/)
