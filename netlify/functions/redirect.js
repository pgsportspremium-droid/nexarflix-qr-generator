import { cleanCode, supabase } from './_shared.js';

function html(statusCode, title, message) {
  return {
    statusCode,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    body: `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font-family:Arial,sans-serif;padding:40px;max-width:620px;margin:auto"><h1>${title}</h1><p>${message}</p></body></html>`
  };
}

export const handler = async (event) => {
  const code = cleanCode(event.queryStringParameters?.code || '');
  if (!code) return html(404, 'QR inválido', 'O código informado não é válido.');

  try {
    const rows = await supabase(`companies?select=*&code=eq.${encodeURIComponent(code)}&limit=1`);
    const company = rows[0];
    if (!company) return html(404, 'Link não encontrado', 'Confira se o QR pertence a uma placa ativa.');

    const now = new Date().toISOString();
    await supabase(`companies?code=eq.${encodeURIComponent(code)}`, {
      method: 'PATCH',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify({
        hits: Number(company.hits || 0) + 1,
        last_access_at: now,
        updated_at: now
      })
    });

    return {
      statusCode: 302,
      headers: { location: company.destination, 'cache-control': 'no-store' },
      body: ''
    };
  } catch (err) {
    console.error('redirect error', err);
    return html(500, 'Não foi possível abrir o link', 'Tente novamente em alguns instantes.');
  }
};
