# Nexar Connect v4.0

Versão refatorada do conversor de links do Google Maps.

## Alterações principais

- Expansão dedicada de links `maps.app.goo.gl`, com rastreamento de cada redirecionamento.
- Leitura de URLs completas com `ftid=`, `!1s` e CID em qualquer posição.
- Extração separada de nome, CID/FTID, Place ID e coordenadas.
- Geração do link oficial quando um Place ID estiver disponível.
- Geração do link alternativo `ludocid + #lrd` quando houver apenas CID.
- Painel de diagnóstico técnico no formulário para mostrar a URL recebida, a URL expandida e os identificadores encontrados.
- O restante do painel, Supabase, login, cadastro, redirecionamento e geração de QR foi preservado.

## Publicação

Copie os arquivos desta versão para a pasta já conectada ao GitHub, preservando a pasta `.git`. Depois execute:

```powershell
git add .
git commit -m "Refatora conversor de links do Google Maps"
git push
```

Aguarde o deploy automático no Netlify e atualize o painel com `Ctrl + F5`.

## Diagnóstico

Depois de clicar em **Preencher automaticamente**, abra **Diagnóstico técnico do link**. Caso um link falhe, copie o conteúdo desse painel. Ele mostra exatamente o que o Google devolveu ao servidor.

## Limitação conhecida

Quando o Google fornece somente CID/FTID, o link de avaliação usa o formato público `ludocid + #lrd`. Esse formato não é uma API oficial e pode ter comportamento diferente entre navegadores móveis. Quando o Google expõe um Place ID, o sistema usa o link oficial `search.google.com/local/writereview?placeid=...`.
