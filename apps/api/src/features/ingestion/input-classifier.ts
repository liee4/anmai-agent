import type { IngestRequest } from '@anmai/contracts';

export function classifyInput(request: IngestRequest): 'daily' | 'historical' {
  if (request.inputMode !== 'auto') return request.inputMode;
  const dates = new Set(request.data.map(sample => sample.timestamp.slice(0, 10)));
  return dates.size === 1 ? 'daily' : 'historical';
}
