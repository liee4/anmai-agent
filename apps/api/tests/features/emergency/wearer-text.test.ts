import { expect, it } from 'vitest';
import { interpretWearerText } from '../../../src/features/emergency/wearer-text.js';

it('offers a confirmation for clear discomfort and gives discomfort priority over reassurance', () => {
  expect(interpretWearerText('胸口不舒服')).toMatchObject({ intent: 'unwell', suggestedAction: 'wearer_unwell' });
  expect(interpretWearerText('我没事，但有点胸痛')).toMatchObject({ intent: 'unwell', suggestedAction: 'wearer_unwell' });
  expect(interpretWearerText('心脏有点疼')).toMatchObject({ intent: 'unwell', suggestedAction: 'wearer_unwell' });
  expect(interpretWearerText('我没事，但是心口有些疼')).toMatchObject({ intent: 'unwell', suggestedAction: 'wearer_unwell' });
});

it('only recognizes a short explicit safe phrase and leaves ambiguous text unclassified', () => {
  expect(interpretWearerText('我没事')).toMatchObject({ intent: 'safe', suggestedAction: 'wearer_safe' });
  expect(interpretWearerText('可能没事吧')).toMatchObject({ intent: 'uncertain', suggestedAction: null });
  expect(interpretWearerText('暂时不清楚')).toMatchObject({ intent: 'uncertain', suggestedAction: null });
  expect(interpretWearerText('没有胸痛')).toMatchObject({ intent: 'uncertain', suggestedAction: null });
  expect(interpretWearerText('我没有胸痛但头晕')).toMatchObject({ intent: 'unwell', suggestedAction: 'wearer_unwell' });
  expect(() => interpretWearerText(' '.repeat(201))).toThrow(/empty/i);
  expect(() => interpretWearerText('a'.repeat(201))).toThrow(/long/i);
});
