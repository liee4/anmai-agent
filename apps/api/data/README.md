# BIDMC 开放数据片段

这三份文件来自 [PhysioNet BIDMC PPG and Respiration Dataset v1.0.0](https://physionet.org/content/bidmc/1.0.0/bidmc_csv/)，下载于 2026-11-10。运行时会校验 SHA-256；哈希也已与[官方校验表](https://physionet.org/files/bidmc/1.0.0/SHA256SUMS.txt)核对。

| 原始记录 | 演示用途 | 文件字节数 | SHA-256 |
| --- | --- | ---: | --- |
| `bidmc_01_Numerics.csv` | 平稳体征和血氧缺测 | 7,644 | `27d43794cf2e7150db10e8bfe61d2bfdb26873a8f1629ffc5fbee5c9a4eb6ef5` |
| `bidmc_21_Numerics.csv` | 持续较高心率 | 9,061 | `be4102f8b9aad57f2c286b0a3d7fbef55474234ea2c5ab769232dd6fd13e51f6` |
| `bidmc_32_Numerics.csv` | 持续较低血氧 | 7,619 | `1a9bb8fdde296519c2a265a2e73fab2e6b74ad63080960cdf0afbbb5668fd232` |

原始作者：Marco Pimentel、Alistair Johnson、Peter Charlton、David Clifton。数据许可：[Open Data Commons Attribution License v1.0](https://physionet.org/content/bidmc/view-license/1.0.0/)；数据集 DOI：[10.13026/C2208R](https://doi.org/10.13026/C2208R)。引用原论文：Pimentel 等，*Towards a Robust Estimation of Respiratory Rate from Pulse Oximeters*，IEEE TBME，2016，DOI [10.1109/TBME.2016.2613124](https://doi.org/10.1109/TBME.2016.2613124)。

这些记录是住院患者的床旁监护数值，不是目标高风险老年人的居家腕戴数据。每条只有约 8 分钟，不能构成 14 天个人基线。回放使用原始逐秒 HR、PULSE、RESP、SpO₂ 数值和相对秒数；原文件中的 `NaN` 保留为缺测。代码仅将 HR 与 SpO₂ 映射到演示时间交给现有规则判断；未提供的血压、活动、位置不补造，回放数据不进入个人基线。`bidmc_21` 与 `bidmc_32` 的测量值可触发演示固定安全边界，但告警、亲属联系与呼救都是原型模拟，不能作为该数据集的临床结局。
