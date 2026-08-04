import { json, preflight, requireAdmin, cleanCode, validUrl, supabase, toClient } from './_shared.js';

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

async function codeExists(code) {
  const rows = await supabase(`companies?select=id&code=eq.${encodeURIComponent(code)}&limit=1`);
  return Array.isArray(rows) && rows.length > 0;
}

export const handler = async (event) => {
  const p = preflight(event); if (p) return p;
  const auth = requireAdmin(event); if (!auth.ok) return auth.response;

  try {
    if (event.httpMethod === 'GET') {
      const rows = await supabase('companies?select=*&order=created_at.desc');
      return json(200, { clients: rows.map(toClient) });
    }

    if (event.httpMethod === 'POST') {
      let body;
      try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido.' }); }
      const name = String(body.name || '').trim().slice(0, 120);
      const destination = String(body.destination || '').trim();
      if (!name) return json(400, { error: 'Informe o nome da empresa.' });
      if (!validUrl(destination)) return json(400, { error: 'Informe uma URL válida com http ou https.' });

      let code = cleanCode(body.code || '');
      if (!code) {
        do { code = makeCode(); } while (await codeExists(code));
      } else if (await codeExists(code)) {
        return json(409, { error: 'Esse código já existe.' });
      }

      const rows = await supabase('companies', {
        method: 'POST',
        headers: { prefer: 'return=representation' },
        body: JSON.stringify({ name, code, destination, hits: 0 })
      });
      return json(201, { client: toClient(rows[0]) });
    }

    return json(405, { error: 'Método não permitido.' });
  } catch (err) {
    console.error('clients error', err);
    if (err.code === '23505') return json(409, { error: 'Esse código já existe.' });
    return json(err.status || 500, { error: err.message || 'Erro ao acessar o banco.' });
  }
};
