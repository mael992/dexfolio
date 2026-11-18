// =====================================================================
// Dexfolio — scanner IA LOCAL
// Tourne sur ton PC, à côté d'Ollama : récupère les photos déposées par l'app
// dans Supabase (table scan_jobs), les fait lire par ton modèle local (Qwen
// via Ollama), écrit le résultat puis efface la photo. Aucun modèle distant,
// aucune porte ouverte sur le PC (connexions sortantes uniquement).
//
// Variables (.env) :
//   SUPABASE_URL          URL du projet Supabase
//   SUPABASE_SECRET_KEY   clé SECRÈTE (sb_secret_…) — ne jamais la mettre dans l'app ni sur GitHub
//   OLLAMA_URL            défaut http://ds-ollama:11434 (conteneur Ollama de deepsearch)
//   OLLAMA_MODEL          défaut qwen3.6-recherche (même modèle que deepsearch : déjà chargé en VRAM)
// =====================================================================
import { createClient } from '@supabase/supabase-js'
import { readCard } from './vision.mjs'

const env = (key, fallback = '') => (process.env[key] ?? '').trim() || fallback

const SUPABASE_URL = env('SUPABASE_URL')
const SUPABASE_SECRET_KEY = env('SUPABASE_SECRET_KEY')
const OLLAMA_URL = env('OLLAMA_URL', 'http://ds-ollama:11434').replace(/\/+$/, '')
const OLLAMA_MODEL = env('OLLAMA_MODEL', 'qwen3.6-recherche')
const SCANNER_ID = env('SCANNER_ID', 'pc')
const POLL_MS = Number(env('POLL_INTERVAL_MS', '2000'))
const OLLAMA_TIMEOUT_MS = Number(env('OLLAMA_TIMEOUT_MS', '120000'))
/** Une demande plus vieille que ça n'est plus attendue par l'app : on l'abandonne. */
const MAX_WAIT_MS = 2 * 60 * 1000

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('SUPABASE_URL et SUPABASE_SECRET_KEY sont obligatoires (voir scanner/.env.example).')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const nowIso = () => new Date().toISOString()

let ollamaOk = false
let lastError = ''
let scansDone = 0

/** Vérifie qu'Ollama répond et que le modèle est installé. */
async function checkOllama() {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(5000) })
    const data = await res.json()
    const names = (data.models ?? []).map((m) => m.name)
    ollamaOk = names.some((n) => n === OLLAMA_MODEL || n === `${OLLAMA_MODEL}:latest`)
    if (!ollamaOk) lastError = `Modèle « ${OLLAMA_MODEL} » introuvable dans Ollama`
  } catch {
    ollamaOk = false
    lastError = 'Ollama injoignable'
  }
  return ollamaOk
}

async function heartbeat() {
  await checkOllama()
  const { error } = await supabase.from('scanner_status').upsert({
    id: SCANNER_ID,
    last_seen: nowIso(),
    model: OLLAMA_MODEL,
    info: { ollama: ollamaOk, lastError: ollamaOk ? '' : lastError, scans: scansDone },
  })
  if (error) console.error('Battement de cœur impossible :', error.message)
}

/** Réserve la plus ancienne demande en attente (atomique : une seule instance la traite). */
async function claimNext() {
  const since = new Date(Date.now() - MAX_WAIT_MS).toISOString()
  const { data: pending, error } = await supabase
    .from('scan_jobs')
    .select('id')
    .eq('status', 'pending')
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(1)
  if (error) throw error
  if (!pending?.length) return null
  const { data: job, error: claimError } = await supabase
    .from('scan_jobs')
    .update({ status: 'processing' })
    .eq('id', pending[0].id)
    .eq('status', 'pending')
    .select('id, image')
    .maybeSingle()
  if (claimError) throw claimError
  return job
}

async function processJob(job) {
  const started = Date.now()
  try {
    if (!job.image) throw new Error('Photo manquante')
    const result = await readCard({ ollamaUrl: OLLAMA_URL, model: OLLAMA_MODEL, imageB64: job.image, timeoutMs: OLLAMA_TIMEOUT_MS })
    await supabase
      .from('scan_jobs')
      .update({ status: 'done', result, image: null, model: OLLAMA_MODEL, duration_ms: Date.now() - started, finished_at: nowIso() })
      .eq('id', job.id)
    scansDone++
    console.log(`Carte lue en ${Date.now() - started} ms`)
  } catch (e) {
    const message = e?.name === 'TimeoutError' ? 'Le modèle local a mis trop de temps à répondre' : String(e?.message ?? e)
    lastError = message.slice(0, 200)
    await supabase
      .from('scan_jobs')
      .update({ status: 'error', error: message.slice(0, 480), image: null, model: OLLAMA_MODEL, finished_at: nowIso() })
      .eq('id', job.id)
    console.error('Échec de lecture :', lastError)
  }
}

/** Ménage : demandes abandonnées, traitements interrompus, historique de plus de 24 h. */
async function housekeeping() {
  const old = (ms) => new Date(Date.now() - ms).toISOString()
  await supabase.from('scan_jobs').update({ status: 'error', error: 'Demande expirée', image: null }).eq('status', 'pending').lt('created_at', old(MAX_WAIT_MS))
  await supabase.from('scan_jobs').update({ status: 'error', error: 'Traitement interrompu', image: null }).eq('status', 'processing').lt('created_at', old(10 * 60 * 1000))
  await supabase.from('scan_jobs').delete().lt('created_at', old(24 * 60 * 60 * 1000))
}

let stopping = false
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => (stopping = true))

console.log(`Scanner Dexfolio démarré — modèle ${OLLAMA_MODEL} via ${OLLAMA_URL}`)
await heartbeat().catch(() => undefined)
await housekeeping().catch(() => undefined)
const hb = setInterval(() => void heartbeat().catch(() => undefined), 20_000)
const hk = setInterval(() => void housekeeping().catch(() => undefined), 10 * 60_000)

while (!stopping) {
  try {
    const job = await claimNext()
    if (job) {
      await processJob(job)
      continue
    }
  } catch (e) {
    console.error('Supabase :', e?.message ?? e)
    await sleep(5000)
  }
  await sleep(POLL_MS)
}

clearInterval(hb)
clearInterval(hk)
await supabase
  .from('scanner_status')
  .upsert({ id: SCANNER_ID, last_seen: new Date(0).toISOString(), model: OLLAMA_MODEL, info: { ollama: false, lastError: 'Scanner arrêté' } })
  .then(
    () => undefined,
    () => undefined,
  )
console.log('Scanner arrêté.')
