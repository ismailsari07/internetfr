export async function GET(request: Request) {
  // Forward the real client IP so ip-api.com resolves their location, not the server's.
  // x-forwarded-for is set by Vercel / nginx / any reverse proxy in production.
  // Falls back to auto-detect in local dev (acceptable).
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const clientIp = forwarded ? forwarded.split(',')[0].trim() : (realIp ?? null);

  const fields = 'status,message,query,isp,org,city,country';
  const apiUrl = clientIp
    ? `http://ip-api.com/json/${clientIp}?fields=${fields}`
    : `http://ip-api.com/json/?fields=${fields}`;

  console.log('[lookup] clientIp:', clientIp ?? '(none)', '| apiUrl:', apiUrl); // DEBUG

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch(apiUrl, { signal: controller.signal });
    clearTimeout(timeout);

    const rawText = await res.text();
    console.log('[lookup] ip-api.com status:', res.status, '| body:', rawText); // DEBUG

    const data = JSON.parse(rawText);
    if (!res.ok || data.status !== 'success') throw new Error('ip-api.com lookup failed');

    return Response.json({
      ip:      (data.query              as string | undefined) ?? null,
      isp:     (data.isp ?? data.org    as string | undefined) ?? null,
      city:    (data.city               as string | undefined) ?? null,
      country: (data.country            as string | undefined) ?? null,
    });
  } catch {
    clearTimeout(timeout);
    return Response.json({ ip: null, isp: null, city: null, country: null });
  }
}
