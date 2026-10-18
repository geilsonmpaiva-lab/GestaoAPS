import { expect, it } from 'vitest';
import { isSameOriginRequest } from './request-origin';
it('accepts canonical origin and loopback reconstruction without trusting foreign origins', () => {
  expect(isSameOriginRequest(new Request('http://localhost:3104/api', { headers: { origin: 'http://127.0.0.1:3104', host: '127.0.0.1:3104' } }))).toBe(true);
  for (const origin of ['https://foreign.test', 'http://localhost:3105', 'null', 'https://localhost:3104', 'http://localhost:3104/']) expect(isSameOriginRequest(new Request('http://localhost:3104/api', { headers: { origin } }))).toBe(false);
  expect(isSameOriginRequest(new Request('https://sgc.test/api'), true)).toBe(false);
});
