# Nexar Connect — MVP

Painel simples para cadastrar empresas, gerar QR permanente, editar destinos e contar acessos.

## Publicar no Netlify

1. Crie uma conta/projeto novo no Netlify.
2. Preferencialmente envie este projeto para um repositório GitHub e use **Add new project > Import an existing project**.
3. O Netlify detectará o `netlify.toml`. Não é necessário comando de build.
4. Em **Project configuration > Environment variables**, crie:
   - `ADMIN_PASSWORD` = uma senha forte escolhida por você.
5. Faça o deploy.
6. Abra o endereço `https://seu-projeto.netlify.app` e entre com essa senha.

## Uso

- Cadastre nome e link de destino.
- O sistema cria um código aleatório ou aceita um código personalizado.
- O QR aponta para `https://seu-projeto.netlify.app/r/CODIGO`.
- Você pode editar o destino depois sem trocar a placa.
- Cada leitura aumenta o contador.

## Observações

- Os dados ficam no Netlify Blobs, persistindo entre deploys.
- O QR é gerado no navegador e baixado em PNG 800×800.
- Para não quebrar placas já impressas, não exclua o projeto nem altere o subdomínio `.netlify.app` sem manter redirecionamento.
- Este é um MVP de administrador único. Não possui contas separadas para comerciantes.
