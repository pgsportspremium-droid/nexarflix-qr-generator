# Nexar Connect v2.9

Conversão de URL completa do Google Maps com desambiguação automática por localização.
A função extrai nome, feature ID e coordenadas; usa geocodificação reversa para acrescentar endereço/cidade à consulta e reduzir conflitos entre estabelecimentos homônimos.

# Nexar Connect v2.3

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


## Conversão gratuita de URL do Google Maps
Cole preferencialmente a URL completa do navegador contendo `!1s0x...:0x...`. O sistema extrai o feature ID, converte o CID hexadecimal para decimal (`ludocid`) e monta o link de escrita de avaliação com `#lrd=...,3`. Sempre use o botão **Testar avaliação** antes de imprimir a placa.


## Versão 2.5
- limpa automaticamente dados antigos ao analisar uma nova URL;
- botão Nova empresa;
- botões separados para abrir no Maps e testar avaliação;
- confirmação obrigatória antes de salvar no fluxo automático;
- código sugerido automaticamente;
- feedback de carregamento;
- diálogo de sucesso com baixar, copiar, testar e iniciar nova empresa.


## v2.6
- Aceita links do Google Maps colados com ou sem `https://`.
- Normaliza automaticamente URLs como `google.com/maps/place/...`.


## v2.7
- Aceita URL completa do Google Maps.
- Aceita links `maps.app.goo.gl` quando o redirecionamento revela o identificador público.
- Aceita links da Busca Google que já contenham `ludocid`/`#lrd`.
- Aceita links diretos oficiais de avaliação.
- Rejeita `share.google` com orientação clara.
- Reforça a validação no celular antes de imprimir a placa.


## Correção v2.8

A conversão agora reconhece o identificador `0x...:0x...` em qualquer posição da URL completa do Google Maps, inclusive variações como `!3m6!1s0x...:0x...`. A URL é processada antes de qualquer redirecionamento externo.

Exemplo validado:

```text
https://www.google.com/maps/place/Restaurante+611/...!3m6!1s0xa1c7c582cb2e09:0x5be4320c36db7e7c!...
```


## v2.9
- Corrige links curtos `maps.app.goo.gl` que expandem apenas para `ftid`.
- Recupera nome e URL canônica pelo CID antes de gerar o link de avaliação.
- Remove o fallback incorreto `empresa`, que causava pesquisa genérica no celular.
