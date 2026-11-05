import type { RiskReviewDecision, RiskAssessment, VitalSample } from '@anmai/contracts';
import type { PersonalBaseline } from './risk-detector.js';

export interface RiskReviewRequest {
  wearerId: string;
  risk: RiskAssessment;
  latest: VitalSample;
  recent: Pick<VitalSample, 'timestamp' | 'heartRate' | 'spo2' | 'systolicBP' | 'activity' | 'deviceTrusted'>[];
  baselineVersion: number;
  baseline: PersonalBaseline;
}

export interface RiskReviewProvider {
  review(request: RiskReviewRequest): Promise<RiskReviewDecision>;
}
