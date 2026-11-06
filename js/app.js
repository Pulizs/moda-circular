import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_KEY, CATEGORIAS, TAMANHOS, CONDICOES } from './config.js';

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
const app = document.getElementById('app');
const modal = document.getElementById('modal');
const estado = { sessao: null, perfil: null, canal: null, pontos: null, iniciado: false };

/* =====================================================================
   Utilidades
   ===================================================================== */
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const moeda = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataHora = (v) => new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const dataCurta = (v) => new Date(v).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
const inicial = (nome) => esc((nome || '?').trim().charAt(0).toUpperCase());
const primeiroNome = (nome) => esc((nome || '').trim().split(/\s+/)[0]);
const soDigitos = (v) => String(v || '').replace(/\D/g, '');
const eu = () => estado.sessao?.user?.id;

function cpfValido(cpf) {
  cpf = soDigitos(cpf);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const dig = (n) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(cpf[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dig(9) === Number(cpf[9]) && dig(10) === Number(cpf[10]);
}
function mascararCpf(valor) {
  const d = soDigitos(valor).slice(0, 11);
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

let toastTimer;
function toast(texto, erro = false) {
  const t = document.getElementById('toast');
  t.textContent = texto;
  t.classList.toggle('erro', erro);
  t.classList.add('visivel');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('visivel'), 3600);
}
function msgErro(e) {
  const m = e?.message || String(e);
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/Email not confirmed/i.test(m)) return 'Confirme seu e-mail antes de entrar (veja sua caixa de entrada).';
  if (/User already registered/i.test(m)) return 'Este e-mail já tem conta.';
  if (/Password should be at least/i.test(m)) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (/rate limit/i.test(m)) return 'Muitas tentativas. Aguarde alguns minutos.';
  if (/Database error saving new user/i.test(m)) return 'Não foi possível criar a conta. Confira CPF, matrícula e faculdade.';
  if (/propostas_uma_pendente_idx/.test(m)) return 'Você já tem uma proposta pendente para essa peça.';
  return m;
}
function ocupado(botao, sim, texto) {
  if (!botao) return;
  if (sim) { botao.dataset.txt = botao.innerHTML; botao.disabled = true; botao.innerHTML = texto || 'Aguarde…'; }
  else { botao.disabled = false; if (botao.dataset.txt) botao.innerHTML = botao.dataset.txt; }
}
const carregando = () => { app.innerHTML = '<div class="carregando"><span class="spinner"></span></div>'; };
const foto = (url, alt = '') => url
  ? `<img src="${esc(url)}" alt="${esc(alt)}" loading="lazy">`
  : `<div class="sem-foto"><img src="assets/selo.png" alt=""></div>`;

function abrirModal(html) {
  modal.innerHTML = `<div class="modal-corpo">${html}</div>`;
  modal.querySelectorAll('[data-fechar]').forEach((b) => b.addEventListener('click', fecharModal));
  modal.showModal();
  return modal;
}
function fecharModal() { modal.close(); modal.innerHTML = ''; }
modal.addEventListener('click', (e) => { if (e.target === modal) fecharModal(); });

async function pontosEntrega() {
  if (estado.pontos) return estado.pontos;
  const { data } = await sb.from('pontos_entrega').select('id, nome, descricao').order('nome');
  estado.pontos = data || [];
  return estado.pontos;
}
const opcoesPontos = (pontos, sel) => `<option value="">A combinar</option>` +
  pontos.map((p) => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.nome)}${p.descricao ? ' — ' + esc(p.descricao) : ''}</option>`).join('');

async function comprimirImagem(arquivo) {
  const bmp = await createImageBitmap(arquivo);
  const escala = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * escala);
  c.height = Math.round(bmp.height * escala);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.85));
}

/* =====================================================================
   Sessão e navegação
   ===================================================================== */
async function carregarPerfil() {
  if (!estado.sessao) { estado.perfil = null; return; }
  const { data } = await sb.from('perfis')
    .select('id, nome, curso, faculdade_id, faculdade:faculdades(nome, sigla)')
    .eq('id', eu()).maybeSingle();
  estado.perfil = data;
}

async function atualizarBadge() {
  const badge = document.getElementById('badge');
  if (!estado.sessao) { badge.hidden = true; return; }
  const { count } = await sb.from('propostas').select('id', { count: 'exact', head: true })
    .eq('destinatario_id', eu()).eq('status', 'pendente');
  badge.textContent = count || '';
  badge.hidden = !count;
}

function atualizarNav(rota) {
  const nav = document.getElementById('nav');
  nav.hidden = !estado.sessao;
  nav.querySelectorAll('a').forEach((a) => a.classList.toggle('ativo', a.dataset.rota === rota));
  if (estado.perfil) document.getElementById('nav-perfil').textContent = primeiroNome(estado.perfil.nome) || 'Perfil';
}

function limparCanal() {
  if (estado.canal) { sb.removeChannel(estado.canal); estado.canal = null; }
}

const rotas = [
  [/^\/$/, 'vitrine', vitrine],
  [/^\/roupa\/([\w-]+)$/, 'vitrine', detalheRoupa],
  [/^\/minha-loja$/, 'minha-loja', minhaLoja],
  [/^\/nova-peca$/, 'minha-loja', () => formPeca()],
  [/^\/editar\/([\w-]+)$/, 'minha-loja', formPeca],
  [/^\/propostas$/, 'propostas', listaPropostas],
  [/^\/proposta\/([\w-]+)$/, 'propostas', detalheProposta],
  [/^\/perfil$/, 'perfil', perfil],
  [/^\/entrar$/, null, entrar],
  [/^\/cadastro$/, null, cadastro],
];

async function roteador() {
  if (!estado.iniciado) return;
  if (modal.open) fecharModal();
  limparCanal();
  const caminho = location.hash.replace(/^#/, '') || '/';
  const publica = caminho === '/entrar' || caminho === '/cadastro';

  if (!estado.sessao && !publica) return irPara('/entrar');
  if (estado.sessao && publica) return irPara('/');

  const rota = rotas.find(([re]) => re.test(caminho));
  if (!rota) return irPara('/');
  const [re, nome, fn] = rota;
  atualizarNav(nome);
  window.scrollTo(0, 0);
  carregando();
  try {
    await fn(...(caminho.match(re).slice(1)));
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="vazio"><img src="assets/selo.png" alt=""><p>Algo deu errado: ${esc(msgErro(e))}</p><a class="btn" href="#/">Voltar à vitrine</a></div>`;
  }
  if (estado.sessao) atualizarBadge();
}
function irPara(caminho) {
  if (location.hash === '#' + caminho) roteador();
  else location.hash = caminho;
}
window.addEventListener('hashchange', roteador);

/* =====================================================================
   Entrar / cadastro
   ===================================================================== */
const heroHtml = `
  <div class="hero-texto">
    <img class="hero-selo" src="assets/selo.png" alt="Reduce, reuse, recycle">
    <h1>Seu guarda-roupa <em>circula</em> pelo campus.</h1>
    <p>Venda e troque roupas com colegas da sua faculdade — de qualquer curso. Sem frete: a entrega é combinada em pontos autorizados do campus.</p>
    <ol class="passos">
      <li><span>1</span><div>Crie sua conta com seus dados de aluno.</div></li>
      <li><span>2</span><div>Cadastre na sua loja as peças que não usa mais.</div></li>
      <li><span>3</span><div>Proponha trocas ou compras e combine a entrega no campus.</div></li>
    </ol>
  </div>`;

function entrar() {
  app.innerHTML = `
    <section class="hero">
      ${heroHtml}
      <div class="cartao">
        <h2>Entrar</h2>
        <form class="form" id="f-entrar" novalidate>
          <div class="campo"><label for="email">E-mail</label><input id="email" name="email" type="email" autocomplete="email" required></div>
          <div class="campo"><label for="senha">Senha</label><input id="senha" name="senha" type="password" autocomplete="current-password" required></div>
          <div id="erro" class="erro-form" hidden></div>
          <button class="btn btn-bloco" type="submit">Entrar</button>
          <button class="btn btn-contorno btn-bloco" type="button" id="esqueci">Esqueci minha senha</button>
        </form>
        <p class="alternar">Ainda não tem conta? <a href="#/cadastro">Cadastre-se</a></p>
      </div>
    </section>`;
  const f = document.getElementById('f-entrar');
  const erro = document.getElementById('erro');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    erro.hidden = true;
    const btn = f.querySelector('[type=submit]');
    ocupado(btn, true, 'Entrando…');
    const { error } = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.senha.value });
    ocupado(btn, false);
    if (error) { erro.textContent = msgErro(error); erro.hidden = false; }
  });
  document.getElementById('esqueci').addEventListener('click', async () => {
    const email = f.email.value.trim();
    if (!email) { erro.textContent = 'Digite seu e-mail acima para receber o link.'; erro.hidden = false; return; }
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    if (error) toast(msgErro(error), true);
    else toast('Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha.');
  });
}

async function cadastro() {
  const { data: faculdades, error } = await sb.from('faculdades').select('id, nome, sigla').order('nome');
  if (error) throw error;
  app.innerHTML = `
    <section class="estreito">
      <div class="cartao">
        <h1>Criar conta</h1>
        <p class="subtitulo">Só alunos da mesma faculdade negociam entre si.</p>
        <form class="form" id="f-cad" novalidate style="margin-top:20px">
          <div class="campo"><label for="nome">Nome completo</label><input id="nome" name="nome" autocomplete="name" required minlength="2"></div>
          <div class="form-grade">
            <div class="campo"><label for="cpf">CPF</label><input id="cpf" name="cpf" inputmode="numeric" placeholder="000.000.000-00" required></div>
            <div class="campo"><label for="nasc">Data de nascimento</label><input id="nasc" name="nasc" type="date" required max="${new Date().toISOString().slice(0, 10)}"></div>
          </div>
          <div class="campo"><label for="faculdade">Faculdade</label>
            <select id="faculdade" name="faculdade" required>
              <option value="">Selecione…</option>
              ${faculdades.map((f) => `<option value="${f.id}">${esc(f.nome)}${f.sigla ? ' (' + esc(f.sigla) + ')' : ''}</option>`).join('')}
            </select>
          </div>
          <div class="form-grade">
            <div class="campo"><label for="curso">Curso</label><input id="curso" name="curso" required></div>
            <div class="campo"><label for="matricula">Número de matrícula</label><input id="matricula" name="matricula" required></div>
          </div>
          <div class="campo"><label for="email">E-mail</label><input id="email" name="email" type="email" autocomplete="email" required></div>
          <div class="campo"><label for="senha">Senha</label><input id="senha" name="senha" type="password" autocomplete="new-password" minlength="6" required><small>Mínimo de 6 caracteres.</small></div>
          <div id="erro" class="erro-form" hidden></div>
          <button class="btn btn-bloco" type="submit">Criar minha conta</button>
        </form>
        <p class="alternar">Já tem conta? <a href="#/entrar">Entrar</a></p>
      </div>
    </section>`;

  const f = document.getElementById('f-cad');
  const erro = document.getElementById('erro');
  f.cpf.addEventListener('input', () => { f.cpf.value = mascararCpf(f.cpf.value); f.cpf.removeAttribute('aria-invalid'); });

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    erro.hidden = true;
    const v = {
      nome: f.nome.value.trim(), cpf: soDigitos(f.cpf.value), nasc: f.nasc.value,
      faculdade: f.faculdade.value, curso: f.curso.value.trim(), matricula: f.matricula.value.trim(),
      email: f.email.value.trim(), senha: f.senha.value,
    };
    const falha = (m, campo) => { erro.textContent = m; erro.hidden = false; if (campo) { f[campo].setAttribute('aria-invalid', 'true'); f[campo].focus(); } };
    if (v.nome.length < 2) return falha('Informe seu nome.', 'nome');
    if (!cpfValido(v.cpf)) return falha('CPF inválido.', 'cpf');
    if (!v.nasc) return falha('Informe sua data de nascimento.', 'nasc');
    if (!v.faculdade) return falha('Selecione sua faculdade.', 'faculdade');
    if (v.curso.length < 2) return falha('Informe seu curso.', 'curso');
    if (v.matricula.length < 3) return falha('Informe seu número de matrícula.', 'matricula');
    if (!/^\S+@\S+\.\S+$/.test(v.email)) return falha('E-mail inválido.', 'email');
    if (v.senha.length < 6) return falha('A senha precisa ter pelo menos 6 caracteres.', 'senha');

    const btn = f.querySelector('[type=submit]');
    ocupado(btn, true, 'Criando conta…');
    const { data: problema, error: errVer } = await sb.rpc('verificar_cadastro', {
      p_cpf: v.cpf, p_faculdade: Number(v.faculdade), p_matricula: v.matricula,
    });
    if (errVer || problema) { ocupado(btn, false); return falha(problema || msgErro(errVer)); }

    const { data, error } = await sb.auth.signUp({
      email: v.email,
      password: v.senha,
      options: {
        emailRedirectTo: location.origin + location.pathname,
        data: { nome: v.nome, cpf: v.cpf, data_nascimento: v.nasc, faculdade_id: v.faculdade, curso: v.curso, matricula: v.matricula },
      },
    });
    ocupado(btn, false);
    if (error) return falha(msgErro(error));
    if (!data.session) {
      app.innerHTML = `
        <section class="estreito"><div class="cartao" style="text-align:center">
          <img src="assets/selo.png" alt="" style="width:110px;margin:0 auto 16px">
          <h1>Confira seu e-mail</h1>
          <p>Enviamos um link de confirmação para <strong>${esc(v.email)}</strong>. Clique nele para ativar sua conta e depois entre no site.</p>
          <a class="btn" href="#/entrar">Ir para o login</a>
        </div></section>`;
    }
  });
}

/* =====================================================================
   Vitrine
   ===================================================================== */
function cartaoPeca(r) {
  return `
    <a class="peca" href="#/roupa/${r.id}">
      <div class="peca-foto">
        ${foto(r.fotos?.[0], r.titulo)}
        <div class="etiquetas">
          ${r.aceita_troca ? '<span class="etiqueta etiqueta-troca">Aceita troca</span>' : ''}
          ${r.preco != null ? '<span class="etiqueta etiqueta-venda">À venda</span>' : ''}
        </div>
      </div>
      <div class="peca-info">
        <span class="peca-preco">${r.preco != null ? moeda(r.preco) : 'Só troca'}</span>
        <span class="peca-titulo">${esc(r.titulo)}</span>
        <span class="peca-meta">Tam. ${esc(r.tamanho)} · ${esc(CONDICOES[r.condicao] || r.condicao)}${r.dono ? ' · ' + primeiroNome(r.dono.nome) : ''}</span>
      </div>
    </a>`;
}

async function vitrine() {
  const fac = estado.perfil?.faculdade;
  app.innerHTML = `
    <div class="cabecalho-pagina">
      <div>
        <h1>Vitrine${fac?.sigla ? ' da ' + esc(fac.sigla) : ''}</h1>
        <p class="subtitulo">Peças de colegas da ${esc(fac?.nome || 'sua faculdade')}, de todos os cursos.</p>
      </div>
      <a class="btn btn-rosa" href="#/nova-peca">+ Anunciar peça</a>
    </div>
    <div class="filtros">
      <input class="busca" id="busca" type="search" placeholder="Buscar: jaqueta, vestido, tênis…" aria-label="Buscar">
      <select id="f-cat" aria-label="Categoria"><option value="">Todas as categorias</option>${CATEGORIAS.map((c) => `<option>${esc(c)}</option>`).join('')}</select>
      <select id="f-tam" aria-label="Tamanho"><option value="">Todos os tamanhos</option>${TAMANHOS.map((t) => `<option>${esc(t)}</option>`).join('')}</select>
      <select id="f-tipo" aria-label="Tipo"><option value="">Venda e troca</option><option value="venda">À venda</option><option value="troca">Aceita troca</option></select>
    </div>
    <div id="resultado"><div class="carregando"><span class="spinner"></span></div></div>`;

  const res = document.getElementById('resultado');
  const busca = document.getElementById('busca');
  const cat = document.getElementById('f-cat');
  const tam = document.getElementById('f-tam');
  const tipo = document.getElementById('f-tipo');
  let seq = 0;

  async function carregar() {
    const minha = ++seq;
    let q = sb.from('roupas')
      .select('id, titulo, preco, aceita_troca, tamanho, condicao, fotos, dono:perfis!roupas_dono_id_fkey(nome)')
      .eq('status', 'disponivel').neq('dono_id', eu())
      .order('created_at', { ascending: false }).limit(120);
    const termo = busca.value.trim().replace(/[%,()]/g, ' ');
    if (termo) q = q.or(`titulo.ilike.%${termo}%,descricao.ilike.%${termo}%`);
    if (cat.value) q = q.eq('categoria', cat.value);
    if (tam.value) q = q.eq('tamanho', tam.value);
    if (tipo.value === 'venda') q = q.not('preco', 'is', null);
    if (tipo.value === 'troca') q = q.eq('aceita_troca', true);
    const { data, error } = await q;
    if (minha !== seq) return;
    if (error) { res.innerHTML = `<p class="erro-form">${esc(msgErro(error))}</p>`; return; }
    res.innerHTML = data.length
      ? `<div class="grade">${data.map(cartaoPeca).join('')}</div>`
      : `<div class="vazio"><img src="assets/selo.png" alt=""><p>${termo || cat.value || tam.value || tipo.value
          ? 'Nenhuma peça encontrada com esses filtros.'
          : 'Ainda não há peças de colegas por aqui. Que tal anunciar a primeira?'}</p>
          <a class="btn" href="#/nova-peca">Anunciar uma peça</a></div>`;
  }
  let t;
  busca.addEventListener('input', () => { clearTimeout(t); t = setTimeout(carregar, 300); });
  [cat, tam, tipo].forEach((s) => s.addEventListener('change', carregar));
  await carregar();
}

/* =====================================================================
   Detalhe da roupa + propor troca / compra
   ===================================================================== */
async function detalheRoupa(id) {
  const { data: r, error } = await sb.from('roupas')
    .select('*, dono:perfis!roupas_dono_id_fkey(id, nome, curso)').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!r) { app.innerHTML = `<div class="vazio"><img src="assets/selo.png" alt=""><p>Peça não encontrada.</p><a class="btn" href="#/">Voltar</a></div>`; return; }

  const minha = r.dono_id === eu();
  let pendente = null;
  if (!minha) {
    const { data } = await sb.from('propostas').select('id').eq('roupa_desejada_id', id)
      .eq('proponente_id', eu()).in('status', ['pendente', 'aceita']).limit(1);
    pendente = data?.[0];
  }
  const fotos = r.fotos || [];
  const statusTxt = { disponivel: 'Disponível', reservada: 'Reservada', trocada: 'Trocada', vendida: 'Vendida' };

  let acoes = '';
  if (minha) {
    acoes = `<a class="btn" href="#/editar/${r.id}">Editar peça</a>`;
  } else if (pendente) {
    acoes = `<a class="btn" href="#/proposta/${pendente.id}">Ver minha proposta</a>`;
  } else if (r.status === 'disponivel') {
    acoes = `${r.aceita_troca ? '<button class="btn btn-rosa" id="b-troca">⇄ Propor troca</button>' : ''}
             ${r.preco != null ? `<button class="btn" id="b-compra">Quero comprar</button>` : ''}`;
  } else {
    acoes = `<span class="status status-${r.status}">${statusTxt[r.status]}</span>`;
  }

  app.innerHTML = `
    <a class="voltar" href="#/">← Voltar à vitrine</a>
    <section class="detalhe">
      <div>
        <div class="galeria-principal" id="principal">${foto(fotos[0], r.titulo)}</div>
        ${fotos.length > 1 ? `<div class="miniaturas">${fotos.map((u, i) =>
          `<button class="${i === 0 ? 'ativa' : ''}" data-i="${i}" aria-label="Foto ${i + 1}"><img src="${esc(u)}" alt=""></button>`).join('')}</div>` : ''}
      </div>
      <div>
        <h1>${esc(r.titulo)}</h1>
        <div class="detalhe-preco">${r.preco != null ? moeda(r.preco) : 'Só troca'}</div>
        <div class="acoes">${acoes}</div>
        <dl class="ficha">
          <dt>Tamanho</dt><dd>${esc(r.tamanho)}</dd>
          <dt>Categoria</dt><dd>${esc(r.categoria)}</dd>
          <dt>Condição</dt><dd>${esc(CONDICOES[r.condicao] || r.condicao)}</dd>
          <dt>Negociação</dt><dd>${[r.preco != null ? 'Venda' : null, r.aceita_troca ? 'Troca' : null].filter(Boolean).join(' ou ')}</dd>
          <dt>Status</dt><dd><span class="status status-${r.status}">${statusTxt[r.status]}</span></dd>
        </dl>
        ${r.descricao ? `<p style="white-space:pre-line">${esc(r.descricao)}</p>` : ''}
        <div class="vendedor">
          <div class="avatar">${inicial(r.dono?.nome)}</div>
          <div><strong>${minha ? 'Você' : esc(r.dono?.nome)}</strong><br><span class="peca-meta">${esc(r.dono?.curso)} · ${esc(estado.perfil?.faculdade?.sigla || '')}</span></div>
        </div>
        <div class="aviso"><span>📍</span><span>A entrega é feita pessoalmente, em um ponto autorizado dentro do campus combinado entre vocês.</span></div>
      </div>
    </section>`;

  app.querySelectorAll('.miniaturas button').forEach((b) => b.addEventListener('click', () => {
    app.querySelectorAll('.miniaturas button').forEach((x) => x.classList.remove('ativa'));
    b.classList.add('ativa');
    document.getElementById('principal').innerHTML = foto(fotos[b.dataset.i], r.titulo);
  }));
  document.getElementById('b-troca')?.addEventListener('click', () => modalProposta(r, 'troca'));
  document.getElementById('b-compra')?.addEventListener('click', () => modalProposta(r, 'compra'));
}

async function modalProposta(roupa, tipo) {
  const [pontos, minhas] = await Promise.all([
    pontosEntrega(),
    tipo === 'troca'
      ? sb.from('roupas').select('id, titulo, fotos, tamanho').eq('dono_id', eu()).eq('status', 'disponivel')
          .order('created_at', { ascending: false }).then((r) => r.data || [])
      : Promise.resolve([]),
  ]);

  if (tipo === 'troca' && !minhas.length) {
    abrirModal(`
      <div class="modal-topo"><h2>Propor troca</h2><button class="fechar" data-fechar aria-label="Fechar">×</button></div>
      <p>Para propor uma troca você precisa ter pelo menos uma peça disponível na sua loja.</p>
      <a class="btn" href="#/nova-peca">Cadastrar uma peça</a>`);
    return;
  }

  abrirModal(`
    <div class="modal-topo"><h2>${tipo === 'troca' ? 'Propor troca' : 'Proposta de compra'}</h2><button class="fechar" data-fechar aria-label="Fechar">×</button></div>
    <p class="subtitulo" style="margin-bottom:16px">${tipo === 'troca'
      ? `Escolha qual peça da sua loja você oferece em troca de <strong>${esc(roupa.titulo)}</strong>.`
      : `Você quer comprar <strong>${esc(roupa.titulo)}</strong> por <strong>${moeda(roupa.preco)}</strong>. O pagamento é combinado entre vocês na entrega.`}</p>
    <form class="form" id="f-prop">
      ${tipo === 'troca' ? `<div><span class="rotulo">Sua peça</span><div class="opcoes-pecas" style="margin-top:8px">
        ${minhas.map((m) => `<button type="button" class="opcao-peca" data-id="${m.id}">
          <div class="mini">${foto(m.fotos?.[0], m.titulo)}</div><span>${esc(m.titulo)}</span><span class="peca-meta">Tam. ${esc(m.tamanho)}</span></button>`).join('')}
      </div></div>` : ''}
      <div class="campo"><label for="ponto">Ponto de entrega sugerido</label><select id="ponto">${opcoesPontos(pontos)}</select></div>
      <div class="campo"><label for="msg">Mensagem para ${primeiroNome(roupa.dono?.nome)}</label>
        <textarea id="msg" maxlength="500" placeholder="Oi! Tenho interesse na sua peça…"></textarea></div>
      <div id="erro" class="erro-form" hidden></div>
      <button class="btn btn-bloco" type="submit">Enviar proposta</button>
    </form>`);

  let escolhida = null;
  modal.querySelectorAll('.opcao-peca').forEach((b) => b.addEventListener('click', () => {
    modal.querySelectorAll('.opcao-peca').forEach((x) => x.classList.remove('selecionada'));
    b.classList.add('selecionada');
    escolhida = b.dataset.id;
  }));
  const f = modal.querySelector('#f-prop');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const erro = modal.querySelector('#erro');
    if (tipo === 'troca' && !escolhida) { erro.textContent = 'Escolha uma peça para oferecer.'; erro.hidden = false; return; }
    const btn = f.querySelector('[type=submit]');
    ocupado(btn, true, 'Enviando…');
    const { data, error } = await sb.from('propostas').insert({
      tipo,
      roupa_desejada_id: roupa.id,
      roupa_oferecida_id: tipo === 'troca' ? escolhida : null,
      destinatario_id: roupa.dono_id,
      faculdade_id: roupa.faculdade_id,
      ponto_entrega_id: modal.querySelector('#ponto').value ? Number(modal.querySelector('#ponto').value) : null,
      mensagem: modal.querySelector('#msg').value.trim() || null,
    }).select('id').single();
    ocupado(btn, false);
    if (error) { erro.textContent = msgErro(error); erro.hidden = false; return; }
    fecharModal();
    toast('Proposta enviada! Acompanhe a conversa por aqui.');
    irPara('/proposta/' + data.id);
  });
}

/* =====================================================================
   Minha loja (inventário)
   ===================================================================== */
async function minhaLoja() {
  const { data, error } = await sb.from('roupas').select('*').eq('dono_id', eu()).order('created_at', { ascending: false });
  if (error) throw error;
  const statusTxt = { disponivel: 'Disponível', reservada: 'Reservada', trocada: 'Trocada', vendida: 'Vendida' };
  app.innerHTML = `
    <div class="cabecalho-pagina">
      <div><h1>Minha loja</h1><p class="subtitulo">Seu inventário: estas peças aparecem na vitrine e podem ser oferecidas em trocas.</p></div>
      <a class="btn btn-rosa" href="#/nova-peca">+ Nova peça</a>
    </div>
    ${data.length ? `<div class="lista">${data.map((r) => `
      <div class="item-lista">
        <a class="mini" href="#/roupa/${r.id}">${foto(r.fotos?.[0], r.titulo)}</a>
        <div>
          <h3><a href="#/roupa/${r.id}" style="color:inherit;text-decoration:none">${esc(r.titulo)}</a></h3>
          <p>${r.preco != null ? moeda(r.preco) : 'Só troca'} · Tam. ${esc(r.tamanho)} · <span class="status status-${r.status}">${statusTxt[r.status]}</span></p>
        </div>
        <div class="acoes">
          ${r.status !== 'reservada' ? `<a class="btn btn-contorno btn-pequeno" href="#/editar/${r.id}">Editar</a>
          <button class="btn btn-perigo btn-pequeno" data-apagar="${r.id}">Excluir</button>` : '<span class="peca-meta">Em negociação</span>'}
        </div>
      </div>`).join('')}</div>`
    : `<div class="vazio"><img src="assets/selo.png" alt=""><p>Sua loja está vazia. Cadastre as roupas que você quer vender ou trocar.</p><a class="btn" href="#/nova-peca">Cadastrar primeira peça</a></div>`}`;

  app.querySelectorAll('[data-apagar]').forEach((b) => b.addEventListener('click', async () => {
    const r = data.find((x) => x.id === b.dataset.apagar);
    if (!confirm(`Excluir "${r.titulo}"? Propostas ligadas a ela também serão removidas.`)) return;
    ocupado(b, true, '…');
    const { error: err } = await sb.from('roupas').delete().eq('id', r.id);
    if (err) { ocupado(b, false); return toast(msgErro(err), true); }
    const caminhos = (r.fotos || []).map(caminhoStorage).filter(Boolean);
    if (caminhos.length) sb.storage.from('roupas').remove(caminhos);
    toast('Peça excluída.');
    minhaLoja();
  }));
}

function caminhoStorage(url) {
  const m = String(url).match(/\/storage\/v1\/object\/public\/roupas\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

async function formPeca(id) {
  let r = { titulo: '', descricao: '', categoria: '', tamanho: '', condicao: 'seminova', preco: null, aceita_troca: true, fotos: [] };
  if (id) {
    const { data, error } = await sb.from('roupas').select('*').eq('id', id).eq('dono_id', eu()).maybeSingle();
    if (error) throw error;
    if (!data) return irPara('/minha-loja');
    r = data;
  }
  let fotos = (r.fotos || []).map((url) => ({ url }));
  const MAX = 5;

  app.innerHTML = `
    <a class="voltar" href="#/minha-loja">← Minha loja</a>
    <section class="medio"><div class="cartao">
      <h1>${id ? 'Editar peça' : 'Nova peça'}</h1>
      <form class="form" id="f-peca" novalidate style="margin-top:16px">
        <div><span class="rotulo">Fotos (até ${MAX})</span>
          <div class="fotos-upload" id="fotos" style="margin-top:8px"></div>
          <input type="file" id="arquivos" accept="image/jpeg,image/png,image/webp" multiple hidden>
        </div>
        <div class="campo"><label for="titulo">Título</label><input id="titulo" maxlength="80" required value="${esc(r.titulo)}" placeholder="Ex.: Jaqueta jeans oversized"></div>
        <div class="form-grade">
          <div class="campo"><label for="categoria">Categoria</label><select id="categoria" required><option value="">Selecione…</option>
            ${CATEGORIAS.map((c) => `<option ${c === r.categoria ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
          <div class="campo"><label for="tamanho">Tamanho</label><select id="tamanho" required><option value="">Selecione…</option>
            ${TAMANHOS.map((t) => `<option ${t === r.tamanho ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
        </div>
        <div class="form-grade">
          <div class="campo"><label for="condicao">Condição</label><select id="condicao">
            ${Object.entries(CONDICOES).map(([k, v]) => `<option value="${k}" ${k === r.condicao ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
          <div class="campo"><label for="preco">Preço (R$)</label><input id="preco" type="number" min="0" step="0.01" inputmode="decimal" value="${r.preco ?? ''}" placeholder="Deixe vazio se for só troca"></div>
        </div>
        <label class="checkbox"><input type="checkbox" id="troca" ${r.aceita_troca ? 'checked' : ''}> Aceito trocar esta peça</label>
        <div class="campo"><label for="descricao">Descrição</label><textarea id="descricao" maxlength="1000" placeholder="Marca, medidas, detalhes, se tem algum defeito…">${esc(r.descricao)}</textarea></div>
        <div id="erro" class="erro-form" hidden></div>
        <div class="acoes"><button class="btn" type="submit">${id ? 'Salvar alterações' : 'Publicar na vitrine'}</button>
          <a class="btn btn-contorno" href="#/minha-loja">Cancelar</a></div>
      </form>
    </div></section>`;

  const cont = document.getElementById('fotos');
  const input = document.getElementById('arquivos');
  function desenharFotos() {
    cont.innerHTML = fotos.map((f, i) => `<div class="foto-prev"><img src="${esc(f.preview || f.url)}" alt=""><button type="button" data-rm="${i}" aria-label="Remover foto">×</button></div>`).join('')
      + (fotos.length < MAX ? '<button type="button" class="foto-add" id="add-foto">+<br>Adicionar</button>' : '');
    cont.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => { fotos.splice(Number(b.dataset.rm), 1); desenharFotos(); }));
    document.getElementById('add-foto')?.addEventListener('click', () => input.click());
  }
  input.addEventListener('change', () => {
    for (const arq of [...input.files].slice(0, MAX - fotos.length)) fotos.push({ arquivo: arq, preview: URL.createObjectURL(arq) });
    input.value = '';
    desenharFotos();
  });
  desenharFotos();

  const f = document.getElementById('f-peca');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const erro = document.getElementById('erro');
    const falha = (m) => { erro.textContent = m; erro.hidden = false; };
    erro.hidden = true;
    const dados = {
      titulo: f.titulo.value.trim(),
      categoria: f.categoria.value,
      tamanho: f.tamanho.value,
      condicao: f.condicao.value,
      preco: f.preco.value === '' ? null : Number(f.preco.value),
      aceita_troca: f.troca.checked,
      descricao: f.descricao.value.trim() || null,
    };
    if (dados.titulo.length < 2) return falha('Dê um título para a peça.');
    if (!dados.categoria) return falha('Escolha a categoria.');
    if (!dados.tamanho) return falha('Escolha o tamanho.');
    if (dados.preco != null && (isNaN(dados.preco) || dados.preco < 0)) return falha('Preço inválido.');
    if (dados.preco == null && !dados.aceita_troca) return falha('Informe um preço ou marque que aceita troca.');

    const btn = f.querySelector('[type=submit]');
    ocupado(btn, true, 'Enviando fotos…');
    try {
      const urls = [];
      for (const ft of fotos) {
        if (ft.url) { urls.push(ft.url); continue; }
        const blob = await comprimirImagem(ft.arquivo).catch(() => ft.arquivo);
        const caminho = `${eu()}/${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await sb.storage.from('roupas').upload(caminho, blob, { contentType: blob.type || 'image/jpeg' });
        if (upErr) throw upErr;
        urls.push(sb.storage.from('roupas').getPublicUrl(caminho).data.publicUrl);
      }
      dados.fotos = urls;
      ocupado(btn, false); ocupado(btn, true, 'Salvando…');
      const q = id ? sb.from('roupas').update(dados).eq('id', id) : sb.from('roupas').insert(dados);
      const { error } = await q;
      if (error) throw error;
      const removidas = (r.fotos || []).filter((u) => !urls.includes(u)).map(caminhoStorage).filter(Boolean);
      if (removidas.length) sb.storage.from('roupas').remove(removidas);
      toast(id ? 'Peça atualizada.' : 'Peça publicada na vitrine!');
      irPara('/minha-loja');
    } catch (err) {
      ocupado(btn, false);
      falha(msgErro(err));
    }
  });
}

/* =====================================================================
   Propostas
   ===================================================================== */
const SELECT_PROPOSTA = `*,
  desejada:roupas!propostas_roupa_desejada_id_fkey(id, titulo, fotos, preco, tamanho, status),
  oferecida:roupas!propostas_roupa_oferecida_id_fkey(id, titulo, fotos, tamanho, status),
  proponente:perfis!propostas_proponente_id_fkey(id, nome, curso),
  destinatario:perfis!propostas_destinatario_id_fkey(id, nome, curso),
  ponto:pontos_entrega(id, nome, descricao)`;
const STATUS_PROP = { pendente: 'Aguardando resposta', aceita: 'Aceita — combinem a entrega', recusada: 'Recusada', cancelada: 'Cancelada', concluida: 'Concluída' };

function resumoProposta(p) {
  const recebida = p.destinatario_id === eu();
  const outro = recebida ? p.proponente : p.destinatario;
  const nome = primeiroNome(outro?.nome);
  if (p.tipo === 'troca') {
    return recebida
      ? `${nome} oferece <strong>${esc(p.oferecida?.titulo)}</strong> pela sua <strong>${esc(p.desejada?.titulo)}</strong>`
      : `Você ofereceu <strong>${esc(p.oferecida?.titulo)}</strong> por <strong>${esc(p.desejada?.titulo)}</strong> de ${nome}`;
  }
  return recebida
    ? `${nome} quer comprar sua <strong>${esc(p.desejada?.titulo)}</strong>`
    : `Você quer comprar <strong>${esc(p.desejada?.titulo)}</strong> de ${nome}`;
}

async function listaPropostas() {
  const { data, error } = await sb.from('propostas').select(SELECT_PROPOSTA).order('updated_at', { ascending: false });
  if (error) throw error;
  let aba = sessionStorage.getItem('aba-propostas') || 'recebidas';
  const recebidas = data.filter((p) => p.destinatario_id === eu());
  const enviadas = data.filter((p) => p.proponente_id === eu());
  const pend = recebidas.filter((p) => p.status === 'pendente').length;

  app.innerHTML = `
    <div class="cabecalho-pagina"><div><h1>Propostas</h1><p class="subtitulo">Trocas e compras que você recebeu ou enviou.</p></div></div>
    <div class="abas" role="tablist">
      <button data-aba="recebidas" role="tab">Recebidas${pend ? ` (${pend})` : ''}</button>
      <button data-aba="enviadas" role="tab">Enviadas</button>
    </div>
    <div id="lista"></div>`;

  function desenhar() {
    try { sessionStorage.setItem('aba-propostas', aba); } catch {}
    app.querySelectorAll('[data-aba]').forEach((b) => b.classList.toggle('ativa', b.dataset.aba === aba));
    const itens = aba === 'recebidas' ? recebidas : enviadas;
    document.getElementById('lista').innerHTML = itens.length
      ? `<div class="lista">${itens.map((p) => `
        <a class="item-lista" href="#/proposta/${p.id}">
          <div class="mini">${foto((aba === 'recebidas' && p.oferecida ? p.oferecida : p.desejada)?.fotos?.[0])}</div>
          <div><h3>${p.tipo === 'troca' ? '⇄ Troca' : 'Compra'}${p.tipo === 'compra' && p.desejada?.preco != null ? ' · ' + moeda(p.desejada.preco) : ''}</h3>
            <p>${resumoProposta(p)}</p><p>${dataCurta(p.created_at)}</p></div>
          <span class="status status-${p.status}">${STATUS_PROP[p.status].split(' —')[0]}</span>
        </a>`).join('')}</div>`
      : `<div class="vazio"><img src="assets/selo.png" alt=""><p>${aba === 'recebidas'
          ? 'Nenhuma proposta recebida ainda. Peças com boas fotos chamam mais atenção!'
          : 'Você ainda não fez propostas. Explore a vitrine!'}</p><a class="btn" href="#/">Ver vitrine</a></div>`;
  }
  app.querySelectorAll('[data-aba]').forEach((b) => b.addEventListener('click', () => { aba = b.dataset.aba; desenhar(); }));
  desenhar();
}

async function detalheProposta(id) {
  const [{ data: p, error }, pontos, { data: msgs }] = await Promise.all([
    sb.from('propostas').select(SELECT_PROPOSTA).eq('id', id).maybeSingle(),
    pontosEntrega(),
    sb.from('mensagens').select('id, autor_id, texto, created_at').eq('proposta_id', id).order('created_at'),
  ]);
  if (error) throw error;
  if (!p) { app.innerHTML = `<div class="vazio"><img src="assets/selo.png" alt=""><p>Proposta não encontrada.</p><a class="btn" href="#/propostas">Voltar</a></div>`; return; }

  const souDest = p.destinatario_id === eu();
  const outro = souDest ? p.proponente : p.destinatario;
  const aberta = p.status === 'pendente' || p.status === 'aceita';
  const dtLocal = p.data_entrega ? new Date(new Date(p.data_entrega).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';

  let acoes = '';
  if (p.status === 'pendente' && souDest) acoes = `<button class="btn" data-acao="aceitar">Aceitar proposta</button><button class="btn btn-perigo" data-acao="recusar">Recusar</button>`;
  if (p.status === 'pendente' && !souDest) acoes = `<button class="btn btn-perigo" data-acao="cancelar">Cancelar proposta</button>`;
  if (p.status === 'aceita') acoes = `<button class="btn" data-acao="concluir">✓ Entrega feita, concluir</button><button class="btn btn-perigo" data-acao="cancelar">Desistir da negociação</button>`;

  const lado = (r, legenda) => `<div class="lado"><a href="#/roupa/${r?.id}" class="mini" style="display:block">${foto(r?.fotos?.[0], r?.titulo)}</a>
    <strong>${esc(r?.titulo)}</strong><br><small>${legenda}</small></div>`;

  app.innerHTML = `
    <a class="voltar" href="#/propostas">← Propostas</a>
    <section class="medio"><div class="cartao">
      <div class="cabecalho-pagina" style="margin-bottom:8px">
        <div><h1 style="font-size:1.8rem">${p.tipo === 'troca' ? 'Proposta de troca' : 'Proposta de compra'}</h1>
          <p class="subtitulo">com <strong>${esc(outro?.nome)}</strong> · ${esc(outro?.curso)}</p></div>
        <span class="status status-${p.status}">${STATUS_PROP[p.status]}</span>
      </div>

      <div class="troca-visual">
        ${p.tipo === 'troca'
          ? lado(p.oferecida, souDest ? `de ${primeiroNome(outro?.nome)}` : 'sua peça')
          : `<div class="lado"><div class="mini" style="display:grid;place-items:center;font-family:var(--serif);font-size:1.6rem;font-weight:700">${p.desejada?.preco != null ? moeda(p.desejada.preco) : ''}</div><small>pagamento combinado na entrega</small></div>`}
        <div class="seta">⇄</div>
        ${lado(p.desejada, souDest ? 'sua peça' : `de ${primeiroNome(outro?.nome)}`)}
      </div>

      ${p.mensagem ? `<div class="aviso" style="background:var(--creme-claro)"><span>💬</span><span>“${esc(p.mensagem)}”</span></div>` : ''}
      ${acoes ? `<div class="acoes" style="margin-top:20px">${acoes}</div>` : ''}

      <div class="secao">
        <h3>📍 Entrega no campus</h3>
        ${aberta ? `
          <form class="form" id="f-entrega">
            <div class="form-grade">
              <div class="campo"><label for="ponto">Ponto autorizado</label><select id="ponto">${opcoesPontos(pontos, p.ponto_entrega_id)}</select></div>
              <div class="campo"><label for="quando">Dia e horário</label><input id="quando" type="datetime-local" value="${dtLocal}"></div>
            </div>
            <div><button class="btn btn-contorno btn-pequeno" type="submit">Salvar combinado</button></div>
          </form>
          <p class="peca-meta" style="margin-top:10px">Qualquer um dos dois pode ajustar; use o chat para confirmar.</p>`
        : `<p>${p.ponto ? `<strong>${esc(p.ponto.nome)}</strong>${p.data_entrega ? ' · ' + dataHora(p.data_entrega) : ''}` : 'Não definido.'}</p>`}
      </div>

      <div class="secao">
        <h3>Conversa</h3>
        <div class="chat" id="chat"></div>
        ${aberta ? `<form class="chat-form" id="f-chat">
          <input id="texto" maxlength="1000" placeholder="Escreva uma mensagem…" autocomplete="off" aria-label="Mensagem">
          <button class="btn" type="submit">Enviar</button></form>` : '<p class="peca-meta">Esta negociação foi encerrada.</p>'}
      </div>
    </div></section>`;

  const chat = document.getElementById('chat');
  const vistos = new Set();
  function addMsg(m) {
    if (vistos.has(m.id)) return;
    vistos.add(m.id);
    chat.querySelector('.vazio-chat')?.remove();
    chat.insertAdjacentHTML('beforeend', `<div class="msg ${m.autor_id === eu() ? 'minha' : ''}">${esc(m.texto)}<small>${dataHora(m.created_at)}</small></div>`);
    chat.scrollTop = chat.scrollHeight;
  }
  if (msgs?.length) msgs.forEach(addMsg);
  else chat.innerHTML = `<p class="peca-meta vazio-chat">Nenhuma mensagem ainda. Diga oi e combinem os detalhes!</p>`;

  estado.canal = sb.channel('proposta-' + id)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensagens', filter: `proposta_id=eq.${id}` }, (ev) => addMsg(ev.new))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'propostas', filter: `id=eq.${id}` }, (ev) => {
      if (ev.new.status !== p.status) { toast('A proposta foi atualizada.'); limparCanal(); detalheProposta(id); }
    })
    .subscribe();

  document.getElementById('f-chat')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('texto');
    const texto = input.value.trim();
    if (!texto) return;
    input.value = '';
    const { data, error: err } = await sb.from('mensagens').insert({ proposta_id: id, texto }).select().single();
    if (err) { input.value = texto; return toast(msgErro(err), true); }
    addMsg(data);
  });

  document.getElementById('f-entrega')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('[type=submit]');
    const ponto = document.getElementById('ponto').value;
    const quando = document.getElementById('quando').value;
    ocupado(btn, true, 'Salvando…');
    const { error: err } = await sb.rpc('definir_entrega', {
      p_id: id, p_ponto: ponto ? Number(ponto) : null, p_data: quando ? new Date(quando).toISOString() : null,
    });
    ocupado(btn, false);
    if (err) return toast(msgErro(err), true);
    toast('Entrega combinada salva.');
    const nomePonto = pontos.find((x) => String(x.id) === ponto)?.nome;
    if (nomePonto || quando) {
      const txt = `📍 Entrega sugerida: ${nomePonto || 'local a combinar'}${quando ? ', ' + dataHora(new Date(quando)) : ''}`;
      const { data } = await sb.from('mensagens').insert({ proposta_id: id, texto: txt }).select().single();
      if (data) addMsg(data);
    }
  });

  app.querySelectorAll('[data-acao]').forEach((b) => b.addEventListener('click', async () => {
    const acao = b.dataset.acao;
    const perguntas = {
      aceitar: 'Aceitar esta proposta? As peças ficam reservadas até a entrega.',
      recusar: 'Recusar esta proposta?',
      cancelar: 'Cancelar esta negociação? As peças voltam a ficar disponíveis.',
      concluir: 'Confirmar que a entrega foi feita? As peças saem da vitrine.',
    };
    if (!confirm(perguntas[acao])) return;
    ocupado(b, true, '…');
    const chamadas = {
      aceitar: () => sb.rpc('responder_proposta', { p_id: id, p_aceitar: true }),
      recusar: () => sb.rpc('responder_proposta', { p_id: id, p_aceitar: false }),
      cancelar: () => sb.rpc('cancelar_proposta', { p_id: id }),
      concluir: () => sb.rpc('concluir_proposta', { p_id: id }),
    };
    const { error: err } = await chamadas[acao]();
    if (err) { ocupado(b, false); return toast(msgErro(err), true); }
    toast({ aceitar: 'Proposta aceita! Combinem a entrega.', recusar: 'Proposta recusada.', cancelar: 'Negociação cancelada.', concluir: 'Negociação concluída. Obrigado por fazer a moda circular! ♻' }[acao]);
    limparCanal();
    detalheProposta(id);
    atualizarBadge();
  }));
}

/* =====================================================================
   Perfil
   ===================================================================== */
async function perfil() {
  const { data: priv } = await sb.from('dados_privados').select('matricula, cpf, email, data_nascimento').eq('id', eu()).maybeSingle();
  const p = estado.perfil;
  const cpfOculto = priv?.cpf ? `***.***.${priv.cpf.slice(6, 9)}-${priv.cpf.slice(9)}` : '—';
  const nasc = priv?.data_nascimento ? new Date(priv.data_nascimento + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
  app.innerHTML = `
    <section class="estreito"><div class="cartao">
      <div style="display:flex;gap:16px;align-items:center;margin-bottom:20px">
        <div class="avatar" style="width:64px;height:64px;font-size:1.6rem">${inicial(p?.nome)}</div>
        <div><h1 style="margin:0;font-size:1.7rem">${esc(p?.nome)}</h1><p class="subtitulo">${esc(p?.curso)} · ${esc(p?.faculdade?.nome)}</p></div>
      </div>
      <form class="form" id="f-perfil">
        <div class="campo"><label for="nome">Nome</label><input id="nome" value="${esc(p?.nome)}" required></div>
        <div class="campo"><label for="curso">Curso</label><input id="curso" value="${esc(p?.curso)}" required></div>
        <div><button class="btn btn-contorno btn-pequeno" type="submit">Salvar</button></div>
      </form>
      <div class="secao">
        <h3>Dados de aluno</h3>
        <p class="peca-meta">Visíveis apenas para você. Colegas veem só seu nome e curso.</p>
        <dl class="dados">
          <dt>E-mail</dt><dd>${esc(priv?.email)}</dd>
          <dt>Matrícula</dt><dd>${esc(priv?.matricula)}</dd>
          <dt>CPF</dt><dd>${esc(cpfOculto)}</dd>
          <dt>Nascimento</dt><dd>${esc(nasc)}</dd>
          <dt>Faculdade</dt><dd>${esc(p?.faculdade?.nome)}</dd>
        </dl>
      </div>
      <div class="secao"><button class="btn btn-perigo" id="sair">Sair da conta</button></div>
    </div></section>`;

  document.getElementById('f-perfil').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = e.target.nome.value.trim();
    const curso = e.target.curso.value.trim();
    if (nome.length < 2 || curso.length < 2) return toast('Preencha nome e curso.', true);
    const { error } = await sb.from('perfis').update({ nome, curso }).eq('id', eu());
    if (error) return toast(msgErro(error), true);
    await carregarPerfil();
    atualizarNav('perfil');
    toast('Perfil atualizado.');
  });
  document.getElementById('sair').addEventListener('click', async () => {
    await sb.auth.signOut();
  });
}

function modalNovaSenha() {
  abrirModal(`
    <div class="modal-topo"><h2>Nova senha</h2><button class="fechar" data-fechar aria-label="Fechar">×</button></div>
    <form class="form" id="f-senha">
      <div class="campo"><label for="ns">Nova senha</label><input id="ns" type="password" minlength="6" autocomplete="new-password" required></div>
      <button class="btn btn-bloco" type="submit">Salvar senha</button>
    </form>`);
  modal.querySelector('#f-senha').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { error } = await sb.auth.updateUser({ password: modal.querySelector('#ns').value });
    if (error) return toast(msgErro(error), true);
    fecharModal();
    toast('Senha alterada!');
  });
}

/* =====================================================================
   Início
   ===================================================================== */
sb.auth.onAuthStateChange((evento, sessao) => {
  const antes = estado.sessao?.user?.id;
  estado.sessao = sessao;
  if (!estado.iniciado) return;
  setTimeout(async () => {
    if (evento === 'PASSWORD_RECOVERY') { modalNovaSenha(); return; }
    if ((sessao?.user?.id || null) !== (antes || null)) {
      estado.pontos = null;
      await carregarPerfil();
      if (evento === 'SIGNED_OUT') irPara('/entrar');
      else roteador();
    }
  }, 0);
});

(async function iniciar() {
  const { data } = await sb.auth.getSession();
  estado.sessao = data.session;
  await carregarPerfil();
  const recuperacao = /type=recovery/.test(location.hash);
  if (/access_token=|error_description=/.test(location.hash)) {
    if (/error_description=/.test(location.hash)) {
      const msg = new URLSearchParams(location.hash.slice(1)).get('error_description');
      setTimeout(() => toast(msg || 'O link expirou. Tente novamente.', true), 300);
    }
    history.replaceState(null, '', location.pathname + '#/');
  }
  estado.iniciado = true;
  await roteador();
  if (recuperacao && estado.sessao) modalNovaSenha();
})();
