# 安脉原型的可追溯解释知识层

版本 `2026-11-10.1`。代码目录为 `apps/api/src/features/knowledge/evidence-library.ts`，接口 `GET /api/knowledge` 返回条目和版本。当前仅做**来源核对**，尚未经过临床专家审核；条目帮助普通异常复核模型解释测量局限、提示询问本人症状，不参与阈值、状态机、通知顺序或自动呼救决策。

| 条目 | 官方来源 | 在原型中的用途 |
| --- | --- | --- |
| 心脏急症应结合本人症状 | [国家卫生健康委员会 2025-11-21 新闻发布会](https://www.nhc.gov.cn/xcs/c100122/202511/b622555670fa4f2388eb35f1c339195f.shtml) | 心率异常时提醒模型不要仅凭心率推断心梗，保留本人症状询问。 |
| 血氧读数需结合测量条件与症状 | [FDA Pulse Oximeters](https://www.fda.gov/medical-devices/products-and-medical-procedures/pulse-oximeters) | 血氧异常或设备数据不可信时解释测量局限；不导入新血氧阈值。 |
| 卒中症状需本人或旁人报告 | [国家卫生健康委员会脑血管病防治指南](https://www.nhc.gov.cn/ylyjs/zcwj/202412/ba037e931fff4870930f65ff667ea9ed/files/1736390751587_80714.pdf) | 仅在知识目录展示，暂不自动匹配心率或血氧异常，因为现有输入没有面部、肢体、言语等症状字段。 |

普通异常的 `RiskReviewService` 按风险原因读取相关条目，发送给当前 Fake/DeepSeek 复核 Provider；页面显示相同来源。DeepSeek 的系统提示明确要求不得从缺失症状推断疾病，也不得根据知识条目修改固定阈值或直接调用亲属与急救工具。下一步需要临床专家逐条审核中文摘要和适用场景，再建立来源更新、失效与审计流程。
