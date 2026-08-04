import { json, preflight, requireAdmin, cleanCode, validUrl, supabase, toClient } from './_shared.js';

export const handler = async (event) => {
  const p = preflight(event); if (p) return p;
  const auth = requireAdmin(event); if (!auth.ok) return auth.response;
  const code = cleanCode(event.queryStringParameters?.code || '');
  if (!code) return json(400, { error: 'Código ausente.' });

  try {
    const existing = await supabase(`companies?select=*&code=eq.${encodeURIComponent(code)}&limit=1`);
    if (!existing.length) return json(404, { error: 'Empresa não encontrada.' });

    if (event.httpMethod === 'PUT') {
      let body;
      try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido.' }); }
      const name = String(body.name || '').trim().slice(0, 120);
      const destination = String(body.destination || '').trim();
      if (!name) return json(400, { error: 'Informe o nome.' });
      if (!validUrl(destination)) return json(400, { error: 'URL inválida.' });

      const rows = await supabase(`companies?code=eq.${encodeURIComponent(code)}`, {
        method: 'PATCH',
        headers: { prefer: 'return=representation' },
        body: JSON.stringify({ name, destination, updated_at: new Date().toISOString() })
      });
      return json(200, { client: toClient(rows[0]) });
    }

    if (event.httpMethod === 'DELETE') {
      await supabase(`companies?code=eq.${encodeURIComponent(code)}`, {
        method: 'DELETE',
        headers: { prefer: 'return=minimal' }
      });
      return json(200, { ok: true });
    }

    return json(405, { error: 'Método não permitido.' });
  } catch (err) {
    console.error('client error', err);
    return json(err.status || 500, { error: err.message || 'Erro ao acessar o banco.' });
  }
};
