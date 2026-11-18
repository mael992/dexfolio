// Lecture d'une carte par le modèle local (Ollama, vision + sortie JSON imposée).

export const SYSTEM_PROMPT = `You identify physical Pokémon Trading Card Game cards from photos, for a collection-tracking app.
Read the card exactly as printed. Never invent a value you cannot read: return an empty string instead.

Fields to return:
- is_pokemon_card: false if the image does not show a Pokémon TCG card.
- name: the card name exactly as printed, in the card's language, with accents and suffixes (e.g. "Dracaufeu ex", "Pikachu", "Recherches Professorales"). Exclude the stage label ("Base", "Niveau 1") and the HP.
- collector_number: the collector number printed at the bottom (left or right), before the slash: "025" from "025/165", "TG05" from "TG05/TG30", "GG12" from "GG12/GG70". For promos without a slash, the printed code (e.g. "SWSH050", or "001" when printed "SVP 001").
- set_total: the number after the slash ("165", "TG30"), else "".
- set_code: the small set code printed near the collector number on recent cards (e.g. "MEW", "PAL", "SVI", "SVP"), else "".
- regulation_mark: the single letter in a small box near the bottom (e.g. "G", "H"), else "".
- language: language of the printed text: fr, en, de, es, it, pt, ja, zh, ko or other.
- hp: the HP value if printed (digits only), else "".
- variant_hint: "reverse" if the foil shine covers the card frame but not the artwork, "holo" if the shine is on the artwork, "normal" if there is no foil, "unknown" if you cannot tell.
- confidence: from 0 to 1, how sure you are that name and collector_number are read correctly.
- notes: a very short note if the photo is blurry, cropped, or not a Pokémon card; else "".
Answer with the JSON object only.`

export const SCHEMA = {
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

/**
 * @param {{ ollamaUrl: string, model: string, imageB64: string, timeoutMs?: number }} opts
 * @returns {Promise<Record<string, unknown>>}
 */
export async function readCard({ ollamaUrl, model, imageB64, timeoutMs = 120_000 }) {
  const res = await fetch(`${ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model,
      stream: false,
      think: false,
      format: SCHEMA,
      options: { temperature: 0 },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: 'Identify this card and return the requested fields.', images: [imageB64] },
      ],
    }),
  })
  if (!res.ok) throw new Error(`Ollama ${res.status} : ${(await res.text()).slice(0, 200)}`)
  const data = await res.json()
  return JSON.parse(data.message?.content ?? '')
}
