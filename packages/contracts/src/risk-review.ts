import { Type, type Static } from '@sinclair/typebox';

export const RiskReviewDecisionSchema = Type.Object({
  decision: Type.Union([Type.Literal('ask'), Type.Literal('observe'), Type.Literal('uncertain')]),
  reason: Type.String({ minLength: 1, maxLength: 240 }),
}, { additionalProperties: false });
export type RiskReviewDecision = Static<typeof RiskReviewDecisionSchema>;

export interface RiskReviewSnapshot {
  status: 'pending' | 'observe' | 'asked' | 'cancelled' | 'closed';
  provider: string;
  decision: RiskReviewDecision['decision'] | null;
  reason: string | null;
  deadlineAt: string | null;
  fallbackReason: string | null;
}
