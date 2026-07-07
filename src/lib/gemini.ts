const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

const MODEL_FALLBACKS = [
  'gemini-2.0-flash',
  'gemini-2.5-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
];

export function isGeminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export function geminiModelName() {
  return process.env.GEMINI_MODEL?.trim() || MODEL_FALLBACKS[0];
}

function modelCandidates() {
  const preferred = geminiModelName();
  return [preferred, ...MODEL_FALLBACKS.filter((m) => m !== preferred)];
}

function apiKey() {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error('gemini_not_configured');
  return key;
}

type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

type GeminiChatTurn = { role: 'user' | 'model'; text: string };

async function callGemini(
  model: string,
  body: Record<string, unknown>,
) {
  const url = `${GEMINI_BASE}/models/${model}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey(),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    return { ok: false as const, status: res.status, error: `gemini_http_${res.status}:${errBody.slice(0, 240)}` };
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) return { ok: false as const, status: 200, error: 'gemini_empty_response' };
  return { ok: true as const, text };
}

/** Native Gemini REST — compatible with Google AI Studio keys via x-goog-api-key */
export async function generateGeminiText(prompt: string, opts?: { json?: boolean; temperature?: number }) {
  return generateGeminiContent([{ text: prompt }], opts);
}

export async function generateGeminiChat(
  systemInstruction: string,
  turns: GeminiChatTurn[],
  opts?: { json?: boolean; temperature?: number },
) {
  let lastErr = 'gemini_failed';
  const contents = turns.map((t) => ({
    role: t.role,
    parts: [{ text: t.text }],
  }));

  const baseBody = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents,
    generationConfig: {
      temperature: opts?.temperature ?? 0.75,
      ...(opts?.json ? { responseMimeType: 'application/json' } : {}),
    },
  };

  for (const model of modelCandidates()) {
    const result = await callGemini(model, baseBody);
    if (result.ok) return result.text;
    lastErr = result.error;
    if (result.status === 404 || result.status === 400 || result.error === 'gemini_empty_response') continue;
    throw new Error(lastErr);
  }

  throw new Error(lastErr);
}

/** Quick connectivity probe for deploy / health checks */
export async function probeGemini() {
  const text = await generateGeminiText('Responde solo: ok', { temperature: 0 });
  return text.toLowerCase().includes('ok');
}

export async function generateGeminiContent(
  parts: GeminiPart[],
  opts?: { json?: boolean; temperature?: number },
) {
  let lastErr = 'gemini_failed';

  for (const model of modelCandidates()) {
    const result = await callGemini(model, {
      contents: [{ parts }],
      generationConfig: {
        temperature: opts?.temperature ?? 0.6,
        ...(opts?.json ? { responseMimeType: 'application/json' } : {}),
      },
    });
    if (result.ok) return result.text;
    lastErr = result.error;
    if (result.status === 404 || result.status === 400 || result.error === 'gemini_empty_response') continue;
    throw new Error(lastErr);
  }

  throw new Error(lastErr);
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

/** Match uploaded service photo to an existing service name */
export async function matchServiceFromImage(
  base64: string,
  mimeType: string,
  serviceNames: string[],
  userHint?: string,
) {
  const list = serviceNames.map((n) => `"${n}"`).join(', ');
  const hint = userHint?.trim() ? `\nEl usuario dijo: "${userHint.trim()}"` : '';
  const prompt = `Esta foto es de un servicio de belleza/barbería/salón.
Servicios del catálogo: [${list}]${hint}
Responde SOLO JSON: {"serviceName":"nombre exacto del catálogo o null","confidence":"high|low","note":"frase corta"}
Si no coincide con ninguno, serviceName=null.`;

  const text = await generateGeminiContent(
    [
      { text: prompt },
      { inlineData: { mimeType: mimeType || 'image/jpeg', data: base64 } },
    ],
    { json: true, temperature: 0.2 },
  );

  const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  const parsed = JSON.parse(cleaned) as { serviceName?: string | null; note?: string; confidence?: string };
  const raw = String(parsed.serviceName || '').trim();
  if (!raw) return { serviceName: null, note: String(parsed.note || '').trim() };

  const match = serviceNames.find((n) => n.toLowerCase() === raw.toLowerCase())
    || serviceNames.find((n) => n.toLowerCase().includes(raw.toLowerCase()) || raw.toLowerCase().includes(n.toLowerCase()));

  return {
    serviceName: match || null,
    note: String(parsed.note || '').trim(),
    confidence: parsed.confidence || 'low',
  };
}
