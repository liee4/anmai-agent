import type { RiskAssessment } from '@anmai/contracts';

export interface KnowledgeExcerpt {
  id: string;
  version: string;
  title: string;
  summary: string;
  sourcePublisher: string;
  sourceUrl: string;
  reviewStatus: 'source_verified_pending_clinical_review';
}

export const knowledgeCatalog: readonly KnowledgeExcerpt[] = [
  {
    id: 'heart-symptoms', version: '2026-11-10.1', title: '心脏急症应结合本人症状',
    summary: '胸痛、心悸、呼吸困难、头晕、大汗或极度乏力等感受需要由本人描述；不能仅凭心率数值推断心梗。若本人报告严重胸痛，应尽快寻求当地急救帮助。',
    sourcePublisher: '国家卫生健康委员会',
    sourceUrl: 'https://www.nhc.gov.cn/xcs/c100122/202511/b622555670fa4f2388eb35f1c339195f.shtml',
    reviewStatus: 'source_verified_pending_clinical_review',
  },
  {
    id: 'oximeter-limitations', version: '2026-11-10.1', title: '血氧读数需结合测量条件与症状',
    summary: '脉搏血氧仪读数会受循环状态、皮肤色素及其他测量条件影响；不能只依赖单次读数，应关注本人症状和变化。此条目不提供新的血氧告警阈值。',
    sourcePublisher: '美国食品药品监督管理局（FDA）',
    sourceUrl: 'https://www.fda.gov/medical-devices/products-and-medical-procedures/pulse-oximeters',
    reviewStatus: 'source_verified_pending_clinical_review',
  },
  {
    id: 'stroke-symptoms', version: '2026-11-10.1', title: '卒中症状需本人或旁人报告',
    summary: '突发面部不对称、单侧肢体无力或言语不清等是卒中识别线索；现有心率、血氧数据不能检测这些症状。若有人观察到上述突发症状，应拨打当地急救电话。',
    sourcePublisher: '国家卫生健康委员会',
    sourceUrl: 'https://www.nhc.gov.cn/ylyjs/zcwj/202412/ba037e931fff4870930f65ff667ea9ed/files/1736390751587_80714.pdf',
    reviewStatus: 'source_verified_pending_clinical_review',
  },
];

export function knowledgeForRisk(risk: RiskAssessment | null): KnowledgeExcerpt[] {
  if (!risk) return [];
  const reasons = new Set(risk.reasons);
  const selected: KnowledgeExcerpt[] = [];
  if (['heart_rate_persistent', 'fixed_heart_rate_high', 'fixed_heart_rate_low'].some(reason => reasons.has(reason))) selected.push(knowledgeCatalog[0]!);
  if (['spo2_persistent', 'fixed_spo2_low', 'device_untrusted_or_invalid', 'insufficient_recent_samples'].some(reason => reasons.has(reason))) selected.push(knowledgeCatalog[1]!);
  return selected;
}
