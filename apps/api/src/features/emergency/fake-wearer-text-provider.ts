import { interpretWearerText } from './wearer-text.js';
import type { WearerTextProvider } from './wearer-text-provider.js';

export class FakeWearerTextProvider implements WearerTextProvider {
  async interpret(request: Parameters<WearerTextProvider['interpret']>[0]) {
    return interpretWearerText(request.text);
  }
}
