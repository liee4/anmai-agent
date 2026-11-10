import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { VitalSample } from '@anmai/contracts';

export interface BidmcRow {
  second: number;
  heartRate?: number;
  pulseRate?: number;
  respiratoryRate?: number;
  spo2?: number;
}

const source = {
  dataset: 'BIDMC PPG and Respiration Dataset',
  version: '1.0.0',
  recordId: 'bidmc_01',
  originalSamplingHz: 1,
  setting: 'hospital bedside monitor',
  license: 'Open Data Commons Attribution License v1.0',
  url: 'https://physionet.org/content/bidmc/1.0.0/bidmc_csv/bidmc_01_Numerics.csv',
  sha256: '27d43794cf2e7150db10e8bfe61d2bfdb26873a8f1629ffc5fbee5c9a4eb6ef5',
} as const;

function numeric(value: string, field: string, line: number): number | undefined {
  const trimmed = value.trim();
  if (trimmed === 'NaN' || trimmed === '') return undefined;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid ${field} on line ${line}`);
  return parsed;
}

export function parseBidmcNumerics(csv: string): BidmcRow[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.shift()?.trim() !== 'Time [s], HR, PULSE, RESP, SpO2') throw new Error('Invalid BIDMC header');
  return lines.map((line, index) => {
    const fields = line.split(',');
    if (fields.length !== 5) throw new Error(`Invalid BIDMC row on line ${index + 2}`);
    const second = Number(fields[0]);
    if (!Number.isInteger(second) || second !== index) throw new Error(`Invalid BIDMC time sequence on line ${index + 2}`);
    const heartRate = numeric(fields[1]!, 'HR', index + 2);
    const pulseRate = numeric(fields[2]!, 'PULSE', index + 2);
    const respiratoryRate = numeric(fields[3]!, 'RESP', index + 2);
    const spo2 = numeric(fields[4]!, 'SpO2', index + 2);
    return { second, ...(heartRate === undefined ? {} : { heartRate }), ...(pulseRate === undefined ? {} : { pulseRate }), ...(respiratoryRate === undefined ? {} : { respiratoryRate }), ...(spo2 === undefined ? {} : { spo2 }) };
  });
}

const dataUrl = new URL('../../../data/bidmc_01_Numerics.csv', import.meta.url);
const rawFile = readFileSync(dataUrl);
if (createHash('sha256').update(rawFile).digest('hex') !== source.sha256) throw new Error('BIDMC source file checksum mismatch');
export const bidmcRecord = { source, rows: parseBidmcNumerics(rawFile.toString('utf8')) };

const extraChecksums = {
  '21': 'be4102f8b9aad57f2c286b0a3d7fbef55474234ea2c5ab769232dd6fd13e51f6',
  '32': '1a9bb8fdde296519c2a265a2e73fab2e6b74ad63080960cdf0afbbb5668fd232',
} as const;
export type BidmcRecordId = '01' | keyof typeof extraChecksums;
export function isBidmcRecordId(value: string): value is BidmcRecordId { return value === '01' || value in extraChecksums; }

const extraRecords = Object.fromEntries(Object.entries(extraChecksums).map(([id, sha256]) => {
  const bytes = readFileSync(new URL(`../../../data/bidmc_${id}_Numerics.csv`, import.meta.url));
  if (createHash('sha256').update(bytes).digest('hex') !== sha256) throw new Error(`BIDMC ${id} source file checksum mismatch`);
  return [id, { source: { ...source, recordId: `bidmc_${id}`, url: `https://physionet.org/content/bidmc/1.0.0/bidmc_csv/bidmc_${id}_Numerics.csv`, sha256 }, rows: parseBidmcNumerics(bytes.toString('utf8')) }];
})) as Record<keyof typeof extraChecksums, { source: { recordId: string; url: string; sha256: string; dataset: string; version: string; originalSamplingHz: number; setting: string; license: string }; rows: BidmcRow[] }>;

export function replayBidmcWindow(startSecond: number, endingAt: Date, recordId: BidmcRecordId = '01') {
  const record = recordId === '01' ? bidmcRecord : extraRecords[recordId];
  if (!Number.isInteger(startSecond) || startSecond < 0 || startSecond + 35 > record.rows.length) throw new Error('Invalid startSecond');
  const rows = record.rows.slice(startSecond, startSecond + 35);
  const samples = rows.map((row, index): VitalSample => ({
    timestamp: new Date(endingAt.getTime() - (34 - index) * 1000).toISOString(),
    ...(row.heartRate === undefined ? {} : { heartRate: row.heartRate }),
    ...(row.spo2 === undefined ? {} : { spo2: row.spo2 }),
    activity: 'unknown',
  }));
  return { source: record.source, rows, samples, replayedAt: endingAt.toISOString() };
}
