Nexar Connect v4.2

Correção principal:
- Quando maps.app.goo.gl expande somente para maps.google.com?ftid=..., o backend converte o FTID em CID decimal.
- Em seguida abre a ficha pública pelo endpoint maps?cid=..., seguindo os redirecionamentos como Chrome desktop.
- Recupera a URL canônica /maps/place/NOME/, o nome e demais dados quando o Google os expõe.
- Mantém os formatos de desktop que já funcionavam.

Teste recomendado:
https://maps.app.goo.gl/vp4i56vwXDA6qT737?g_st=ipc
Resultado esperado: Villa Barroca Lofts.
