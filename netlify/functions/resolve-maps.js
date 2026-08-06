import { json, preflight, requireAdmin, validUrl } from './_shared.js';
import {
  buildReviewLink,
  expandGoogleUrl,
  extractBusinessName,
  findFeatureId,
  findPlaceId,
  parseGoogleBusiness,
  resolveFeatureIdDetails
} from './google-link-utils.js';

const GOOGLE_HOSTS = new Set([
  'maps.app.goo.gl', 'goo.gl', 'www.google.com', 'google.com', 'maps.google.com', 'share.google'
]);

function sourceTypeFor(url) {
  const host = url.hostname.toLowerCase();
  if (host === 'maps.app.goo.gl' || host === 'goo.gl') return 'maps-short';
  if (/\/maps\//i.test(url.pathname) || host === 'maps.google.com') return 'maps-full';
  if (/search\.google\.com\/local\/writereview/i.test(url.href)) return 'direct-review';
  return 'google-search';
}

function isDirectReviewUrl(text = '') {
  return /search\.google\.com\/local\/writereview\?placeid=/i.test(text)
    || /#lrd=0x[0-9a-f]+:0x[0-9a-f]+,3/i.test(text);
}

function directReviewResponse(url) {
  const placeId = findPlaceId(url) || '';
  const featureId = findFeatureId(url) || '';
  return {
    method: 'direct-review', sourceType: 'direct-review', official: Boolean(placeId),
    placeId: placeId || null, featureId: featureId || null,
    name: extractBusinessName(url, ''), needsName: false,
    reviewUrl: url, resolvedUrl: url,
    diagnostics: { inputUrl: url, finalUrl: url, trace: [], placeId, featureId }
  };
}

export const handler = async (event) => {
  const p = preflight(event); if (p) return p;
  const auth = requireAdmin(event); if (!auth.ok) return auth.response;
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método não permitido.' });

  try {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido.' }); }
    let inputUrl = String(body.url || '').trim();
    if (inputUrl && !/^https?:\/\//i.test(inputUrl)) inputUrl = `https://${inputUrl}`;
    if (!validUrl(inputUrl)) return json(400, { error: 'Cole um link válido do Google Maps.' });

    const parsedInput = new URL(inputUrl);
    const host = parsedInput.hostname.toLowerCase();
    if (!GOOGLE_HOSTS.has(host) && !host.endsWith('.google.com')) {
      return json(400, { error: 'Cole um link do Google Maps ou um link direto de avaliação.' });
    }
    if (host === 'share.google') {
      return json(422, { error: 'Esse link foi criado pelo aplicativo Google. Abra o estabelecimento no Google Maps e use Compartilhar para copiar o link maps.app.goo.gl.', sourceType: 'share-google' });
    }
    if (isDirectReviewUrl(inputUrl)) return json(200, directReviewResponse(inputUrl));

    const sourceType = sourceTypeFor(parsedInput);
    let expanded = { finalUrl: inputUrl, html: '', trace: [] };
    const inputHasIds = Boolean(findFeatureId(inputUrl) || findPlaceId(inputUrl));

    // Links curtos precisam obrigatoriamente ser expandidos. URLs completas só são carregadas quando faltam dados.
    if (sourceType === 'maps-short' || !inputHasIds) {
      expanded = await expandGoogleUrl(inputUrl);
    }

    let business = parseGoogleBusiness({ inputUrl, finalUrl: expanded.finalUrl, html: expanded.html });

    // Links mobile frequentemente expandem apenas para maps.google.com?ftid=... sem nome.
    // Fazemos então uma segunda resolução pelo CID para obter a ficha canônica /maps/place/NOME/.
    let cidResolution = null;
    if (business.featureId && !business.name) {
      cidResolution = await resolveFeatureIdDetails(business.featureId);
      business = {
        featureId: business.featureId || cidResolution.featureId,
        placeId: business.placeId || cidResolution.placeId,
        name: business.name || cidResolution.name,
        coordinates: business.coordinates || cidResolution.coordinates,
        queryText: business.queryText || cidResolution.queryText
      };
      if (cidResolution.finalUrl) expanded.finalUrl = cidResolution.finalUrl;
      if (cidResolution.html) expanded.html = cidResolution.html;
      if (cidResolution.trace?.length) expanded.trace.push(...cidResolution.trace);
    }

    // Algumas URLs completas têm o identificador, mas o nome só aparece no HTML/título.
    if ((!business.name || (!business.featureId && !business.placeId)) && sourceType !== 'maps-short') {
      const loaded = await expandGoogleUrl(inputUrl);
      expanded = loaded;
      business = parseGoogleBusiness({ inputUrl, finalUrl: loaded.finalUrl, html: loaded.html });
    }

    if (!business.featureId && !business.placeId) {
      return json(422, {
        error: 'O Google abriu o link, mas não revelou o identificador do estabelecimento. Confirme que o link foi copiado da ficha específica da empresa no Google Maps.',
        sourceType,
        resolvedUrl: expanded.finalUrl,
        diagnostics: {
          inputUrl, finalUrl: expanded.finalUrl, trace: expanded.trace,
          name: business.name || '', placeId: '', featureId: ''
        }
      });
    }

    // Sem API paga, o nome nem sempre vem no redirect do celular. Nesse caso o campo fica editável.
    const built = buildReviewLink({
      placeId: business.placeId || '',
      featureId: business.featureId || '',
      name: business.name || '',
      queryText: business.queryText || ''
    });

    return json(200, {
      method: built.official ? 'place-id' : 'feature-id',
      sourceType,
      official: built.official,
      placeId: business.placeId || null,
      featureId: business.featureId || null,
      ludocid: built.ludocid,
      name: business.name || '',
      needsName: !business.name,
      reviewUrl: built.reviewUrl,
      resolvedUrl: expanded.finalUrl || inputUrl,
      locationText: business.queryText || '',
      diagnostics: {
        inputUrl,
        finalUrl: expanded.finalUrl || inputUrl,
        trace: expanded.trace,
        name: business.name || '',
        placeId: business.placeId || '',
        featureId: business.featureId || '',
        reviewMode: built.official ? 'official-place-id' : 'cid-lrd',
        queryText: business.queryText || '',
        cid: cidResolution?.cid || null,
        cidResolvedUrl: cidResolution?.finalUrl || null
      }
    });
  } catch (err) {
    console.error('resolve maps error', err);
    const error = err?.name === 'AbortError'
      ? 'O Google demorou demais para responder. Tente novamente.'
      : 'Não foi possível interpretar esse link do Google Maps.';
    return json(500, { error });
  }
};
