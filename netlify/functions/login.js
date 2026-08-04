import { json, preflight, requireAdmin } from './_shared.js';
export const handler = async (event) => {
  const p = preflight(event); if (p) return p;
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método não permitido.' });
  const auth = requireAdmin(event); if (!auth.ok) return auth.response;
  return json(200, { ok: true });
};
