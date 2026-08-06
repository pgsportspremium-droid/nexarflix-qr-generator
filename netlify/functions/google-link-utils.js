const BROWSER_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
  'accept-language': 'pt-BR,pt;q=0.9,en;q=0.7',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
};

export function decodeRepeated(value = '') {
  let current = String(value);
  for (let i = 0; i < 5; i += 1) {
    try {
      const next = decodeURIComponent(current);
      if (next === current) break;
      current = next;
    } catch {
      break;
    }
  }
  return current;
}

export function normalizeGoogleText(value = '') {
  return decodeRepeated(value)
    .replace(/\\u003d/gi, '=')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u002f/gi, '/')
    .replace(/&amp;/gi, '&')
    .replace(/%3A/gi, ':');
}

export function cleanBusinessName(value = '') {
  return decodeRepeated(value)
    .replace(/\+/g, ' ')
    .replace(/\s+-\s+Google Maps.*$/i, '')
    .replace(/\s+on Google Maps.*$/i, '')
    .replace(/^Google Maps\s*[-–—:]?\s*/i, '')
    .replace(/\s*[-–—]\s*(?:R\.|Rua|Av\.|Avenida|Rod\.|Rodovia|Praça|Pç\.|BR-|MG-|São |Rio |Belo |Curitiba|Brasília).*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

export function isUsefulBusinessName(name = '') {
  const normalized = cleanBusinessName(name).toLowerCase();
  return Boolean(normalized)
    && !['empresa', 'estabelecimento', 'google', 'google maps', 'maps', 'local'].includes(normalized)
    && !/^[-+]?\d+[.,]\d+/.test(normalized)
    && normalized.length >= 2;
}

export function findFeatureId(text = '') {
  const decoded = normalizeGoogleText(text);
  const patterns = [
    /(?:!1s|ftid=)(0x[0-9a-f]+:0x[0-9a-f]+)/i,
    /#lrd=(0x[0-9a-f]+:0x[0-9a-f]+)/i,
    /(?:^|[^0-9a-f])(0x[0-9a-f]+:0x[0-9a-f]+)(?:[^0-9a-f]|$)/i
  ];
  for (const pattern of patterns) {
    const match = decoded.match(pattern);
    if (match?.[1]) return match[1].toLowerCase();
  }
  return null;
}

export function findPlaceId(text = '') {
  const decoded = normalizeGoogleText(text);
  const patterns = [
    /(?:placeid|place_id|query_place_id)[=:](?:%3D)?([A-Za-z0-9_-]{15,})/i,
    /[?&](?:placeid|place_id|query_place_id)=([A-Za-z0-9_-]{15,})/i,
    /(?:^|[^A-Za-z0-9_-])((?:ChI|EiJ|GhI)[A-Za-z0-9_-]{15,})(?:[^A-Za-z0-9_-]|$)/
  ];
  for (const pattern of patterns) {
    const match = decoded.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

export function extractCoordinates(text = '') {
  const decoded = normalizeGoogleText(text);
  const patterns = [
    /\/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /!3d(-?\d+(?:\.\d+)?)[^!]*!4d(-?\d+(?:\.\d+)?)/,
    /[?&](?:query|q)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/
  ];
  for (const pattern of patterns) {
    const match = decoded.match(pattern);
    if (!match) continue;
    const lat = Number(match[1]);
    const lon = Number(match[2]);
    if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
  }
  return null;
}

function nameFromQueryValue(value = '') {
  const decoded = decodeRepeated(value).replace(/\+/g, ' ').trim();
  if (!decoded) return '';
  const firstPart = decoded.split(/\s+-\s+/)[0];
  const candidate = cleanBusinessName(firstPart);
  return isUsefulBusinessName(candidate) ? candidate : '';
}

export function extractQueryText(urlText = '') {
  try {
    const url = new URL(urlText);
    for (const key of ['q', 'query', 'daddr', 'destination']) {
      const raw = url.searchParams.get(key) || '';
      const decoded = decodeRepeated(raw).replace(/\+/g, ' ').replace(/\s+/g, ' ').trim();
      if (decoded && !/^[-+]?\d+[.,]\d+\s*,/.test(decoded)) return decoded.slice(0, 500);
    }
  } catch {}
  return '';
}

export function extractBusinessName(urlText = '', html = '') {
  try {
    const url = new URL(urlText);
    const placeMatch = normalizeGoogleText(url.pathname).match(/\/maps\/place\/([^/]+)/i);
    if (placeMatch?.[1]) {
      const name = cleanBusinessName(placeMatch[1]);
      if (isUsefulBusinessName(name)) return name;
    }
    for (const key of ['q', 'query', 'daddr', 'destination']) {
      const name = nameFromQueryValue(url.searchParams.get(key) || '');
      if (name) return name;
    }
  } catch {}

  const decodedHtml = normalizeGoogleText(html);
  const patterns = [
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
    /<title[^>]*>([^<]+)<\/title>/i,
    /\[\"([^\"]{2,120})\",\[[^\]]+\],null,\[[^\]]+\],\"0x[0-9a-f]+:0x[0-9a-f]+\"/i
  ];
  for (const pattern of patterns) {
    const match = decodedHtml.match(pattern);
    if (!match?.[1]) continue;
    const name = cleanBusinessName(match[1]);
    if (isUsefulBusinessName(name)) return name;
  }
  return '';
}

function htmlRedirect(html = '', baseUrl = '') {
  const candidates = [
    html.match(/<meta[^>]+http-equiv=["']?refresh["']?[^>]+content=["'][^"']*url=([^"']+)["']/i)?.[1],
    html.match(/window\.location(?:\.href|\.replace)?\s*(?:=|\()\s*["']([^"']+)["']/i)?.[1],
    html.match(/document\.location(?:\.href)?\s*=\s*["']([^"']+)["']/i)?.[1]
  ].filter(Boolean);
  for (const candidate of candidates) {
    try { return new URL(candidate, baseUrl).toString(); } catch {}
  }
  return null;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timeout); }
}

export async function expandGoogleUrl(startUrl) {
  const trace = [];

  // Primeiro tentamos exatamente como o Chrome desktop: seguir todos os redirects.
  // Isso costuma transformar maps.app.goo.gl em google.com/maps?q=...&ftid=...
  try {
    const followed = await fetchWithTimeout(startUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: BROWSER_HEADERS
    }, 20000);
    const html = await followed.text();
    const finalUrl = followed.url || startUrl;
    trace.push({ step: 1, url: startUrl, status: followed.status, location: finalUrl !== startUrl ? finalUrl : null });

    // Algumas respostas ainda entregam um redirect por meta/JavaScript.
    const redirectInHtml = htmlRedirect(html, finalUrl);
    if (redirectInHtml && redirectInHtml !== finalUrl) {
      const second = await fetchWithTimeout(redirectInHtml, {
        method: 'GET', redirect: 'follow', headers: BROWSER_HEADERS
      }, 20000);
      const secondHtml = await second.text();
      trace.push({ step: 2, url: redirectInHtml, status: second.status, location: second.url || null });
      return { finalUrl: second.url || redirectInHtml, html: secondHtml, trace };
    }
    return { finalUrl, html, trace };
  } catch (followError) {
    // Fallback detalhado para diagnóstico quando o redirect automático falha.
    let currentUrl = startUrl;
    let html = '';
    const visited = new Set();
    for (let i = 0; i < 10; i += 1) {
      if (visited.has(currentUrl)) break;
      visited.add(currentUrl);
      const response = await fetchWithTimeout(currentUrl, {
        method: 'GET', redirect: 'manual', headers: BROWSER_HEADERS
      });
      const location = response.headers.get('location');
      trace.push({ step: trace.length + 1, url: currentUrl, status: response.status, location: location || null });
      if (location && response.status >= 300 && response.status < 400) {
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }
      html = await response.text();
      const redirectInHtml = htmlRedirect(html, currentUrl);
      if (redirectInHtml && redirectInHtml !== currentUrl) {
        currentUrl = redirectInHtml;
        continue;
      }
      currentUrl = response.url || currentUrl;
      break;
    }
    return { finalUrl: currentUrl, html, trace, followError: String(followError?.message || followError) };
  }
}

export function parseGoogleBusiness({ inputUrl, finalUrl, html = '' }) {
  const combined = [inputUrl, finalUrl, html].filter(Boolean).join('\n');
  const featureId = findFeatureId(combined);
  const placeId = findPlaceId(combined);
  const queryText = extractQueryText(finalUrl) || extractQueryText(inputUrl);
  const name = extractBusinessName(finalUrl, html) || extractBusinessName(inputUrl, '') || nameFromQueryValue(queryText);
  const coordinates = extractCoordinates(combined);
  return { featureId, placeId, name, coordinates, queryText };
}


export function featureIdToCid(featureId = '') {
  const parts = String(featureId || '').toLowerCase().split(':');
  if (parts.length !== 2 || !/^0x[0-9a-f]+$/.test(parts[1])) return '';
  try { return BigInt(parts[1]).toString(10); } catch { return ''; }
}

export async function resolveFeatureIdDetails(featureId) {
  const cid = featureIdToCid(featureId);
  if (!cid) return { name: '', queryText: '', placeId: '', featureId, coordinates: null, finalUrl: '', html: '', trace: [] };

  // O endpoint por CID costuma transformar um ftid opaco em uma ficha canônica /maps/place/NOME/.
  // Tentamos duas variantes porque o Google pode responder de forma diferente por região/conta.
  const candidates = [
    `https://www.google.com/maps?cid=${cid}&hl=pt-BR`,
    `https://maps.google.com/maps/place?cid=${cid}&hl=pt-BR`
  ];
  const mergedTrace = [];
  let best = null;

  for (const candidate of candidates) {
    try {
      const expanded = await expandGoogleUrl(candidate);
      mergedTrace.push(...expanded.trace.map(item => ({ ...item, resolver: 'cid' })));
      const parsed = parseGoogleBusiness({ inputUrl: candidate, finalUrl: expanded.finalUrl, html: expanded.html });
      const score = (parsed.name ? 4 : 0) + (parsed.placeId ? 3 : 0) + (parsed.queryText ? 2 : 0) + (parsed.coordinates ? 1 : 0);
      if (!best || score > best.score) best = { ...parsed, finalUrl: expanded.finalUrl, html: expanded.html, score };
      if (parsed.name && (parsed.placeId || parsed.featureId)) break;
    } catch (error) {
      mergedTrace.push({ resolver: 'cid', url: candidate, error: String(error?.message || error) });
    }
  }

  return {
    name: best?.name || '',
    queryText: best?.queryText || '',
    placeId: best?.placeId || '',
    featureId: best?.featureId || featureId,
    coordinates: best?.coordinates || null,
    finalUrl: best?.finalUrl || '',
    html: best?.html || '',
    trace: mergedTrace,
    cid
  };
}

export function buildReviewLink({ placeId = '', featureId = '', name = '', locationText = '', queryText = '' }) {
  if (placeId) {
    return {
      official: true,
      ludocid: null,
      reviewUrl: `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`
    };
  }
  if (!featureId) throw new Error('Identificador do estabelecimento não encontrado.');
  const parts = featureId.split(':');
  if (parts.length !== 2) throw new Error('Identificador do Google Maps inválido.');
  const ludocid = BigInt(parts[1]).toString(10);
  const validName = isUsefulBusinessName(name) ? cleanBusinessName(name) : '';
  const query = String(queryText || '').trim() || [validName, locationText].filter(Boolean).join(' - ');
  const params = new URLSearchParams({ hl: 'pt-BR', gl: 'br', ludocid });
  if (query) params.set('q', query);
  return {
    official: false,
    ludocid,
    reviewUrl: query ? `https://www.google.com/search?${params.toString()}#lrd=${featureId},3` : ''
  };
}
