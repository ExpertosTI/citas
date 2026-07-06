const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export function isGeminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export function geminiModelName() {
  return process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
}

function apiKey() {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error('gemini_not_configured');
  return key;
}

/** Native Gemini REST — compatible with AQ.* auth keys via x-goog-api-key */
export async function generateGeminiText(prompt: string, opts?: { json?: boolean; temperature?: number }) {
  return generateGeminiContent([{ text: prompt }], opts);
}

type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

export async function generateGeminiContent(
  parts: GeminiPart[],
  opts?: { json?: boolean; temperature?: number },
) {
  const model = geminiModelName();
  const url = `${GEMINI_BASE}/models/${model}:generateContent`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey(),
    },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        temperature: opts?.temperature ?? 0.6,
        ...(opts?.json ? { responseMimeType: 'application/json' } : {}),
      },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`gemini_http_${res.status}:${errBody.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error('gemini_empty_response');
  return text;
}

/** Analyze logo image — suggest accent hex and short brand note */
export async function analyzeLogoImage(base64: string, mimeType: string) {
  const prompt = `Analiza este logo de un negocio de belleza/barbería en Latinoamérica.
Responde SOLO JSON: {"accentColor":"#hex6","note":"una frase corta sobre el estilo visual (máx 20 palabras)"}
El accentColor debe ser un color dominante o complementario del logo, formato #RRGGBB.`;

  const text = await generateGeminiContent(
    [
      { text: prompt },
      { inlineData: { mimeType: mimeType || 'image/png', data: base64 } },
    ],
    { json: true, temperature: 0.3 },
  );

  const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  const parsed = JSON.parse(cleaned) as { accentColor?: string; note?: string };
  const hex = String(parsed.accentColor || '').trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  return { accentColor: hex, note: String(parsed.note || '').trim() };
}
