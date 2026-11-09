import type { RiskReviewDecision, RiskAssessment, VitalSample } from '@anmai/contracts';
import type { PersonalBaseline } from './risk-detector.js';

export interface RiskReviewRequest {
  wearerId: string;
  risk: RiskAssessment;
  latest: ReviewVital;
  recent: ReviewVital[];
  baselineVersion: number;
  baseline: PersonalBaseline;
}

export type ReviewVital = Pick<VitalSample, 'timestamp' | 'heartRate' | 'spo2' | 'systolicBP' | 'diastolicBP' | 'activity' | 'deviceTrusted'>;

export interface RiskReviewProvider {
  review(request: RiskReviewRequest): Promise<RiskReviewDecision>;
}
