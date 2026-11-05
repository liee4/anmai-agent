import type { ContactDelivery, EmergencyEvent, EventCard, EventMessages } from '@anmai/contracts';

const statusText: Record<ContactDelivery['status'], string> = { delivered: '已送达', delivery_failed: '送达失败', declined: '无法接管', taken_over: '已接管', timeout: '超时' };
function signed(value: number | null, unit: string): string { return value === null ? '未能计算' : `${value > 0 ? '+' : ''}${value}${unit}`; }

export function EmergencyCard({ event, card, contacts, messages }: { event: EmergencyEvent; card: EventCard | null; contacts: ContactDelivery[]; messages: EventMessages | null }) {
  const latest = card?.latest;
  return <div className="event-card"><h3>紧急事件卡</h3><dl>
    <dt>事件编号</dt><dd>{event.eventId.slice(0, 8)}</dd>
    <dt>姓名</dt><dd>{card?.name ?? '未登记'}</dd><dt>年龄</dt><dd>{card?.age ?? '未登记'}</dd>
    <dt>最新体征</dt><dd>{latest ? `${latest.heartRate ?? '—'} 次/分 · 血氧 ${latest.spo2 ?? '—'}% · 血压 ${latest.systolicBP ?? '—'}/${latest.diastolicBP ?? '—'} mmHg` : '暂无可用数据'}</dd>
    <dt>采样时间</dt><dd>{latest ? new Date(latest.timestamp).toLocaleString('zh-CN') : '未登记'}</dd>
    <dt>近期趋势</dt><dd>心率 {signed(card?.trend.heartRateDelta ?? null, ' 次/分')} · 血氧 {signed(card?.trend.spo2Delta ?? null, '%')}</dd>
    <dt>佩戴者反馈</dt><dd>{card?.wearerFeedback ?? '未回应'}</dd>
    <dt>病史</dt><dd>{card?.medicalHistory ?? '未登记'}</dd><dt>过敏</dt><dd>{card?.allergies ?? '未登记'}</dd>
    <dt>位置</dt><dd>{event.state === 'wearer_alert' || event.state === 'safe_recheck' ? '进入亲属联系阶段后共享' : event.location?.name ?? '未登记'}</dd>
  </dl>
    {contacts.length > 0 && <div className="contact-list"><strong>模拟联系记录</strong>{contacts.map(contact => <div key={contact.contactId}><span>{contact.label}</span><span>{statusText[contact.status]} · {contact.attempts} 次</span></div>)}</div>}
    {messages?.relativeSummary && <p className="relative-summary">亲属提示：{messages.relativeSummary}</p>}
    <p>亲属接管后可根据事件卡自行联系急救服务。</p>
    {event.state === 'simulated_call' && messages?.emergencyScript && <p className="simulation-script">模拟自动呼救播报：{messages.emergencyScript}</p>}
  </div>;
}
