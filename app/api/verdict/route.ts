import { getVerdict } from '@/lib/ai';
import { redisGet, redisSet, redisIncr } from '@/lib/redis';

// ── CACHE / RATE-LIMIT CONSTANTS ─────────────────────────────────────────────
const VERDICT_TTL   = 604_800; // 7 days in seconds
const RATELIMIT_TTL =  86_400; // 24 hours in seconds
const RATELIMIT_MAX = 1;       // max AI calls per IP per day

// ── SPEED TIERS ───────────────────────────────────────────────────────────────
// Edit labels, descriptions, or thresholds here. getBucketKey() picks the
// first tier where the speed is below `maxMbps` (last entry has no upper bound).
// `description` is what gets passed to the AI prompt — qualitative, no numbers.
const SPEED_TIERS: { label: string; maxMbps: number; description: string }[] = [
  { label: 'tres_lent',   maxMbps: 5,        description: 'très lente'   },
  { label: 'lent',        maxMbps: 25,       description: 'lente'        },
  { label: 'moyen',       maxMbps: 75,       description: 'correcte'     },
  { label: 'rapide',      maxMbps: 200,      description: 'rapide'       },
  { label: 'tres_rapide', maxMbps: 500,      description: 'très rapide'  },
  { label: 'ultra',       maxMbps: Infinity, description: 'excellente'   },
];

function getTier(speedMbps: number) {
  return SPEED_TIERS.find(t => speedMbps < t.maxMbps) ?? SPEED_TIERS.at(-1)!;
}

function normalizeIsp(isp: string): string {
  return isp
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, '_');
}

function getBucketKey(speedMbps: number, isp: string): string {
  return `verdict:${getTier(speedMbps).label}:${normalizeIsp(isp)}`;
}

// ─────────────────────────────────────────────────────────────────────────────

const FALLBACK =
  "Votre connexion a bien été testée. Pour naviguer en toute sécurité, pensez à utiliser un VPN afin de masquer votre adresse IP des regards indiscrets.";

export async function POST(request: Request) {
  try {
    const body  = await request.json();
    const speed: number = typeof body.speed === 'number' ? body.speed : 0;
    const isp:   string = typeof body.isp   === 'string' && body.isp ? body.isp : 'ISP inconnu';

    const bucketKey = getBucketKey(speed, isp);

    // ── 1. Cache check — serve immediately, skip AI + rate-limit ─────────────
    try {
      const cached = await redisGet(bucketKey);
      if (cached) return Response.json({ verdict: cached });
    } catch {
      // Redis unavailable — continue to AI call
    }

    // ── 2. Rate-limit (only gates cache misses) ───────────────────────────────
    const forwarded = request.headers.get('x-forwarded-for');
    const realIp    = request.headers.get('x-real-ip');
    const clientIp  = forwarded ? forwarded.split(',')[0].trim() : (realIp ?? 'unknown');
    const rlKey     = `ratelimit:${clientIp}`;

    try {
      const current = await redisGet(rlKey);
      if (current !== null && Number(current) >= RATELIMIT_MAX) {
        return Response.json({ verdict: FALLBACK });
      }
    } catch {
      // Redis unavailable — allow the call
    }

    // ── 3. AI call ────────────────────────────────────────────────────────────
    const verdict = await getVerdict(getTier(speed).description, isp);

    // ── 4. Store in cache + increment rate-limit counter ─────────────────────
    try {
      await redisSet(bucketKey, verdict, VERDICT_TTL);
      await redisIncr(rlKey, RATELIMIT_TTL);
    } catch {
      // best-effort — never let storage failure break the response
    }

    return Response.json({ verdict });
  } catch {
    return Response.json({ verdict: FALLBACK });
  }
}
