import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { ContextSchema, ExclusionReasonSchema, TimestampSchema } from './common.js';

export const LocationSchema = Type.Object({ name: Type.String({ minLength: 1 }), latitude: Type.Number({ minimum: -90, maximum: 90 }), longitude: Type.Number({ minimum: -180, maximum: 180 }) }, { additionalProperties: false });
export const VitalSampleSchema = Type.Object({
  timestamp: TimestampSchema,
  heartRate: Type.Optional(Type.Number({ minimum: 0 })),
  spo2: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
  systolicBP: Type.Optional(Type.Number({ minimum: 0 })),
  diastolicBP: Type.Optional(Type.Number({ minimum: 0 })),
  activity: Type.Union([ContextSchema, Type.Literal('unknown')]),
  location: Type.Optional(LocationSchema),
  deviceTrusted: Type.Optional(Type.Boolean()),
}, { additionalProperties: false });
export type VitalSample = Static<typeof VitalSampleSchema>;
export const IngestRequestSchema = Type.Object({ inputMode: Type.Union([Type.Literal('auto'), Type.Literal('daily'), Type.Literal('historical')]), wearerId: Type.String({ minLength: 1 }), data: Type.Array(VitalSampleSchema, { minItems: 1 }) }, { additionalProperties: false });
export type IngestRequest = Static<typeof IngestRequestSchema>;
export const IngestResultSchema = Type.Object({ detectedMode: Type.Union([Type.Literal('daily'), Type.Literal('historical')]), coveredDays: Type.Integer({ minimum: 1 }), successfulDays: Type.Integer({ minimum: 0 }), invalidDays: Type.Integer({ minimum: 0 }), duplicateSamples: Type.Integer({ minimum: 0 }), excludedSamples: Type.Integer({ minimum: 0 }), completedCycles: Type.Integer({ minimum: 0 }), modelCalls: Type.Integer({ minimum: 0 }), baselineVersion: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]) }, { additionalProperties: false });
export type IngestResult = Static<typeof IngestResultSchema>;
export const DailySummarySchema = Type.Object({ wearerId: Type.String(), date: Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' }), coverageHours: Type.Number({ minimum: 0 }), qualityRate: Type.Number({ minimum: 0, maximum: 1 }), restingHours: Type.Number({ minimum: 0 }), baselineEligible: Type.Boolean(), exclusionReasons: Type.Array(ExclusionReasonSchema) }, { additionalProperties: false });
export type DailySummary = Static<typeof DailySummarySchema>;

export function parseIngestRequest(input: unknown): IngestRequest {
  if (!Value.Check(IngestRequestSchema, input)) {
    const first = [...Value.Errors(IngestRequestSchema, input)][0];
    throw new Error(`Invalid ingest request: ${first?.path || 'unknown'} ${first?.message || 'unknown field'}`);
  }
  for (const item of input.data) {
    if (Number.isNaN(Date.parse(item.timestamp))) throw new Error('Invalid timestamp');
    if (item.systolicBP !== undefined && item.diastolicBP !== undefined && item.systolicBP <= item.diastolicBP) throw new Error('Invalid blood pressure pair');
  }
  return input;
}
