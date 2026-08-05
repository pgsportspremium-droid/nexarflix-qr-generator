import { json, preflight, requireAdmin, validUrl } from './_shared.js';

const GOOGLE_HOSTS = new Set([
  'maps.app.goo.gl',
  'goo.gl',
  'www.google.com',
  'google.com',
  'maps.google.com',
  'share.google'
]);

const BROWSER_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
  'accept-language': 'pt-BR,pt;q=0.9,en;q=0.7',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
};

function decodeRepeated(value = '') {
  let current = String(value);
  for (let i = 0; i < 4; i += 1) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) break;
      current = decoded;
    } catch {
      break;
    }
  }
  return current;
}

function normalizeGoogleText(value = '') {
  return decodeRepeated(value)
    .replace(/\\u003d/gi, '=')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u002f/gi, '/')
    .replace(/%3A/gi, ':');
}

export function findPlaceId(text = '') {
  const decoded = normalizeGoogleText(text);
  const patterns = [
    /(?:placeid|place_id|query_place_id)[=:](?:%3D)?([A-Za-z0-9_-]{15,})/i,
    /[?&](?:placeid|place_id|query_place_id)=([A-Za-z0-9_-]{15,})/i,
    /lu-rap-thank-you-dialog[^\n]{0,1000}?(ChI[A-Za-z0-9_-]{15,})/i,
    /(?:^|[^A-Za-z0-9_-])(ChI[A-Za-z0-9_-]{15,})(?:[^A-Za-z0-9_-]|$)/,
    /(?:^|[^A-Za-z0-9_-])(EiJ[A-Za-z0-9_-]{15,})(?:[^A-Za-z0-9_-]|$)/,
    /(?:^|[^A-Za-z0-9_-])(GhI[A-Za-z0-9_-]{15,})(?:[^A-Za-z0-9_-]|$)/
  ];
  for (const pattern of patterns) {
    const match = decoded.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function cleanBusinessName(value = '') {
  return decodeRepeated(value)
    .replace(/\+/g, ' ')
    .replace(/\s+-\s+Google Maps.*$/i, '')
    .replace(/\s+on Google Maps.*$/i, '')
    .replace(/^Google Maps\s*[-–—:]?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function isUsefulBusinessName(name = '') {
  const normalized = cleanBusinessName(name).toLowerCase();
  return Boolean(normalized)
    && !['empresa', 'estabelecimento', 'google', 'google maps', 'maps'].includes(normalized)
    && !/^[-+]?\d+[.,]\d+/.test(normalized)
    && normalized.length >= 2;
}

export function extractName(finalUrl, html = '') {
  try {
    const url = new URL(finalUrl);
    const placeMatch = normalizeGoogleText(url.pathname).match(/\/maps\/place\/([^/]+)/i);
    if (placeMatch?.[1]) {
      const name = cleanBusinessName(placeMatch[1]);
      if (isUsefulBusinessName(name)) return name;
    }

    for (const key of ['q', 'query', 'daddr', 'destination']) {
      const value = url.searchParams.get(key);
      if (!value) continue;
      const decoded = decodeRepeated(value);
      // Links curtos frequentemente trazem "Nome - endereço". Mantemos o primeiro trecho.
      const firstPart = decoded.split(/\s+-\s+/)[0];
      const name = cleanBusinessName(firstPart);
      if (isUsefulBusinessName(name)) return name;
    }
  } catch {}

  const titlePatterns = [
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
    /<title[^>]*>([^<]+)<\/title>/i
  ];
  for (const pattern of titlePatterns) {
    const match = html.match(pattern);
    if (!match?.[1]) continue;
    const name = cleanBusinessName(match[1]);
    if (isUsefulBusinessName(name)) return name;
  }
  return '';
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

function extractLrdFeatureId(text = '') {
  const decoded = normalizeGoogleText(text);
  const match = decoded.match(/#lrd=(0x[0-9a-f]+:0x[0-9a-f]+),3/i);
  return match?.[1]?.toLowerCase() || null;
}

function extractLudocid(text = '') {
  try {
    return new URL(text).searchParams.get('ludocid') || null;
  } catch {
    return normalizeGoogleText(text).match(/[?&]ludocid=(\d+)/i)?.[1] || null;
  }
}

function isDirectReviewUrl(text = '') {
  const decoded = normalizeGoogleText(text);
  return /search\.google\.com\/local\/writereview\?placeid=/i.test(decoded)
    || /#lrd=0x[0-9a-f]+:0x[0-9a-f]+,3/i.test(decoded);
}

function extractCoordinates(text = '') {
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

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function extractHtmlRedirect(html = '', baseUrl = '') {
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

async function followGoogleRedirects(startUrl) {
  let currentUrl = startUrl;
  let lastHtml = '';
  const visited = new Set();

  for (let i = 0; i < 7; i += 1) {
    if (visited.has(currentUrl)) break;
    visited.add(currentUrl);

    const response = await fetchWithTimeout(currentUrl, {
      method: 'GET',
      redirect: 'manual',
      headers: BROWSER_HEADERS
    }, 12000);

    const location = response.headers.get('location');
    if (location && response.status >= 300 && response.status < 400) {
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    lastHtml = await response.text();
    const htmlRedirect = extractHtmlRedirect(lastHtml, currentUrl);
    if (htmlRedirect && htmlRedirect !== currentUrl) {
      currentUrl = htmlRedirect;
      continue;
    }

    return { finalUrl: response.url || currentUrl, html: lastHtml };
  }

  // Fallback: deixa o fetch seguir automaticamente quando o Google usa uma cadeia incomum.
  const response = await fetchWithTimeout(currentUrl, {
    method: 'GET',
    redirect: 'follow',
    headers: BROWSER_HEADERS
  }, 12000);
  return { finalUrl: response.url || currentUrl, html: await response.text() };
}

async function reverseGeocode(coords) {
  if (!coords) return null;
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('lat', String(coords.lat));
  url.searchParams.set('lon', String(coords.lon));
  url.searchParams.set('zoom', '18');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('accept-language', 'pt-BR');

  try {
    const response = await fetchWithTimeout(url.toString(), {
      headers: {
        'user-agent': 'NexarConnect/1.0 (+https://nexar-connect.netlify.app)',
        referer: 'https://nexar-connect.netlify.app/'
      }
    }, 8000);
    if (!response.ok) return null;
    const data = await response.json();
    const address = data?.address || {};
    const city = address.city || address.town || address.village || address.municipality || '';
    const state = address.state || '';
    const postcode = address.postcode || '';
    const road = address.road || address.pedestrian || address.square || '';
    const houseNumber = address.house_number || '';
    const shortAddress = [
      [road, houseNumber].filter(Boolean).join(', '),
      city,
      state,
      postcode
    ].filter(Boolean).join(' - ');
    return { city, state, postcode, shortAddress, displayName: data?.display_name || '' };
  } catch {
    return null;
  }
}

export function buildReviewUrlFromFeatureId(featureId, businessName, locationText = '') {
  const parts = featureId.split(':');
  if (parts.length !== 2) throw new Error('Identificador do Google Maps inválido.');
  const ludocid = BigInt(parts[1]).toString(10);
  const validName = isUsefulBusinessName(businessName) ? cleanBusinessName(businessName) : '';
  const query = [validName, locationText].filter(Boolean).join(' - ');
  const params = new URLSearchParams({ hl: 'pt-BR', gl: 'br', ludocid });
  if (query) params.set('q', query);
  return {
    ludocid,
    reviewUrl: query ? `https://www.google.com/search?${params.toString()}#lrd=${featureId},3` : ''
  };
}

async function resolveBusinessFromCid(featureId) {
  const ludocid = BigInt(featureId.split(':')[1]).toString(10);
  const urls = [
    `https://www.google.com/maps?cid=${ludocid}&hl=pt-BR`,
    `https://www.google.com/search?hl=pt-BR&gl=br&ludocid=${ludocid}`
  ];

  let best = { name: '', placeId: '', resolvedUrl: urls[0], coordinates: null, html: '' };
  for (const url of urls) {
    try {
      const resolved = await followGoogleRedirects(url);
      const combined = `${url}\n${resolved.finalUrl}\n${resolved.html}`;
      const candidate = {
        name: extractName(resolved.finalUrl, resolved.html),
        placeId: findPlaceId(combined) || '',
        resolvedUrl: resolved.finalUrl || url,
        coordinates: extractCoordinates(combined),
        html: resolved.html
      };
      if (candidate.placeId) return candidate;
      if (!best.name && candidate.name) best = candidate;
      if (!best.coordinates && candidate.coordinates) best.coordinates = candidate.coordinates;
    } catch {}
  }
  return best;
}

function responseForResolved({ method, sourceType, placeId = '', featureId = '', name = '', resolvedUrl, coordinates = null, location = null }) {
  if (placeId) {
    return {
      method,
      sourceType,
      official: true,
      placeId,
      featureId: featureId || null,
      name,
      coordinates,
      location,
      needsName: false,
      reviewUrl: `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`,
      resolvedUrl
    };
  }

  if (!featureId) throw new Error('Identificador do estabelecimento não encontrado.');
  const locationText = location?.shortAddress || (coordinates ? `${coordinates.lat}, ${coordinates.lon}` : '');
  const built = buildReviewUrlFromFeatureId(featureId, name, locationText);
  return {
    method,
    sourceType,
    official: false,
    placeId: null,
    featureId,
    ludocid: built.ludocid,
    name,
    coordinates,
    location,
    locationText,
    needsName: !isUsefulBusinessName(name),
    reviewUrl: built.reviewUrl,
    resolvedUrl
  };
}

export const handler = async (event) => {
  const p = preflight(event); if (p) return p;
  const auth = requireAdmin(event); if (!auth.ok) return auth.response;
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método não permitido.' });

  try {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido.' }); }
    let sharedUrl = String(body.url || '').trim();
    if (sharedUrl && !/^https?:\/\//i.test(sharedUrl)) sharedUrl = `https://${sharedUrl}`;
    if (!validUrl(sharedUrl)) return json(400, { error: 'Cole um link válido do Google Maps ou da Busca Google.' });

    const input = new URL(sharedUrl);
    const host = input.hostname.toLowerCase();
    if (!GOOGLE_HOSTS.has(host) && !host.endsWith('.google.com')) {
      return json(400, { error: 'Cole um link do Google Maps, da Busca Google ou um link direto de avaliação.' });
    }

    if (host === 'share.google') {
      return json(422, {
        error: 'Links share.google dependem do aplicativo Google e não revelam o estabelecimento de forma confiável. Abra o local no Google Maps e use Compartilhar para copiar um link maps.app.goo.gl, ou copie a URL completa no computador.',
        sourceType: 'share-google'
      });
    }

    if (isDirectReviewUrl(sharedUrl)) {
      return json(200, {
        method: 'direct-review',
        sourceType: 'direct-review',
        official: /search\.google\.com\/local\/writereview/i.test(sharedUrl),
        featureId: extractLrdFeatureId(sharedUrl),
        ludocid: extractLudocid(sharedUrl),
        name: extractName(sharedUrl, ''),
        needsName: false,
        reviewUrl: sharedUrl,
        resolvedUrl: sharedUrl
      });
    }

    const sourceType = host === 'maps.app.goo.gl' || host === 'goo.gl'
      ? 'maps-short'
      : /\/maps\//i.test(input.pathname) || host === 'maps.google.com'
        ? 'maps-full'
        : 'google-search';

    // URLs completas normalmente já contêm tudo e não dependem de redirecionamento.
    const inputFeatureId = findFeatureId(sharedUrl);
    const inputPlaceId = findPlaceId(sharedUrl);
    if (inputFeatureId || inputPlaceId) {
      let name = extractName(sharedUrl, '');
      let coordinates = extractCoordinates(sharedUrl);
      let placeId = inputPlaceId || '';
      let canonicalUrl = sharedUrl;

      if (inputFeatureId && (!name || !placeId)) {
        const cidData = await resolveBusinessFromCid(inputFeatureId);
        name = name || cidData.name;
        placeId = placeId || cidData.placeId;
        coordinates = coordinates || cidData.coordinates;
        canonicalUrl = cidData.resolvedUrl || canonicalUrl;
      }

      const location = await reverseGeocode(coordinates);
      return json(200, responseForResolved({
        method: placeId ? 'place-id' : 'feature-id-input',
        sourceType,
        placeId,
        featureId: inputFeatureId,
        name,
        resolvedUrl: canonicalUrl,
        coordinates,
        location
      }));
    }

    // Links curtos/mobile e URLs da Busca são expandidos no servidor.
    const resolved = await followGoogleRedirects(sharedUrl);
    const combined = `${sharedUrl}\n${resolved.finalUrl}\n${resolved.html}`;
    let name = extractName(resolved.finalUrl, resolved.html) || extractName(sharedUrl, '');
    let placeId = findPlaceId(combined) || '';
    const featureId = findFeatureId(combined);
    let coordinates = extractCoordinates(combined);
    let canonicalUrl = resolved.finalUrl || sharedUrl;

    if (featureId && (!name || !placeId)) {
      const cidData = await resolveBusinessFromCid(featureId);
      name = name || cidData.name;
      placeId = placeId || cidData.placeId;
      coordinates = coordinates || cidData.coordinates;
      canonicalUrl = cidData.resolvedUrl || canonicalUrl;
    }

    if (!placeId && !featureId) {
      return json(422, {
        error: sourceType === 'google-search'
          ? 'Essa URL é apenas uma página de resultados e não identifica uma empresa específica. Clique na ficha do estabelecimento e copie a URL do Maps ou use o botão Compartilhar no Google Maps.'
          : 'Não encontrei o identificador público nessa URL. Abra a ficha específica da empresa no Google Maps e copie novamente o link.',
        sourceType,
        resolvedUrl: canonicalUrl,
        name
      });
    }

    const location = await reverseGeocode(coordinates);
    return json(200, responseForResolved({
      method: placeId ? 'place-id' : 'feature-id',
      sourceType,
      placeId,
      featureId,
      name,
      resolvedUrl: canonicalUrl,
      coordinates,
      location
    }));
  } catch (err) {
    console.error('resolve maps error', err);
    const message = err?.name === 'AbortError'
      ? 'O Google demorou demais para responder. Tente novamente.'
      : 'Não foi possível interpretar esse link do Google Maps.';
    return json(500, { error: message });
  }
};
