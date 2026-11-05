// buscar-fotos-producto (v1)
// Busca fotos del producto en la página oficial de la marca, las revisa con IA (¿es el producto?
// ¿coincide modelo/color/capacidad?) y deja las candidatas en el Storage de la cuenta para que la
// persona apruebe cuáles usar. NUNCA agrega nada al producto por su cuenta.
//
// Autenticación: se reenvía el JWT de quien llama (igual que generar-planilla-ml), así Storage y
// profiles respetan el mismo RLS por tenant. No se usa el service role.
//
// Pasos: 1) Gemini + Búsqueda de Google halla la página oficial  2) se leen las imágenes de esa
// página  3) se descargan  4) Gemini (visión) las compara con el producto  5) las buenas se guardan
// en productos-fotos/<tenant>/ia-candidatas/.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const HEADERS_CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}
const responderOk = (b: Record<string, unknown>) => new Response(JSON.stringify(b), { status: 200, headers: HEADERS_CORS })
function responderError(error: string, detalle?: unknown): Response {
  console.error('[buscar-fotos-producto]', error, detalle ?? '')
  return new Response(JSON.stringify({ ok: false, error }), { status: 200, headers: HEADERS_CORS })
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const MODELOS_BUSQUEDA = ['gemini-3.5-flash-lite', 'gemini-3.5-flash']
const MODELO_VISION = 'gemini-3.5-flash-lite'
const MAX_PAGINAS = 3
const MAX_DESCARGAS = 10
const MAX_GUARDAR = 6
const MIN_BYTES = 12_000
const MAX_BYTES = 4_000_000

// ── Seguridad: solo sitios públicos por http(s); nunca IPs ni nombres internos ─────────────────
function urlPermitida(u: string): URL | null {
  try {
    const x = new URL(u)
    if (x.protocol !== 'https:' && x.protocol !== 'http:') return null
    const h = x.hostname.toLowerCase()
    if (!h.includes('.') || h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return null
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(':')) return null
    return x
  } catch (_e) { return null }
}

async function conTiempo(u: string, init: RequestInit = {}, ms = 9000): Promise<Response> {
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), ms)
  try { return await fetch(u, { ...init, signal: c.signal, headers: { 'User-Agent': UA, 'Accept-Language': 'es,en;q=0.8', ...(init.headers || {}) } }) }
  finally { clearTimeout(t) }
}

// ── 1) Páginas candidatas (Gemini + Búsqueda de Google) ─────────────────────────────────────────
async function paginasOficiales(apiKey: string, d: { nombre: string; marca: string; sku: string }): Promise<string[]> {
  const prompt = [
    'Busca en Google la página OFICIAL del fabricante de este producto (el sitio de la marca, no tiendas).',
    `Producto: ${d.nombre}`,
    `Marca: ${d.marca || 'no indicada'}`,
    `Modelo/SKU: ${d.sku || 'no indicado'}`,
    'Responde SOLO con hasta 3 URLs completas de la página de ESE modelo exacto, una por línea, sin texto adicional.'
  ].join('\n')
  for (const modelo of MODELOS_BUSQUEDA) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`
    const init = {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0 } })
    }
    let r = await fetch(url, init)
    for (let i = 1; i <= 3 && (r.status === 503 || r.status === 429); i++) { await new Promise((ok) => setTimeout(ok, 1500 * i)); r = await fetch(url, init) }
    if (!r.ok) { console.error('[buscar-fotos-producto] búsqueda', modelo, r.status, (await r.text().catch(() => '')).slice(0, 300)); continue }
    const j = await r.json().catch(() => null)
    const cand = j?.candidates?.[0]
    const texto: string = cand?.content?.parts?.map((p: { text?: string }) => p.text || '').join('\n') || ''
    const urls: string[] = (texto.match(/https?:\/\/[^\s)\]>"']+/g) || []).map((u) => u.replace(/[.,;]+$/, ''))
    const chunks: Array<{ web?: { uri?: string } }> = cand?.groundingMetadata?.groundingChunks || []
    for (const ch of chunks) if (ch.web?.uri) urls.push(ch.web.uri)
    // Los enlaces de Google van por una redirección: se resuelven al sitio real.
    const reales: string[] = []
    for (const u of urls) {
      if (/vertexaisearch\.cloud\.google\.com|google\.com\/grounding/.test(u)) {
        try {
          const rr = await conTiempo(u, { redirect: 'manual' }, 6000)
          const loc = rr.headers.get('location')
          if (loc) reales.push(loc)
        } catch (_e) { /* se ignora */ }
      } else reales.push(u)
    }
    const unicas = [...new Set(reales)].filter((u) => urlPermitida(u))
    // La marca primero: las páginas cuyo dominio contiene la marca van adelante.
    const m = d.marca.toLowerCase().replace(/[^a-z0-9]/g, '')
    unicas.sort((a, b) => Number(!!m && new URL(b).hostname.includes(m)) - Number(!!m && new URL(a).hostname.includes(m)))
    if (unicas.length) return unicas.slice(0, MAX_PAGINAS)
  }
  return []
}

// ── 2) Imágenes de una página ───────────────────────────────────────────────────────────────────
const DESCARTAR = /(logo|icon|sprite|favicon|avatar|flag|badge|placeholder|pixel|tracking|payment|social|arrow|star|rating|loader|spinner|swatch|thumb-?nail-?small|\.svg|\.gif|data:)/i

function imagenesDeHtml(html: string, base: URL): string[] {
  const out: string[] = []
  const add = (u: string | undefined | null) => {
    if (!u) return
    try {
      const abs = new URL(u.trim().replace(/&amp;/g, '&'), base).toString()
      if (urlPermitida(abs) && !DESCARTAR.test(abs)) out.push(abs)
    } catch (_e) { /* se ignora */ }
  }
  for (const m of html.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image)["'][^>]*content=["']([^"']+)["']/gi)) add(m[1])
  for (const m of html.matchAll(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/gi)) add(m[1])
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const walk = (n: unknown) => {
        if (Array.isArray(n)) n.forEach(walk)
        else if (n && typeof n === 'object') {
          for (const [k, v] of Object.entries(n as Record<string, unknown>)) {
            if (k === 'image' || k === 'thumbnailUrl') {
              if (typeof v === 'string') add(v)
              else if (Array.isArray(v)) v.forEach((x) => add(typeof x === 'string' ? x : (x as { url?: string })?.url))
              else if (v && typeof v === 'object') add((v as { url?: string }).url)
            } else walk(v)
          }
        }
      }
      walk(JSON.parse(m[1]))
    } catch (_e) { /* JSON-LD roto */ }
  }
  for (const m of html.matchAll(/<(?:img|source)\b[^>]*>/gi)) {
    const tag = m[0]
    const src = tag.match(/\b(?:data-src|data-original|data-lazy-src|src)=["']([^"']+)["']/i)?.[1]
    add(src)
    const ss = tag.match(/\b(?:data-srcset|srcset)=["']([^"']+)["']/i)?.[1]
    if (ss) {
      const mejor = ss.split(',').map((s) => s.trim().split(/\s+/)).sort((a, b) => (parseInt(b[1]) || 0) - (parseInt(a[1]) || 0))[0]
      add(mejor?.[0])
    }
  }
  const vistas = new Set<string>()
  return out.filter((u) => { const k = u.split('?')[0]; if (vistas.has(k)) return false; vistas.add(k); return /\.(jpe?g|png|webp)(\?|$)/i.test(u) || /image|img|photo|media|cdn/i.test(u) })
}

// ── 3) Descarga ─────────────────────────────────────────────────────────────────────────────────
type Descargada = { url: string; pagina: string; bytes: Uint8Array; tipo: string }
async function descargar(url: string, pagina: string): Promise<Descargada | null> {
  try {
    const r = await conTiempo(url, { headers: { Referer: pagina, Accept: 'image/avif,image/webp,image/*,*/*;q=0.8' } }, 9000)
    if (!r.ok) return null
    const tipo = (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    if (!/^image\/(jpeg|png|webp)$/.test(tipo)) return null
    const bytes = new Uint8Array(await r.arrayBuffer())
    if (bytes.length < MIN_BYTES || bytes.length > MAX_BYTES) return null
    return { url, pagina, bytes, tipo }
  } catch (_e) { return null }
}
function aBase64(b: Uint8Array): string {
  let s = ''
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return btoa(s)
}

// ── 4) Revisión con IA (visión) ─────────────────────────────────────────────────────────────────
const ESQUEMA_VISION = {
  type: 'object',
  properties: {
    imagenes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          indice: { type: 'integer', description: 'Número de la imagen, empezando en 0, en el mismo orden en que se enviaron.' },
          es_foto_producto: { type: 'boolean', description: 'true solo si es una foto limpia del producto en sí (o de su empaque). false para logos, banners con texto, personas, otros productos, íconos, capturas de software, diagramas.' },
          coincide: { type: 'string', enum: ['si', 'dudoso', 'no'], description: '"si": se ve el mismo modelo/color/tipo. "dudoso": podría ser otra versión, color o capacidad. "no": es otro producto.' },
          motivo: { type: 'string', description: 'Máximo 12 palabras, en español con tildes.' }
        },
        required: ['indice', 'es_foto_producto', 'coincide', 'motivo']
      }
    }
  },
  required: ['imagenes']
}
async function revisarConIA(apiKey: string, d: { nombre: string; marca: string; sku: string }, imgs: Descargada[]) {
  const partes: unknown[] = [{
    text: [
      'Eres un revisor de fotos para un catálogo de ventas. Te paso el producto y varias imágenes sacadas de una página web.',
      `Producto: ${d.nombre}`, `Marca: ${d.marca || 'no indicada'}`, `Modelo/SKU: ${d.sku || 'no indicado'}`,
      'Para CADA imagen (índice desde 0, en el orden enviado) indica si es una foto limpia del producto y si coincide con el producto pedido.',
      'Sé estricto: si el color, la capacidad o la versión visible puede no ser la pedida, marca "dudoso". Si es otro producto, "no".'
    ].join('\n')
  }]
  imgs.forEach((im, i) => { partes.push({ text: `Imagen ${i}:` }); partes.push({ inlineData: { mimeType: im.tipo, data: aBase64(im.bytes) } }) })
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO_VISION}:generateContent?key=${apiKey}`
  const init = {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: partes }], generationConfig: { temperature: 0, maxOutputTokens: 1500, responseMimeType: 'application/json', responseSchema: ESQUEMA_VISION } })
  }
  let r = await fetch(url, init)
  for (let i = 1; i <= 3 && (r.status === 503 || r.status === 429); i++) { await new Promise((ok) => setTimeout(ok, 2000 * i)); r = await fetch(url, init) }
  if (!r.ok) { console.error('[buscar-fotos-producto] visión', r.status, (await r.text().catch(() => '')).slice(0, 300)); return null }
  const j = await r.json().catch(() => null)
  try { return (JSON.parse(j?.candidates?.[0]?.content?.parts?.[0]?.text || '{}').imagenes || []) as Array<{ indice: number; es_foto_producto: boolean; coincide: string; motivo: string }> }
  catch (_e) { return null }
}

// ── Handler ─────────────────────────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: HEADERS_CORS })
  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return responderError('Falta la sesión. Vuelve a entrar al sistema.')
    const body = await req.json().catch(() => null)
    const nombre = String(body?.nombre || '').trim()
    if (!nombre) return responderError('Escribe primero el nombre del producto.')
    const d = { nombre, marca: String(body?.marca || '').trim(), sku: String(body?.sku || '').trim() }

    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) return responderError('Falta configurar la clave de IA (GEMINI_API_KEY) en el proyecto de Supabase.')

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
    const { data: u } = await supabase.auth.getUser()
    if (!u?.user) return responderError('Tu sesión venció. Vuelve a entrar al sistema.')
    const { data: perfil } = await supabase.from('profiles').select('tenant_id').eq('id', u.user.id).maybeSingle()
    const tenantId = perfil?.tenant_id
    if (!tenantId) return responderError('No se pudo identificar tu cuenta.')

    // 1) páginas
    const paginas = await paginasOficiales(apiKey, d)
    if (!paginas.length) return responderOk({ ok: true, candidatas: [], paginas: [], aviso: 'No encontré la página oficial de este producto. Súbela tú con «Subir fotos» o pega una captura.' })

    // 2) imágenes de cada página (en paralelo)
    const htmls = await Promise.all(paginas.map(async (p) => {
      try {
        const r = await conTiempo(p, {}, 10000)
        if (!r.ok) return { pagina: p, urls: [] as string[], estado: r.status }
        const html = (await r.text()).slice(0, 2_500_000)
        return { pagina: p, urls: imagenesDeHtml(html, new URL(r.url || p)), estado: 200 }
      } catch (_e) { return { pagina: p, urls: [] as string[], estado: 0 } }
    }))
    const pares: Array<{ url: string; pagina: string }> = []
    const vistos = new Set<string>()
    const maxLen = Math.max(...htmls.map((h) => h.urls.length), 0)
    for (let i = 0; i < maxLen; i++) for (const h of htmls) { const u2 = h.urls[i]; if (u2 && !vistos.has(u2.split('?')[0])) { vistos.add(u2.split('?')[0]); pares.push({ url: u2, pagina: h.pagina }) } }
    if (!pares.length) return responderOk({ ok: true, candidatas: [], paginas, aviso: 'Encontré la página pero no me dejó leer sus fotos (suelen bloquear a los robots). Súbelas tú o pega una captura.' })

    // 3) descarga
    const bajadas = (await Promise.all(pares.slice(0, MAX_DESCARGAS * 2).map((p) => descargar(p.url, p.pagina)))).filter((x): x is Descargada => !!x).slice(0, MAX_DESCARGAS)
    if (!bajadas.length) return responderOk({ ok: true, candidatas: [], paginas, aviso: 'No pude descargar fotos de esa página. Súbelas tú o pega una captura.' })

    // 4) revisión con IA
    const veredictos = await revisarConIA(apiKey, d, bajadas)
    const lista = bajadas.map((im, i) => {
      const v = veredictos?.find((x) => x.indice === i)
      return { im, es: v ? v.es_foto_producto : true, coincide: v ? v.coincide : 'dudoso', motivo: v ? v.motivo : 'No se pudo revisar con IA; míralo tú.' }
    }).filter((x) => x.es && x.coincide !== 'no')
    const rango = (c: string) => (c === 'si' ? 0 : 1)
    lista.sort((a, b) => rango(a.coincide) - rango(b.coincide))

    // 5) guardar candidatas (carpeta propia de la cuenta)
    const candidatas: Array<{ url: string; pagina: string; dominio: string; coincide: string; motivo: string; ruta: string }> = []
    const lote = Date.now()
    for (const x of lista.slice(0, MAX_GUARDAR)) {
      const ext = x.im.tipo === 'image/png' ? 'png' : x.im.tipo === 'image/webp' ? 'webp' : 'jpg'
      const ruta = `${tenantId}/ia-candidatas/${lote}-${candidatas.length}.${ext}`
      const { error } = await supabase.storage.from('productos-fotos').upload(ruta, x.im.bytes, { contentType: x.im.tipo, cacheControl: '31536000', upsert: false })
      if (error) { console.error('[buscar-fotos-producto] subida', error.message); continue }
      const { data: pub } = supabase.storage.from('productos-fotos').getPublicUrl(ruta)
      candidatas.push({ url: pub.publicUrl, pagina: x.im.pagina, dominio: new URL(x.im.pagina).hostname.replace(/^www\./, ''), coincide: x.coincide, motivo: x.motivo, ruta })
    }
    return responderOk({
      ok: true, candidatas, paginas,
      aviso: candidatas.length ? '' : 'Las fotos que encontré no parecen ser de este producto. Súbelas tú o pega una captura.'
    })
  } catch (e) {
    return responderError('Ocurrió un error inesperado buscando fotos: ' + String(e))
  }
})
