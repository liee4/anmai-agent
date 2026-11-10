# BIDMC 开放数据片段

`bidmc_01_Numerics.csv` 是 [PhysioNet BIDMC PPG and Respiration Dataset v1.0.0 的原始 CSV](https://physionet.org/content/bidmc/1.0.0/bidmc_csv/bidmc_01_Numerics.csv)，记录 ID 为 `bidmc_01`，下载于 2026-11-10。原始文件 7,644 字节，SHA-256：`27d43794cf2e7150db10e8bfe61d2bfdb26873a8f1629ffc5fbee5c9a4eb6ef5`。运行时会校验哈希，防止静默替换。

原始作者：Marco Pimentel、Alistair Johnson、Peter Charlton、David Clifton。数据许可：[Open Data Commons Attribution License v1.0](https://physionet.org/content/bidmc/view-license/1.0.0/)；数据集 DOI：[10.13026/C2208R](https://doi.org/10.13026/C2208R)。引用原论文：Pimentel 等，*Towards a Robust Estimation of Respiratory Rate from Pulse Oximeters*，IEEE TBME，2016，DOI [10.1109/TBME.2016.2613124](https://doi.org/10.1109/TBME.2016.2613124)。

此记录是住院患者的床旁监护数值，不是目标高风险老年人的居家腕戴数据。回放使用原始逐秒 HR、PULSE、RESP、SpO₂ 数值和相对秒数；原文件中的 `NaN` 保留为缺测。代码仅将 HR 与 SpO₂ 映射到演示时间交给现有规则判断；未提供的血压、活动、位置不补造，回放数据不进入 14 天个人基线。告警、亲属联系与呼救都是原型模拟，不能作为该数据集的临床结局。
