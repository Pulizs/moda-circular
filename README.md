# Moda Circular ♻

Site de vendas e trocas de roupas entre universitários. Cada aluno tem uma loja (inventário), vê na vitrine as peças de colegas **da mesma faculdade** (de qualquer curso) e pode **propor troca** ou **compra**. A entrega é combinada entre os dois em um **ponto autorizado dentro do campus**.

- Frontend estático (HTML + CSS + JavaScript, sem build) → roda no **GitHub Pages grátis**
- Banco, login e fotos no **Supabase** (projeto `moda-circular`, região São Paulo)

## Funcionalidades

- Cadastro com nome, matrícula, CPF (validado), e-mail, data de nascimento, faculdade e curso
- Vitrine com busca e filtros (categoria, tamanho, venda/troca)
- Página da peça com fotos, preço, condição e botões **Propor troca** / **Quero comprar**
- Minha loja: cadastrar, editar e excluir peças (até 5 fotos, comprimidas automaticamente)
- Propostas recebidas/enviadas: aceitar, recusar, cancelar, concluir
- Combinar ponto de entrega + dia/horário e **chat em tempo real** dentro de cada proposta

## Regras garantidas pelo banco (não dá para burlar pelo navegador)

- Aluno só vê e negocia peças de colegas da **mesma faculdade**
- CPF, matrícula, nascimento e e-mail são visíveis **só para o próprio aluno**; colegas veem nome e curso
- CPF único; matrícula única por faculdade
- Na troca, a peça oferecida precisa ser do proponente e estar disponível
- Ao aceitar, as duas peças ficam **reservadas** e outras propostas com elas são recusadas
- Ao concluir, as peças saem da vitrine (trocada/vendida)
- Pontos de entrega precisam ser da faculdade dos alunos

Todo o schema está em [`supabase/schema.sql`](supabase/schema.sql).

## Publicar no GitHub Pages

1. Crie um repositório público no GitHub chamado `moda-circular` (sem README).
2. Nesta pasta, rode:
   ```bash
   git remote add origin https://github.com/SEU-USUARIO/moda-circular.git
   git push -u origin main
   ```
3. No GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `main`, pasta `/ (root)` → **Save**.
4. Em ~1 minuto o site estará em `https://SEU-USUARIO.github.io/moda-circular/`.

## Configurar o Supabase (uma vez)

No painel do projeto (supabase.com → projeto **moda-circular**):

1. **Authentication → URL Configuration**
   - *Site URL*: `https://SEU-USUARIO.github.io/moda-circular/`
   - *Redirect URLs*: adicione a mesma URL (e `http://localhost:8000/` se for testar localmente)
   
   Isso faz o link de confirmação de e-mail e de "esqueci minha senha" voltar para o site.
2. **Table Editor → faculdades / pontos_entrega**: edite a lista de faculdades e os pontos autorizados de cada campus. Já vêm alguns exemplos.
3. (Opcional) **Authentication → Emails**: o envio de e-mails padrão do Supabase tem limite baixo por hora; para uso real, configure um SMTP próprio.

## Rodar localmente

```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

## Estrutura

```
index.html          página única (rotas por #hash)
css/styles.css      visual (verde #a4b45b, creme #eae5d9, rosa #fdbdd8)
js/config.js        URL e chave pública do Supabase, categorias e tamanhos
js/app.js           toda a lógica do site
assets/             logos e ícones
supabase/schema.sql tabelas, regras de segurança (RLS), funções e dados iniciais
```

A chave em `js/config.js` é a chave **publishable** (pública por design). A proteção dos dados vem das políticas de Row Level Security do banco.
