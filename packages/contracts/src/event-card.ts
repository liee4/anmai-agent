import type { VitalSample } from './vitals.js';

export interface EventCard {
  eventId: string;
  name: string | null;
  age: number | null;
  medicalHistory: string | null;
  allergies: string | null;
  latest: VitalSample | null;
  trend: { heartRateDelta: number | null; spo2Delta: number | null; systolicBPDelta: number | null };
  wearerFeedback: string;
}
export interface EventMessages {
  wearerPrompt?: string;
  relativeSummary?: string;
  emergencyScript?: string;
  provider: string;
  status: 'pending' | 'generated' | 'fallback';
}
