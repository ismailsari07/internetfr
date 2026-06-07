export async function GET(request: Request) {
  // Forward the real client IP so ipapi.co resolves their location, not the server's.
  // x-forwarded-for is set by Vercel / nginx / any reverse proxy in production.
  // Falls back to the server's own IP in local dev (acceptable).
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const clientIp = forwarded ? forwarded.split(',')[0].trim() : (realIp ?? null);

  const apiUrl = clientIp
    ? `https://ipwho.is/${clientIp}`
    : 'https://ipwho.is/';

  console.log('[lookup] clientIp:', clientIp ?? '(none)', '| apiUrl:', apiUrl); // DEBUG

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch(apiUrl, { signal: controller.signal });
    clearTimeout(timeout);

    const rawText = await res.text();
    console.log('[lookup] ipwho.is status:', res.status, '| body:', rawText); // DEBUG

    const data = JSON.parse(rawText);
    if (!res.ok || data.success === false) throw new Error('ipwho.is lookup failed');

    return Response.json({
      ip:      (data.ip                                          as string | undefined) ?? null,
      isp:     (data.connection?.isp ?? data.connection?.org    as string | undefined) ?? null,
      city:    (data.city                                        as string | undefined) ?? null,
      country: (data.country                                     as string | undefined) ?? null,
    });
  } catch {
    clearTimeout(timeout);
    return Response.json({ ip: null, isp: null, city: null, country: null });
  }
}
