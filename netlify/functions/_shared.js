export const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type,x-admin-password',
    'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS'
  },
  body: statusCode === 204 ? '' : JSON.stringify(body)
});

export const preflight = (event) => event.httpMethod === 'OPTIONS' ? json(204, {}) : null;

export function requireAdmin(event) {
  const configured = process.env.ADMIN_PASSWORD;
  if (!configured) return { ok: false, response: json(500, { error: 'ADMIN_PASSWORD não configurada no Netlify.' }) };
  const provided = event.headers['x-admin-password'] || event.headers['X-Admin-Password'];
  if (provided !== configured) return { ok: false, response: json(401, { error: 'Senha inválida.' }) };
  return { ok: true };
}

export function cleanCode(value = '') {
  return String(value).toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32);
}

export function validUrl(value = '') {
  try {
    const u = new URL(value);
    return ['http:', 'https:'].includes(u.protocol);
  } catch {
    return false;
  }
}

function config() {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL e SUPABASE_SECRET_KEY não configuradas no Netlify.');
  }
  return { url, key };
}

export async function supabase(path, options = {}) {
  const { url, key } = config();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }

  if (!response.ok) {
    const detail = data?.message || data?.details || data?.hint || (typeof data === 'string' ? data : 'Falha no Supabase.');
    const error = new Error(detail);
    error.status = response.status;
    error.code = data?.code;
    throw error;
  }
  return data;
}

export function toClient(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    destination: row.destination,
    accesses: Number(row.hits || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
    lastAccessAt: row.last_access_at || null
  };
}
