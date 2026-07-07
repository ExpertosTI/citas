import { GoogleGenAI } from '@google/genai';

/** Stable Gemini 3 models (Jul 2026). See https://ai.google.dev/gemini-api/docs/models */
const MODEL_FALLBACKS = [
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-3-flash',
  'gemini-2.5-flash',
];

export function isGeminiConfigured() {
  return Boolean((process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '').trim());
}

export function geminiModelName() {
  return process.env.GEMINI_MODEL?.trim() || MODEL_FALLBACKS[0];
}

function modelCandidates() {
  const preferred = geminiModelName();
  return [preferred, ...MODEL_FALLBACKS.filter((m) => m !== preferred)];
}

function apiKeyRaw() {
  return (process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '').trim();
}

function apiKey() {
  const key = apiKeyRaw();
  if (!key) throw new Error('gemini_not_configured');
  if (key.startsWith('gemini-')) {
    throw new Error('gemini_key_looks_like_model: GEMINI_API_KEY contiene un nombre de modelo, no la clave');
  }
  return key;
}

let client: GoogleGenAI | null = null;

function getClient() {
  if (!client) client = new GoogleGenAI({ apiKey: apiKey() });
  return client;
}

type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

type GeminiChatTurn = { role: 'user' | 'model'; text: string };

type CallResult =
  | { ok: true; text: string }
  | { ok: false; status: number; error: string };

function errStatus(err: unknown) {
  const e = err as { status?: number; code?: number };
  return Number(e?.status || e?.code || 500);
}

function errMessage(err: unknown) {
  if (err instanceof Error) return err.message;
  return String(err);
}

async function callGemini(
  model: string,
  body: {
    systemInstruction?: string;
    contents: unknown;
    json?: boolean;
    temperature?: number;
  },
): Promise<CallResult> {
  try {
    const response = await getClient().models.generateContent({
      model,
      contents: body.contents as never,
      config: {
        systemInstruction: body.systemInstruction,
        temperature: body.temperature,
        ...(body.json ? { responseMimeType: 'application/json' } : {}),
      },
    });
    const text = response.text?.trim();
    if (!text) return { ok: false, status: 200, error: 'gemini_empty_response' };
    return { ok: true, text };
  } catch (err) {
    const status = errStatus(err);
    return {
      ok: false,
      status,
      error: `gemini_http_${status}:${errMessage(err).slice(0, 200)}`,
    };
  }
}

/** Google Gen AI SDK — soporta claves AIza (legacy) y AQ.* (auth keys, 2026) */
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

  for (const model of modelCandidates()) {
    const result = await callGemini(model, {
      systemInstruction,
      contents,
      json: opts?.json,
      temperature: opts?.temperature ?? 0.75,
    });
    if (result.ok) return result.text;
    lastErr = result.error;
    if (result.status === 404 || result.status === 400 || result.error === 'gemini_empty_response') continue;
    if (result.status === 401 || result.status === 403) throw new Error(lastErr);
  }

  throw new Error(lastErr);
}

/** Quick connectivity probe for deploy / health checks */
export async function probeGemini() {
  const result = await probeGeminiStatus();
  return result.live;
}

export async function probeGeminiStatus(): Promise<{ live: boolean; error?: string }> {
  try {
    const text = await generateGeminiText('Responde solo: ok', { temperature: 0 });
    return { live: text.toLowerCase().includes('ok') };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'gemini_failed';
    const code = msg.match(/gemini_http_(\d+)/)?.[1] || 'error';
    return { live: false, error: `http_${code}` };
  }
}

export async function generateGeminiContent(
  parts: GeminiPart[],
  opts?: { json?: boolean; temperature?: number },
) {
  let lastErr = 'gemini_failed';

  for (const model of modelCandidates()) {
    const result = await callGemini(model, {
      contents: [{ parts }],
      json: opts?.json,
      temperature: opts?.temperature ?? 0.6,
    });
    if (result.ok) return result.text;
    lastErr = result.error;
    if (result.status === 404 || result.status === 400 || result.error === 'gemini_empty_response') continue;
    if (result.status === 401 || result.status === 403) throw new Error(lastErr);
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
