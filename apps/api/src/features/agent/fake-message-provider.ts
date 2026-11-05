import type { MessageProvider } from './message-provider.js';

export class FakeMessageProvider implements MessageProvider {
  async compose(request: Parameters<MessageProvider['compose']>[0]) { return request.fallback; }
}
