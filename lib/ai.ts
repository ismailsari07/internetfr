// ── AI PROVIDER CONFIG ──────────────────────────────────────────────────────
// Provider : Groq (OpenAI-compatible)
// Model    : llama-3.3-70b-versatile
// To switch provider: replace the implementation of getVerdict() below.
//   The route (app/api/verdict/route.ts) calls only this function and never
//   touches the provider directly. Change MODEL/ENDPOINT/body shape here only.
// ────────────────────────────────────────────────────────────────────────────

const MODEL    = 'llama-3.3-70b-versatile';
const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

const FALLBACK =
  "Votre connexion a bien été testée. Pour naviguer en toute sécurité, pensez à utiliser un VPN afin de masquer votre adresse IP des regards indiscrets.";

function buildPrompt(quality: string, isp: string): string {
  return (
    `Qualité de la connexion : ${quality}. Fournisseur : ${isp}.\n\n` +
    `Rédigez exactement 2 phrases en français, en vouvoyant l'utilisateur. ` +
    `Chaque phrase : 15 mots maximum. Total : 30 mots maximum. ` +
    `Phrase 1 : commentez la qualité de la connexion en termes qualitatifs — ` +
    `n'utilisez AUCUN chiffre ni valeur en Mbps. ` +
    `Phrase 2 : conseil bref pour masquer son adresse IP ou utiliser un VPN. ` +
    `Aucun détail superflu, aucun remplissage.`
  );
}

export async function getVerdict(quality: string, isp: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return FALLBACK;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: 'Réponds en français. Vouvoie l\'utilisateur. Maximum 2 phrases courtes. Aucun remplissage.' },
          { role: 'user', content: buildPrompt(quality, isp) },
        ],
        max_tokens: 80,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return FALLBACK;

    const data = await res.json();
    const text: string | undefined = data?.choices?.[0]?.message?.content;
    return text?.trim() || FALLBACK;
  } catch {
    clearTimeout(timeout);
    return FALLBACK;
  }
}
