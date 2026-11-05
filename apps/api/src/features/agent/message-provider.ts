import type { EmergencyEvent, EventMessages } from '@anmai/contracts';

export type MessageContent = Pick<EventMessages, 'wearerPrompt' | 'relativeSummary' | 'emergencyScript'>;
export interface MessageProvider {
  compose(request: { event: EmergencyEvent; fallback: MessageContent }): Promise<MessageContent>;
}

export function fallbackMessages(event: EmergencyEvent): MessageContent {
  const wearerPrompt = event.risk.level === 'worsening' ? '检测到体征明显恶化，已联系亲属。请立即确认您现在的状态。' : '检测到体征持续异常。请确认您现在是否不舒服。';
  if (event.state === 'wearer_alert') return { wearerPrompt };
  if (event.state === 'primary_contact' || event.state === 'other_contacts') return { wearerPrompt, relativeSummary: `安脉模拟提醒：佩戴者出现${event.risk.level === 'worsening' ? '明显恶化' : '持续异常'}体征。请查看紧急事件卡与位置并尽快接管。` };
  if (event.state === 'simulated_call') return { emergencyScript: `这里是安脉健康监测系统。佩戴者出现持续异常体征且无人接管。位置：${event.location?.name ?? '尚无位置数据'}。此通话仅为模拟。` };
  return {};
}
