import { getStore } from '@netlify/blobs';

export const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type,x-admin-password',
    'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS'
  },
  body: JSON.stringify(body)
});

export const preflight = (event) => event.httpMethod === 'OPTIONS' ? json(204, {}) : null;

export function requireAdmin(event) {
  const configured = process.env.ADMIN_PASSWORD;
  if (!configured) return { ok: false, response: json(500, { error: 'ADMIN_PASSWORD não configurada no Netlify.' }) };
  const provided = event.headers['x-admin-password'] || event.headers['X-Admin-Password'];
  if (provided !== configured) return { ok: false, response: json(401, { error: 'Senha inválida.' }) };
  return { ok: true };
}

export const store = () => getStore('nexar-connect');

export function cleanCode(value = '') {
  return value.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32);
}

export function validUrl(value = '') {
  try {
    const u = new URL(value);
    return ['http:', 'https:'].includes(u.protocol);
  } catch {
    return false;
  }
}

export async function getIndex(s) {
  return (await s.get('index', { type: 'json' })) || [];
}

export async function saveIndex(s, index) {
  await s.setJSON('index', index);
}
