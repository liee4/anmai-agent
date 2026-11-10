import type { RiskAssessment } from '@anmai/contracts';
import type { WearerTextInterpretation } from './wearer-text.js';

export interface WearerTextRequest {
  wearerId: string;
  text: string;
  risk: RiskAssessment;
}

export interface WearerTextProvider {
  interpret(request: WearerTextRequest): Promise<WearerTextInterpretation>;
}
