import { parseIngestRequest, type IngestRequest, type VitalSample } from '@anmai/contracts';

export interface NormalizedSample extends VitalSample { instant: string; localDate: string; minute: string }

export function normalizeInput(input: unknown): { request: IngestRequest; samples: NormalizedSample[] } {
  const request = parseIngestRequest(input);
  const samples = request.data.map(sample => ({
    ...sample,
    instant: new Date(sample.timestamp).toISOString(),
    localDate: sample.timestamp.slice(0, 10),
    minute: new Date(sample.timestamp).toISOString().slice(0, 16) + ':00Z',
  }));
  samples.sort((a, b) => a.instant.localeCompare(b.instant));
  return { request, samples };
}
