# Nexar Connect v2.2

MVP no Netlify + Supabase com:

- cadastro, edição e exclusão de empresas;
- link permanente por empresa;
- QR Code PNG;
- contador de acessos;
- modo automático para link compartilhado do Google Maps;
- modo manual quando o Google não expõe o Place ID publicamente.

## Atualização

Copie todo o conteúdo desta pasta para o repositório local, substituindo os arquivos, sem apagar a pasta `.git`.

```powershell
git add .
git commit -m "Adiciona conversor de link do Google Maps"
git push
```

No Netlify, aguarde o deploy. A lista de Functions deverá incluir `resolve-maps`.

## Como usar

1. No Google Maps, abra a empresa correta.
2. Clique em **Compartilhar** e copie o link.
3. No painel, cole no **Modo automático**.
4. Clique em **Preencher automaticamente**.
5. Confira nome e link direto de avaliação.
6. Clique em **Criar QR permanente**.

A extração é feita por dados públicos e não usa a API paga do Google. Alguns formatos do Maps escondem o Place ID; nesses casos, o sistema informa que o modo manual é necessário.
