# Nexar Connect — Supabase v2

MVP com painel administrativo, cadastro, edição, exclusão, QR PNG, link permanente e contador básico de acessos.

## Variáveis no Netlify

- `ADMIN_PASSWORD`
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY` (chave Secret atual) ou `SUPABASE_SERVICE_ROLE_KEY` (legada)

Nunca coloque a chave Secret/Service Role em arquivos da pasta `public`.

## Banco

Execute `supabase/setup.sql` uma vez no SQL Editor do Supabase.
