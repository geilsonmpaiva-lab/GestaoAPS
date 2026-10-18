/** Match scheme, host and port; Next may reconstruct a loopback Host as localhost. */
export function isSameOriginRequest(request: Request, required = false) {
  const origin = request.headers.get('origin');
  if (!origin) return !required;
  try {
    const source = new URL(origin), target = new URL(request.url);
    return source.origin === origin && (source.origin === target.origin || source.protocol === target.protocol && source.host === request.headers.get('host'));
  } catch { return false; }
}
