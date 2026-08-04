import { json, preflight, requireAdmin, validUrl } from './_shared.js';

const GOOGLE_HOSTS = new Set([
  'maps.app.goo.gl',
  'goo.gl',
  'www.google.com',
  'google.com',
  'maps.google.com'
]);

function decodeRepeated(value = '') {
  let current = String(value);
  for (let i = 0; i < 3; i++) {
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

function findPlaceId(text = '') {
  const decoded = decodeRepeated(text).replace(/\\u003d/g, '=').replace(/\\u0026/g, '&');
  const patterns = [
    /(?:placeid|place_id|query_place_id)[=:]%?3?D?([A-Za-z0-9_-]{15,})/i,
    /[?&](?:placeid|place_id|query_place_id)=([A-Za-z0-9_-]{15,})/i,
    /(?:^|[^A-Za-z0-9_-])(ChI[A-Za-z0-9_-]{15,})(?:[^A-Za-z0-9_-]|$)/,
    /(?:^|[^A-Za-z0-9_-])(EiJ[A-Za-z0-9_-]{15,})(?:[^A-Za-z0-9_-]|$)/
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
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function extractName(finalUrl, html = '') {
  try {
    const url = new URL(finalUrl);
    for (const key of ['q', 'query', 'daddr', 'destination']) {
      const value = url.searchParams.get(key);
      if (value) {
        const firstPart = decodeRepeated(value).split(' - ')[0];
        const name = cleanBusinessName(firstPart);
        if (name && !/^[-+]?\d+[.,]\d+/.test(name)) return name;
      }
    }
    const placeMatch = decodeRepeated(url.pathname).match(/\/maps\/place\/([^/]+)/i);
    if (placeMatch?.[1]) return cleanBusinessName(placeMatch[1]);
  } catch {}

  const titlePatterns = [
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
    /<title[^>]*>([^<]+)<\/title>/i
  ];
  for (const pattern of titlePatterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      const name = cleanBusinessName(match[1]);
      if (name && !/^Google Maps$/i.test(name)) return name;
    }
  }
  return '';
}


function findFeatureId(text = '') {
  const decoded = decodeRepeated(text)
    .replace(/\\u003d/g, '=')
    .replace(/\\u0026/g, '&')
    .replace(/%3A/ig, ':');
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


function extractCoordinates(text = '') {
  const decoded = decodeRepeated(text);
  const patterns = [
    /\/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /!3d(-?\d+(?:\.\d+)?)[^!]*!4d(-?\d+(?:\.\d+)?)/,
    /[?&](?:query|q)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/
  ];
  for (const pattern of patterns) {
    const match = decoded.match(pattern);
    if (match) {
      const lat = Number(match[1]);
      const lon = Number(match[2]);
      if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
    }
  }
  return null;
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
        'referer': 'https://nexar-connect.netlify.app/'
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
  } catch (error) {
    console.warn('reverse geocode unavailable', error?.message || error);
    return null;
  }
}

function buildReviewUrlFromFeatureId(featureId, businessName, locationText = '') {
  const parts = featureId.split(':');
  if (parts.length !== 2) throw new Error('Identificador do Google Maps inválido.');
  const ludocid = BigInt(parts[1]).toString(10);
  const query = [businessName || 'empresa', locationText].filter(Boolean).join(' - ');
  const params = new URLSearchParams({
    hl: 'pt-BR',
    gl: 'br',
    q: query,
    ludocid
  });
  return {
    ludocid,
    reviewUrl: `https://www.google.com/search?${params.toString()}#lrd=${featureId},3`
  };
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

export const handler = async (event) => {
  const p = preflight(event); if (p) return p;
  const auth = requireAdmin(event); if (!auth.ok) return auth.response;
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método não permitido.' });

  try {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido.' }); }
    let sharedUrl = String(body.url || '').trim();
    // Aceita URLs copiadas sem o protocolo visível, por exemplo google.com/maps/...
    if (sharedUrl && !/^https?:\/\//i.test(sharedUrl)) sharedUrl = `https://${sharedUrl}`;
    if (!validUrl(sharedUrl)) return json(400, { error: 'Cole um link válido do Google Maps.' });

    const input = new URL(sharedUrl);
    if (!GOOGLE_HOSTS.has(input.hostname.toLowerCase()) && !input.hostname.toLowerCase().endsWith('.google.com')) {
      return json(400, { error: 'O link precisa ser do Google Maps.' });
    }

    let response = await fetchWithTimeout(sharedUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
        'accept-language': 'pt-BR,pt;q=0.9,en;q=0.7'
      }
    });

    const finalUrl = response.url || sharedUrl;
    const html = await response.text();
    const combined = `${sharedUrl}\n${finalUrl}\n${html}`;
    const name = extractName(finalUrl, html) || extractName(sharedUrl, '');

    // Método oficial quando o Place ID está publicamente disponível.
    const placeId = findPlaceId(combined);
    if (placeId) {
      return json(200, {
        method: 'place-id',
        placeId,
        name,
        reviewUrl: `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`,
        resolvedUrl: finalUrl
      });
    }

    // Método gratuito para URLs completas do Maps: usa o feature ID público
    // 0x...:0x..., converte a segunda parte para ludocid e abre #lrd=...,3.
    const featureId = findFeatureId(combined);
    if (featureId) {
      const coordinates = extractCoordinates(`${sharedUrl}\n${finalUrl}`);
      const geo = await reverseGeocode(coordinates);
      const locationText = geo?.shortAddress
        || (coordinates ? `${coordinates.lat}, ${coordinates.lon}` : '');
      const built = buildReviewUrlFromFeatureId(featureId, name, locationText);
      return json(200, {
        method: 'feature-id',
        featureId,
        ludocid: built.ludocid,
        name,
        coordinates,
        location: geo,
        reviewUrl: built.reviewUrl,
        resolvedUrl: finalUrl
      });
    }

    return json(422, {
      error: 'Não encontrei o identificador público nessa URL. No computador, abra a empresa no Google Maps e copie a URL completa da barra do navegador.',
      resolvedUrl: finalUrl,
      name,
      fallbackUrl: finalUrl
    });
  } catch (err) {
    console.error('resolve maps error', err);
    const message = err?.name === 'AbortError'
      ? 'O Google demorou demais para responder. Tente novamente.'
      : 'Não foi possível interpretar esse link do Google Maps.';
    return json(500, { error: message });
  }
};
