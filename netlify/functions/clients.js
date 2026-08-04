import { json, preflight, requireAdmin, store, cleanCode, validUrl, getIndex, saveIndex } from './_shared.js';

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default async (event) => {
  const p = preflight(event); if (p) return p;
  const auth = requireAdmin(event); if (!auth.ok) return auth.response;
  const s = store();

  if (event.httpMethod === 'GET') {
    const index = await getIndex(s);
    const clients = [];
    for (const code of index) {
      const item = await s.get(`client:${code}`, { type: 'json' });
      if (item) clients.push(item);
    }
    clients.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    return json(200, { clients });
  }

  if (event.httpMethod === 'POST') {
    let body; try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido.' }); }
    const name = String(body.name || '').trim().slice(0, 120);
    const destination = String(body.destination || '').trim();
    if (!name) return json(400, { error: 'Informe o nome da empresa.' });
    if (!validUrl(destination)) return json(400, { error: 'Informe uma URL válida com http ou https.' });
    let code = cleanCode(body.code || '');
    if (!code) {
      do { code = makeCode(); } while (await s.get(`client:${code}`));
    } else if (await s.get(`client:${code}`)) {
      return json(409, { error: 'Esse código já existe.' });
    }
    const now = new Date().toISOString();
    const client = { code, name, destination, accesses: 0, createdAt: now, updatedAt: now, lastAccessAt: null };
    await s.setJSON(`client:${code}`, client);
    const index = await getIndex(s);
    index.push(code);
    await saveIndex(s, [...new Set(index)]);
    return json(201, { client });
  }

  return json(405, { error: 'Método não permitido.' });
};
