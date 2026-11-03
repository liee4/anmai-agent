import { afterEach, expect, it, vi } from 'vitest';
import { api } from './client.js';

afterEach(() => vi.unstubAllGlobals());

it('sends empty POST requests without a JSON content type', async () => {
  const fetch = vi.fn(async (_path: string, _options?: RequestInit) => new Response('{"resumed":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', fetch);

  await expect(api.resume('demo-wearer')).resolves.toEqual({ resumed: true });
  expect(fetch).toHaveBeenCalledWith('/api/baselines/demo-wearer/resume', expect.objectContaining({ method: 'POST' }));
  const request = fetch.mock.calls[0]?.[1];
  expect(request?.body).toBeUndefined();
  expect(new Headers(request?.headers).has('Content-Type')).toBe(false);
});
