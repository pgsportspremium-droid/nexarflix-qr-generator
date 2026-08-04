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
    const sharedUrl = String(body.url || '').trim();
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
    let placeId = findPlaceId(sharedUrl) || findPlaceId(finalUrl) || findPlaceId(html);
    const name = extractName(finalUrl, html);

    // Alguns links terminam em uma URL com CID/ftid. Tentamos abrir a página canônica,
    // pois frequentemente o HTML público contém o Place ID estável.
    if (!placeId) {
      const combined = decodeRepeated(`${finalUrl}\n${html}`);
      const featureMatch = combined.match(/(?:ftid=|!1s)(0x[0-9a-f]+:0x[0-9a-f]+)/i);
      if (featureMatch?.[1]) {
        const cidHex = featureMatch[1].split(':')[1];
        const cid = BigInt(cidHex).toString(10);
        const canonical = `https://www.google.com/maps?cid=${cid}`;
        const canonicalResponse = await fetchWithTimeout(canonical, {
          redirect: 'follow',
          headers: {
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
            'accept-language': 'pt-BR,pt;q=0.9,en;q=0.7'
          }
        });
        const canonicalHtml = await canonicalResponse.text();
        placeId = findPlaceId(canonicalResponse.url) || findPlaceId(canonicalHtml);
      }
    }

    if (!placeId) {
      return json(422, {
        error: 'O Google não revelou o Place ID nesse link. Use o modo manual somente para este estabelecimento.',
        resolvedUrl: finalUrl,
        name,
        fallbackUrl: finalUrl
      });
    }

    return json(200, {
      placeId,
      name,
      reviewUrl: `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`,
      resolvedUrl: finalUrl
    });
  } catch (err) {
    console.error('resolve maps error', err);
    const message = err?.name === 'AbortError'
      ? 'O Google demorou demais para responder. Tente novamente.'
      : 'Não foi possível interpretar esse link do Google Maps.';
    return json(500, { error: message });
  }
};
