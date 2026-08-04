import { store, cleanCode } from './_shared.js';

export const handler = async (event) => {
  const code = cleanCode(event.queryStringParameters?.code || '');
  if (!code) return { statusCode: 404, body: 'QR inválido.' };
  const s = store();
  const client = await s.get(`client:${code}`, { type: 'json' });
  if (!client) return { statusCode: 404, headers: { 'content-type': 'text/html; charset=utf-8' }, body: '<h1>Link não encontrado</h1><p>Confira se o QR pertence a uma placa ativa.</p>' };
  const updated = { ...client, accesses: Number(client.accesses || 0) + 1, lastAccessAt: new Date().toISOString() };
  await s.setJSON(`client:${code}`, updated);
  return { statusCode: 302, headers: { location: client.destination, 'cache-control': 'no-store' }, body: '' };
};
