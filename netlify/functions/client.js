import { json, preflight, requireAdmin, store, cleanCode, validUrl, getIndex, saveIndex } from './_shared.js';

export default async (event) => {
  const p = preflight(event); if (p) return p;
  const auth = requireAdmin(event); if (!auth.ok) return auth.response;
  const code = cleanCode(event.queryStringParameters?.code || '');
  if (!code) return json(400, { error: 'Código ausente.' });
  const s = store();
  const existing = await s.get(`client:${code}`, { type: 'json' });
  if (!existing) return json(404, { error: 'Empresa não encontrada.' });

  if (event.httpMethod === 'PUT') {
    let body; try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido.' }); }
    const name = String(body.name || '').trim().slice(0, 120);
    const destination = String(body.destination || '').trim();
    if (!name) return json(400, { error: 'Informe o nome.' });
    if (!validUrl(destination)) return json(400, { error: 'URL inválida.' });
    const updated = { ...existing, name, destination, updatedAt: new Date().toISOString() };
    await s.setJSON(`client:${code}`, updated);
    return json(200, { client: updated });
  }

  if (event.httpMethod === 'DELETE') {
    await s.delete(`client:${code}`);
    const index = (await getIndex(s)).filter(x => x !== code);
    await saveIndex(s, index);
    return json(200, { ok: true });
  }

  return json(405, { error: 'Método não permitido.' });
};
