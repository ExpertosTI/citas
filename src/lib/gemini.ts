import { ApiError, GoogleGenAI, type Part } from '@google/genai';

/**
 * Modelos vigentes — ver codegen_instructions.md de @google/genai
 * https://github.com/googleapis/js-genai/blob/main/codegen_instructions.md
 */
const MODEL_FALLBACKS = [
  'gemini-3-flash-preview',
  'gemini-3.5-flash',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
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

function keyMeta() {
  const key = process.env.GEMINI_API_KEY?.trim() || '';
  return {
    length: key.length,
    type: key.startsWith('AQ.') ? 'auth' : key.startsWith('AIza') ? 'standard' : key ? 'custom' : 'missing',
  };
}

let client: GoogleGenAI | null = null;
let clientKey = '';

/** SDK oficial: lee GEMINI_API_KEY del entorno con `new GoogleGenAI({})` */
function getClient() {
  const key = process.env.GEMINI_API_KEY?.trim() || '';
  if (!key) throw new Error('gemini_not_configured');
  if (key.startsWith('gemini-')) {
    throw new Error('gemini_key_looks_like_model');
  }

  const project = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  const useVertex =
    process.env.GOOGLE_GENAI_VERTEX === 'true' || process.env.GOOGLE_GENAI_USE_VERTEXAI === 'true';
  if (useVertex && project) {
    return new GoogleGenAI({
      vertexai: true,
      project,
      location: process.env.GOOGLE_CLOUD_LOCATION?.trim() || 'us-central1',
    });
  }

  if (!client || clientKey !== key) {
    client = new GoogleGenAI({ apiKey: key });
    clientKey = key;
  }
  return client;
}

type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

type GeminiChatTurn = { role: 'user' | 'model'; text: string };

type CallResult =
  | { ok: true; text: string }
  | { ok: false; status: number; error: string };

function toParts(parts: GeminiPart[]): Part[] {
  return parts.map((p) => {
    if ('text' in p) return { text: p.text };
    return { inlineData: { mimeType: p.inlineData.mimeType, data: p.inlineData.data } };
  });
}

function parseError(err: unknown): { status: number; message: string } {
  if (err instanceof ApiError) {
    return { status: err.status || 500, message: err.message };
  }
  const e = err as { status?: number; message?: string };
  return {
    status: Number(e?.status || 500),
    message: e?.message || String(err),
  };
}

function apiKey() {
  return process.env.GEMINI_API_KEY?.trim() || '';
}

function isAuthKey() {
  return apiKey().startsWith('AQ.');
}

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

function extractGenerateText(payload: {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}) {
  return (
    payload.candidates?.[0]?.content?.parts
      ?.map((p) => p.text || '')
      .join('')
      .trim() || ''
  );
}

async function callGenerateHttp(
  model: string,
  contents: Array<{ role: string; parts: Array<{ text: string }> }> | string,
  config?: {
    systemInstruction?: string;
    json?: boolean;
    temperature?: number;
  },
): Promise<CallResult> {
  const key = apiKey();
  if (!key) return { ok: false, status: 401, error: 'gemini_not_configured' };

  const body: Record<string, unknown> = {
    contents: typeof contents === 'string'
      ? [{ role: 'user', parts: [{ text: contents }] }]
      : contents,
    generationConfig: {
      temperature: config?.temperature ?? 0.75,
      ...(config?.json ? { responseMimeType: 'application/json' } : {}),
    },
  };
  if (config?.systemInstruction) {
    body.systemInstruction = { parts: [{ text: config.systemInstruction }] };
  }

  try {
    const res = await fetch(`${GEMINI_API_BASE}/models/${model}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key,
      },
      body: JSON.stringify(body),
    });
    const raw = await res.text();
    if (!res.ok) {
      return { ok: false, status: res.status, error: `gemini_http_${res.status}:${raw.slice(0, 200)}` };
    }
    const text = extractGenerateText(JSON.parse(raw));
    if (!text) return { ok: false, status: 200, error: 'gemini_empty_response' };
    return { ok: true, text };
  } catch (err) {
    return { ok: false, status: 500, error: String(err) };
  }
}

async function callInteractionChat(
  model: string,
  systemInstruction: string,
  turns: GeminiChatTurn[],
  config?: { json?: boolean; temperature?: number },
): Promise<CallResult> {
  const last = turns[turns.length - 1];
  if (!last || last.role !== 'user') {
    return { ok: false, status: 400, error: 'gemini_no_user_turn' };
  }

  const history = turns
    .slice(0, -1)
    .map((t) => `${t.role === 'user' ? 'Usuario' : 'Asistente'}: ${t.text}`)
    .join('\n');
  const input = history ? `${history}\nUsuario: ${last.text}` : last.text;
  const jsonHint = config?.json
    ? '\n\nResponde SOLO con un objeto JSON válido, sin markdown ni texto extra.'
    : '';

  try {
    const interaction = await getClient().interactions.create({
      model,
      input,
      system_instruction: `${systemInstruction}${jsonHint}`,
    });
    const text = interaction.output_text?.trim();
    if (!text) return { ok: false, status: 200, error: 'gemini_empty_response' };
    return { ok: true, text };
  } catch (err) {
    const { status, message } = parseError(err);
    return { ok: false, status, error: `gemini_http_${status}:${message.slice(0, 200)}` };
  }
}

async function callChatHttp(
  model: string,
  systemInstruction: string,
  turns: GeminiChatTurn[],
  config?: { json?: boolean; temperature?: number },
): Promise<CallResult> {
  const contents = turns.map((t) => ({
    role: t.role,
    parts: [{ text: t.text }],
  }));
  return callGenerateHttp(model, contents, {
    systemInstruction,
    json: config?.json,
    temperature: config?.temperature,
  });
}

async function callChatWithFallbacks(
  model: string,
  systemInstruction: string,
  turns: GeminiChatTurn[],
  config?: { json?: boolean; temperature?: number },
): Promise<CallResult> {
  const strategies = isAuthKey()
    ? [callInteractionChat, callChatHttp, callChat]
    : [callChat, callChatHttp, callInteractionChat];

  let last: CallResult = { ok: false, status: 500, error: 'gemini_failed' };
  for (const strategy of strategies) {
    const result = await strategy(model, systemInstruction, turns, config);
    if (result.ok) return result;
    last = result;
    if (result.status === 404 || result.status === 400 || result.error === 'gemini_empty_response') break;
  }
  return last;
}

async function callGenerate(
  model: string,
  contents: Part[] | string,
  config?: {
    systemInstruction?: string;
    json?: boolean;
    temperature?: number;
  },
): Promise<CallResult> {
  try {
    const response = await getClient().models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: config?.systemInstruction,
        temperature: config?.temperature,
        ...(config?.json ? { responseMimeType: 'application/json' } : {}),
      },
    });
    const text = response.text?.trim();
    if (!text) return { ok: false, status: 200, error: 'gemini_empty_response' };
    return { ok: true, text };
  } catch (err) {
    const { status, message } = parseError(err);
    return { ok: false, status, error: `gemini_http_${status}:${message.slice(0, 200)}` };
  }
}

async function callChat(
  model: string,
  systemInstruction: string,
  turns: GeminiChatTurn[],
  config?: { json?: boolean; temperature?: number },
): Promise<CallResult> {
  try {
    const history = turns.slice(0, -1).map((t) => ({
      role: t.role,
      parts: [{ text: t.text }],
    }));
    const last = turns[turns.length - 1];
    if (!last || last.role !== 'user') {
      return { ok: false, status: 400, error: 'gemini_no_user_turn' };
    }

    const chat = getClient().chats.create({
      model,
      history: history.length ? history : undefined,
      config: {
        systemInstruction,
        temperature: config?.temperature ?? 0.75,
        ...(config?.json ? { responseMimeType: 'application/json' } : {}),
      },
    });
    const response = await chat.sendMessage({ message: last.text });
    const text = response.text?.trim();
    if (!text) return { ok: false, status: 200, error: 'gemini_empty_response' };
    return { ok: true, text };
  } catch (err) {
    const { status, message } = parseError(err);
    return { ok: false, status, error: `gemini_http_${status}:${message.slice(0, 200)}` };
  }
}

async function withModelFallback(
  fn: (model: string) => Promise<CallResult>,
): Promise<CallResult> {
  let last: CallResult = { ok: false, status: 500, error: 'gemini_failed' };
  for (const model of modelCandidates()) {
    const result = await fn(model);
    if (result.ok) return result;
    last = result;
    if (result.status === 404 || result.status === 400 || result.error === 'gemini_empty_response') continue;
    if (result.status === 401 || result.status === 403) continue;
  }
  throw new Error(last.error);
}

export async function generateGeminiText(prompt: string, opts?: { json?: boolean; temperature?: number }) {
  const result = await withModelFallback(async (model) => {
    const sdk = await callGenerate(model, prompt, { temperature: opts?.temperature, json: opts?.json });
    if (sdk.ok) return sdk;
    if (isAuthKey() || sdk.status === 401 || sdk.status === 403) {
      return callGenerateHttp(model, prompt, {
        temperature: opts?.temperature,
        json: opts?.json,
      });
    }
    return sdk;
  });
  return result.text;
}

export async function generateGeminiChat(
  systemInstruction: string,
  turns: GeminiChatTurn[],
  opts?: { json?: boolean; temperature?: number },
) {
  const result = await withModelFallback((model) =>
    callChatWithFallbacks(model, systemInstruction, turns, opts),
  );
  return result.text;
}

export async function probeGemini() {
  const result = await probeGeminiStatus();
  return result.live;
}

export async function probeGeminiStatus(): Promise<{
  live: boolean;
  error?: string;
  keyType?: string;
  keyLength?: number;
}> {
  const meta = keyMeta();
  if (!meta.length) return { live: false, error: 'not_configured', ...meta };
  try {
    const text = await generateGeminiText('Responde solo: ok', { temperature: 0 });
    return { live: text.toLowerCase().includes('ok'), keyType: meta.type, keyLength: meta.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'gemini_failed';
    const code = msg.match(/gemini_http_(\d+)/)?.[1] || 'error';
    return { live: false, error: `http_${code}`, keyType: meta.type, keyLength: meta.length };
  }
}

export async function generateGeminiContent(
  parts: GeminiPart[],
  opts?: { json?: boolean; temperature?: number },
) {
  const result = await withModelFallback(async (model) => {
    const sdk = await callGenerate(model, toParts(parts), { temperature: opts?.temperature, json: opts?.json });
    if (sdk.ok) return sdk;
    const textPart = parts.find((p): p is { text: string } => 'text' in p)?.text || '';
    if (isAuthKey() || sdk.status === 401 || sdk.status === 403) {
      return callGenerateHttp(model, textPart, {
        temperature: opts?.temperature,
        json: opts?.json,
      });
    }
    return sdk;
  });
  return result.text;
}

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
