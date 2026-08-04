# Nexar Connect — Supabase v2.1

Correções desta versão:

- o endereço `/r/CODIGO` envia corretamente o código para a Function de redirecionamento;
- a Function também extrai o código do caminho como proteção adicional;
- o QR é gerado no servidor, sem depender de biblioteca externa carregada no navegador;
- download do QR em PNG de 1200 px.

## Variáveis no Netlify

- `ADMIN_PASSWORD`
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`

## Banco

Execute `supabase/setup.sql` uma vez no SQL Editor do Supabase.
