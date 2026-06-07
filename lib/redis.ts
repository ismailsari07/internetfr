const REDIS_URL   = process.env.UPSTASH_REDIS_REST_REDIS_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function cmd(...args: (string | number)[]): Promise<unknown> {
  if (!REDIS_URL || !TOKEN) throw new Error('Upstash env vars not set');
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  const data = await res.json() as { result: unknown };
  return data.result;
}

export async function redisGet(key: string): Promise<string | null> {
  try {
    const result = await cmd('GET', key);
    return typeof result === 'string' ? result : null;
  } catch {
    return null;
  }
}

export async function redisSet(key: string, value: string, ttlSeconds: number): Promise<void> {
  try {
    await cmd('SET', key, value, 'EX', ttlSeconds);
  } catch {
    // silent — caching is best-effort
  }
}

// Returns the new counter value, or null on error.
export async function redisIncr(key: string, ttlSeconds: number): Promise<number | null> {
  try {
    const count = await cmd('INCR', key) as number;
    if (count === 1) await cmd('EXPIRE', key, ttlSeconds);
    return count;
  } catch {
    return null;
  }
}
