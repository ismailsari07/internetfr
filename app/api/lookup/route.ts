export async function GET(request: Request) {
  // Forward the real client IP so ipapi.co resolves their location, not the server's.
  // x-forwarded-for is set by Vercel / nginx / any reverse proxy in production.
  // Falls back to the server's own IP in local dev (acceptable).
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const clientIp = forwarded ? forwarded.split(',')[0].trim() : (realIp ?? null);

  const apiUrl = clientIp
    ? `https://ipapi.co/${clientIp}/json/`
    : 'https://ipapi.co/json/';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch(apiUrl, { signal: controller.signal });
    clearTimeout(timeout);

    const data = await res.json();
    if (!res.ok) throw new Error(`ipapi.co ${res.status}`);

    return Response.json({
      ip:      (data.ip         as string | undefined) ?? null,
      isp:     (data.org        as string | undefined) ?? null, // "AS13335 Cloudflare, Inc."
      city:    (data.city       as string | undefined) ?? null,
      country: (data.country_name as string | undefined) ?? null,
    });
  } catch {
    clearTimeout(timeout);
    return Response.json({ ip: null, isp: null, city: null, country: null });
  }
}
