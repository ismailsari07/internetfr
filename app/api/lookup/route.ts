import { redisGet, redisSet } from '@/lib/redis';

const LOOKUP_TTL = 86_400; // 24 hours in seconds

export async function GET(request: Request) {
  // Forward the real client IP so ip-api.com resolves their location, not the server's.
  // x-forwarded-for is set by Vercel / nginx / any reverse proxy in production.
  // Falls back to auto-detect in local dev (acceptable).
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const clientIp = forwarded ? forwarded.split(',')[0].trim() : (realIp ?? null);

  // ── Cache check (skip when no client IP — auto-detect result is server-specific) ──
  if (clientIp) {
    try {
      const cached = await redisGet(`lookup:${clientIp}`);
      if (cached) return Response.json(JSON.parse(cached));
    } catch {
      // Redis unavailable — fall through to ip-api.com
    }
  }

  const fields = 'status,message,query,isp,org,city,country';
  const apiUrl = clientIp
    ? `http://ip-api.com/json/${clientIp}?fields=${fields}`
    : `http://ip-api.com/json/?fields=${fields}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch(apiUrl, { signal: controller.signal });
    clearTimeout(timeout);

    const data = await res.json();
    if (!res.ok || data.status !== 'success') throw new Error('ip-api.com lookup failed');

    const result = {
      ip:      (data.query           as string | undefined) ?? null,
      isp:     (data.isp ?? data.org as string | undefined) ?? null,
      city:    (data.city            as string | undefined) ?? null,
      country: (data.country         as string | undefined) ?? null,
    };

    // Store in cache only when we have a real client IP
    if (clientIp) {
      try {
        await redisSet(`lookup:${clientIp}`, JSON.stringify(result), LOOKUP_TTL);
      } catch {
        // best-effort — never let storage failure break the response
      }
    }

    return Response.json(result);
  } catch {
    clearTimeout(timeout);
    return Response.json({ ip: null, isp: null, city: null, country: null });
  }
}
