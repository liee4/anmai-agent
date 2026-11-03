import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

export function EventTimeline({ eventId, stateVersion }: { eventId: string; stateVersion: number }) {
  const [entries, setEntries] = useState<{ at: string; kind: string; detail: string }[]>([]);
  useEffect(() => { void api.timeline(eventId).then(setEntries); }, [eventId, stateVersion]);
  return <div className="timeline"><h3>事件时间线</h3><ol>{entries.map((entry, index) => <li key={`${entry.at}-${index}`}><time dateTime={entry.at}>{new Date(entry.at).toLocaleTimeString('zh-CN', { hour12: false })}</time><span>{entry.detail}</span></li>)}</ol></div>;
}
