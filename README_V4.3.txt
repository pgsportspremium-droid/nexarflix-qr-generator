NEXAR CONNECT v4.3

Correções:
- extração mais robusta de nome a partir do HTML/bootstrap do Google Maps;
- busca de Place ID em formatos escapados;
- botão Testar avaliação usa navegação compatível com Safari/iPhone;
- botão nunca fica silencioso: mostra mensagem quando não há link;
- suporte opcional à variável GOOGLE_MAPS_API_KEY para gerar o link oficial por Place ID.

IMPORTANTE: sem Place ID ou link oficial do proprietário, o formato CID/#lrd é um fallback não garantido pelo Google em todos os celulares. Para garantia total, configure GOOGLE_MAPS_API_KEY no Netlify.
