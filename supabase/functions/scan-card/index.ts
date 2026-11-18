// =====================================================================
// Dexfolio — Edge Function « scan-card »
// Reçoit la photo d'une carte, la fait lire par Claude (API Anthropic) et
// renvoie une lecture structurée (nom, numéro, total, langue…).
//
// Sécurité :
//  - la clé ANTHROPIC_API_KEY reste côté serveur (secret Supabase), jamais dans l'app ;
//  - seul un utilisateur connecté peut appeler la fonction (jeton vérifié) ;
//  - limite quotidienne par utilisateur (table scan_events, RLS).
//
// Secrets / variables :
//  ANTHROPIC_API_KEY (obligatoire), ANTHROPIC_MODEL (défaut claude-opus-5-5),
//  SCAN_DAILY_LIMIT (défaut 60), ALLOWED_ORIGINS (ex. https://moi.github.io,http://localhost:5173)
// =====================================================================
import Anthropic from 'npm:@anthropic-ai/sdk@1.10.0'
import { createClient } from 'npm:@supabase/supabase-js@2.119.0'

const MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-opus-5-5'
const DAILY_LIMIT = Number(Deno.env.get('SCAN_DAILY_LIMIT') || '60')
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const MAX_IMAGE_B64 = 3_000_000 // ~2,2 Mo d'image
const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
type MediaType = (typeof MEDIA_TYPES)[number]

const SYSTEM_PROMPT = `You identify physical Pokémon Trading Card Game cards from photos, for a collection-tracking app.
Read the card exactly as printed. Never invent a value you cannot read: return an empty string instead.

Fields to return:
- name: the card name exactly as printed, in the card's language, with accents and suffixes (e.g. "Dracaufeu ex", "Pikachu", "Recherches Professorales"). Exclude the stage label and the HP.
- collector_number: the collector number printed at the bottom (left or right), before the slash: "025" from "025/165", "TG05" from "TG05/TG30", "GG12" from "GG12/GG70". For promos without a slash, the printed code (e.g. "SWSH050", or "001" when printed "SVP 001").
- set_total: the number after the slash ("165", "TG30"), else "".
- set_code: the small set code printed near the collector number on recent cards (e.g. "MEW", "PAL", "SVI", "SVP"), else "".
- regulation_mark: the single letter in a small box near the bottom (e.g. "G", "H"), else "".
- language: language of the printed text: fr, en, de, es, it, pt, ja, zh, ko or other.
- hp: the HP value if printed (digits only), else "".
- variant_hint: "reverse" if the foil shine covers the card frame but not the artwork, "holo" if the shine is on the artwork, "normal" if there is no foil, "unknown" if you cannot tell.
- confidence: from 0 to 1, how sure you are that name and collector_number are read correctly.
- notes: a very short note if the photo is blurry, cropped, or not a Pokémon card; else "".
Set is_pokemon_card to false if the image does not show a Pokémon TCG card.`

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'is_pokemon_card',
    'name',
    'collector_number',
    'set_total',
    'set_code',
    'regulation_mark',
    'language',
    'hp',
    'variant_hint',
    'confidence',
    'notes',
  ],
  properties: {
    is_pokemon_card: { type: 'boolean' },
    name: { type: 'string' },
    collector_number: { type: 'string' },
    set_total: { type: 'string' },
    set_code: { type: 'string' },
    regulation_mark: { type: 'string' },
    language: { type: 'string', enum: ['fr', 'en', 'de', 'es', 'it', 'pt', 'ja', 'zh', 'ko', 'other'] },
    hp: { type: 'string' },
    variant_hint: { type: 'string', enum: ['normal', 'reverse', 'holo', 'unknown'] },
    confidence: { type: 'number' },
    notes: { type: 'string' },
  },
}

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin')
  const allow = ALLOWED_ORIGINS.length === 0 ? '*' : origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) })
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405)

  // 1) Authentification : jeton de session Supabase obligatoire
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || req.headers.get('apikey') || ''
  if (!token || !supabaseUrl || !anonKey) return json(req, { error: 'unauthorized' }, 401)

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  const user = userData?.user
  if (userError || !user) return json(req, { error: 'unauthorized' }, 401)

  // 2) Limite quotidienne par utilisateur
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count } = await supabase.from('scan_events').select('id', { count: 'exact', head: true }).gte('created_at', since)
  if ((count ?? 0) >= DAILY_LIMIT) return json(req, { error: 'rate_limited', limit: DAILY_LIMIT }, 429)

  // 3) Validation de l'image
  let body: { image?: unknown; mediaType?: unknown }
  try {
    body = await req.json()
  } catch {
    return json(req, { error: 'bad_image' }, 400)
  }
  const image = typeof body.image === 'string' ? body.image : ''
  const mediaType = (MEDIA_TYPES as readonly string[]).includes(String(body.mediaType)) ? (body.mediaType as MediaType) : 'image/jpeg'
  if (!image || image.length > MAX_IMAGE_B64 || !/^[A-Za-z0-9+/=\s]+$/.test(image.slice(0, 2000))) {
    return json(req, { error: 'bad_image' }, 400)
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return json(req, { error: 'not_configured' }, 503)

  // 4) Lecture de la carte par Claude (sortie JSON structurée)
  const client = new Anthropic({ apiKey })
  const supportsFallback = !MODEL.startsWith('claude-haiku')
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
            { type: 'text', text: 'Identify this card and return the requested fields.' },
          ],
        },
      ],
      // En cas de refus par un filtre de sécurité, l'API rejoue la requête sur un modèle de repli.
      ...(supportsFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    })

    const usage = { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens }
    await supabase.from('scan_events').insert({
      user_id: user.id,
      model: response.model,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      ok: response.stop_reason !== 'refusal',
    })

    if (response.stop_reason === 'refusal') return json(req, { error: 'refused' }, 422)
    if (response.stop_reason === 'max_tokens') return json(req, { error: 'incomplete' }, 502)

    const text = response.content.find((b) => b.type === 'text')
    if (!text || text.type !== 'text') return json(req, { error: 'empty' }, 502)
    const reading = JSON.parse(text.text)
    return json(req, { reading, model: response.model, usage })
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return json(req, { error: 'not_configured' }, 503)
    if (err instanceof Anthropic.RateLimitError) return json(req, { error: 'upstream_busy' }, 429)
    if (err instanceof Anthropic.BadRequestError) return json(req, { error: 'bad_image', detail: err.message }, 400)
    if (err instanceof Anthropic.APIError) return json(req, { error: 'upstream_error', status: err.status }, 502)
    if (err instanceof SyntaxError) return json(req, { error: 'empty' }, 502)
    console.error(err)
    return json(req, { error: 'internal' }, 500)
  }
})
