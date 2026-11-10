export type WearerTextInterpretation = {
  intent: 'unwell' | 'safe' | 'uncertain';
  suggestedAction: 'wearer_unwell' | 'wearer_safe' | null;
  summary: string;
};

const discomfort = /不舒服|难受|胸痛|胸闷|胸口痛|心脏.{0,4}(?:疼|痛)|心口.{0,4}(?:疼|痛)|呼吸困难|喘不过气|头晕|晕厥|昏厥|心慌|说话不清|单侧无力|手脚无力|需要亲属|帮我联系/;
const explicitSafe = /^(?:我)?(?:现在|目前)?(?:没事|没有不舒服|感觉正常|一切正常)$/;

export function validateWearerText(text: string): string {
  if (typeof text !== 'string' || !text.trim()) throw new Error('Text cannot be empty');
  if (text.length > 200) throw new Error('Text is too long');
  return text.trim();
}

export function wearerTextDecision(intent: WearerTextInterpretation['intent']): WearerTextInterpretation {
  if (intent === 'unwell') return { intent, suggestedAction: 'wearer_unwell', summary: '理解为身体不舒服；请确认是否立即联系亲属。' };
  if (intent === 'safe') return { intent, suggestedAction: 'wearer_safe', summary: '理解为目前没事；请确认是否结束本次提醒并继续后台检测。' };
  return { intent: 'uncertain', suggestedAction: null, summary: '未能明确理解，请使用下方固定选项或直接求助。' };
}

export function interpretWearerText(text: string): WearerTextInterpretation {
  const normalized = validateWearerText(text).replace(/[\s，。！？,.!?]/g, '');
  const withoutNegatedSymptoms = normalized.replace(/(?:没有|无|不)(?:胸痛|胸闷|胸口痛|心脏.{0,4}(?:疼|痛)|心口.{0,4}(?:疼|痛)|头晕|心慌|不舒服|难受)/g, '');
  if (discomfort.test(withoutNegatedSymptoms)) return wearerTextDecision('unwell');
  if (explicitSafe.test(normalized)) return { intent: 'safe', suggestedAction: 'wearer_safe', summary: '理解为目前没事；请确认是否结束本次提醒并继续后台检测。' };
  return wearerTextDecision('uncertain');
}
