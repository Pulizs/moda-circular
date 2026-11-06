-- =====================================================================
-- Moda Circular — schema do banco (Supabase / Postgres)
-- Rode este arquivo inteiro no SQL Editor de um projeto Supabase novo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Faculdades e pontos de entrega autorizados
-- ---------------------------------------------------------------------
create table public.faculdades (
  id bigint generated always as identity primary key,
  nome text not null unique,
  sigla text
);

create table public.pontos_entrega (
  id bigint generated always as identity primary key,
  faculdade_id bigint not null references public.faculdades(id) on delete cascade,
  nome text not null,
  descricao text
);
create index pontos_entrega_faculdade_idx on public.pontos_entrega(faculdade_id);

-- ---------------------------------------------------------------------
-- Perfis: dados públicos (visíveis para colegas da mesma faculdade)
-- Dados privados (CPF, matrícula, nascimento, e-mail): só o próprio aluno vê
-- ---------------------------------------------------------------------
create table public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null check (char_length(nome) between 2 and 120),
  faculdade_id bigint not null references public.faculdades(id),
  curso text not null check (char_length(curso) between 2 and 120),
  avatar_url text,
  created_at timestamptz not null default now()
);
create index perfis_faculdade_idx on public.perfis(faculdade_id);

create table public.dados_privados (
  id uuid primary key references public.perfis(id) on delete cascade,
  matricula text not null check (char_length(matricula) between 3 and 30),
  cpf text not null unique check (cpf ~ '^[0-9]{11}$'),
  email text not null,
  data_nascimento date not null check (data_nascimento > '1900-01-01' and data_nascimento < current_date),
  faculdade_id bigint not null references public.faculdades(id),
  unique (faculdade_id, matricula)
);

-- ---------------------------------------------------------------------
-- Roupas (inventário / loja de cada aluno)
-- ---------------------------------------------------------------------
create type public.status_roupa as enum ('disponivel', 'reservada', 'trocada', 'vendida');

create table public.roupas (
  id uuid primary key default gen_random_uuid(),
  dono_id uuid not null default auth.uid() references public.perfis(id) on delete cascade,
  faculdade_id bigint not null references public.faculdades(id),
  titulo text not null check (char_length(titulo) between 2 and 80),
  descricao text check (char_length(descricao) <= 1000),
  categoria text not null,
  tamanho text not null,
  condicao text not null check (condicao in ('nova', 'seminova', 'usada')),
  preco numeric(10,2) check (preco >= 0),          -- null = só troca
  aceita_troca boolean not null default true,
  fotos text[] not null default '{}',
  status public.status_roupa not null default 'disponivel',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (preco is not null or aceita_troca)
);
create index roupas_faculdade_status_idx on public.roupas(faculdade_id, status, created_at desc);
create index roupas_dono_idx on public.roupas(dono_id);

-- ---------------------------------------------------------------------
-- Propostas de troca ou compra + mensagens entre os alunos
-- ---------------------------------------------------------------------
create type public.tipo_proposta as enum ('troca', 'compra');
create type public.status_proposta as enum ('pendente', 'aceita', 'recusada', 'cancelada', 'concluida');

create table public.propostas (
  id uuid primary key default gen_random_uuid(),
  tipo public.tipo_proposta not null,
  roupa_desejada_id uuid not null references public.roupas(id) on delete cascade,
  roupa_oferecida_id uuid references public.roupas(id) on delete cascade,
  proponente_id uuid not null default auth.uid() references public.perfis(id) on delete cascade,
  destinatario_id uuid not null references public.perfis(id) on delete cascade,
  faculdade_id bigint not null references public.faculdades(id),
  ponto_entrega_id bigint references public.pontos_entrega(id),
  data_entrega timestamptz,
  mensagem text check (char_length(mensagem) <= 500),
  status public.status_proposta not null default 'pendente',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((tipo = 'troca') = (roupa_oferecida_id is not null))
);
create index propostas_proponente_idx on public.propostas(proponente_id);
create index propostas_destinatario_idx on public.propostas(destinatario_id);
create index propostas_desejada_idx on public.propostas(roupa_desejada_id);
create index propostas_oferecida_idx on public.propostas(roupa_oferecida_id);
create index propostas_ponto_idx on public.propostas(ponto_entrega_id);
create unique index propostas_uma_pendente_idx
  on public.propostas(proponente_id, roupa_desejada_id) where status = 'pendente';

create table public.mensagens (
  id bigint generated always as identity primary key,
  proposta_id uuid not null references public.propostas(id) on delete cascade,
  autor_id uuid not null default auth.uid() references public.perfis(id) on delete cascade,
  texto text not null check (char_length(texto) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index mensagens_proposta_idx on public.mensagens(proposta_id, created_at);
create index mensagens_autor_idx on public.mensagens(autor_id);

-- =====================================================================
-- Funções auxiliares
-- =====================================================================
create or replace function public.minha_faculdade()
returns bigint language sql stable security definer set search_path = '' as $$
  select faculdade_id from public.perfis where id = (select auth.uid());
$$;

create or replace function public.eh_participante(p_proposta uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.propostas
    where id = p_proposta
      and (select auth.uid()) in (proponente_id, destinatario_id)
  );
$$;

create or replace function public.cpf_valido(p_cpf text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  d int[]; s int; r int; i int;
begin
  if p_cpf !~ '^[0-9]{11}$' or p_cpf ~ '^(\d)\1{10}$' then return false; end if;
  d := array(select substr(p_cpf, g, 1)::int from generate_series(1, 11) g);
  s := 0; for i in 1..9 loop s := s + d[i] * (11 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  if r <> d[10] then return false; end if;
  s := 0; for i in 1..10 loop s := s + d[i] * (12 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  return r = d[11];
end $$;

-- Usado pela tela de cadastro antes de criar a conta
create or replace function public.verificar_cadastro(p_cpf text, p_faculdade bigint, p_matricula text)
returns text language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.cpf_valido(p_cpf) then return 'CPF inválido.'; end if;
  if exists (select 1 from public.dados_privados where cpf = p_cpf) then
    return 'Este CPF já está cadastrado.';
  end if;
  if exists (select 1 from public.dados_privados where faculdade_id = p_faculdade and matricula = p_matricula) then
    return 'Esta matrícula já está cadastrada nesta faculdade.';
  end if;
  return null;
end $$;

-- =====================================================================
-- Criação automática do perfil ao cadastrar (dados vêm do signUp)
-- =====================================================================
create or replace function public.criar_perfil_novo_usuario()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  m jsonb := new.raw_user_meta_data;
  v_cpf text := regexp_replace(coalesce(m->>'cpf', ''), '\D', '', 'g');
  v_fac bigint := (m->>'faculdade_id')::bigint;
begin
  if not public.cpf_valido(v_cpf) then
    raise exception 'CPF inválido';
  end if;
  insert into public.perfis (id, nome, faculdade_id, curso)
  values (new.id, trim(m->>'nome'), v_fac, trim(m->>'curso'));
  insert into public.dados_privados (id, matricula, cpf, email, data_nascimento, faculdade_id)
  values (new.id, trim(m->>'matricula'), v_cpf, new.email, (m->>'data_nascimento')::date, v_fac);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.criar_perfil_novo_usuario();

-- =====================================================================
-- Regras das roupas
-- =====================================================================
create or replace function public.preparar_roupa()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.dono_id := (select auth.uid());
    new.faculdade_id := public.minha_faculdade();
    new.status := 'disponivel';
    if new.faculdade_id is null then raise exception 'Perfil não encontrado'; end if;
  else
    new.dono_id := old.dono_id;
    new.faculdade_id := old.faculdade_id;
    -- status "reservada" só muda através das propostas
    if old.status = 'reservada' and new.status <> old.status
       and current_setting('modacircular.sistema', true) is distinct from 'on' then
      raise exception 'Esta peça está reservada em uma proposta aceita.';
    end if;
    if new.status = 'reservada' and old.status <> 'reservada'
       and current_setting('modacircular.sistema', true) is distinct from 'on' then
      raise exception 'Status inválido.';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger roupas_preparar
  before insert or update on public.roupas
  for each row execute function public.preparar_roupa();

-- =====================================================================
-- Regras das propostas
-- =====================================================================
create or replace function public.validar_proposta()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  eu uuid := (select auth.uid());
  minha_fac bigint := public.minha_faculdade();
  desejada public.roupas;
  oferecida public.roupas;
begin
  select * into desejada from public.roupas where id = new.roupa_desejada_id;
  if desejada.id is null then raise exception 'Peça não encontrada.'; end if;
  if desejada.faculdade_id <> minha_fac then
    raise exception 'Você só pode negociar com alunos da sua faculdade.';
  end if;
  if desejada.dono_id = eu then raise exception 'Essa peça já é sua.'; end if;
  if desejada.status <> 'disponivel' then raise exception 'Essa peça não está mais disponível.'; end if;

  if new.tipo = 'troca' then
    if not desejada.aceita_troca then raise exception 'Essa peça não aceita troca.'; end if;
    select * into oferecida from public.roupas where id = new.roupa_oferecida_id;
    if oferecida.id is null or oferecida.dono_id <> eu then
      raise exception 'Escolha uma peça do seu inventário para oferecer.';
    end if;
    if oferecida.status <> 'disponivel' then raise exception 'A peça oferecida não está disponível.'; end if;
  else
    if desejada.preco is null then raise exception 'Essa peça é só para troca.'; end if;
  end if;

  if new.ponto_entrega_id is not null and not exists (
    select 1 from public.pontos_entrega where id = new.ponto_entrega_id and faculdade_id = minha_fac
  ) then
    raise exception 'Ponto de entrega inválido para sua faculdade.';
  end if;

  new.proponente_id := eu;
  new.destinatario_id := desejada.dono_id;
  new.faculdade_id := minha_fac;
  new.status := 'pendente';
  new.created_at := now();
  new.updated_at := now();
  return new;
end $$;

create trigger propostas_validar
  before insert on public.propostas
  for each row execute function public.validar_proposta();

-- Destinatário aceita ou recusa
create or replace function public.responder_proposta(p_id uuid, p_aceitar boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.propostas;
begin
  select * into p from public.propostas where id = p_id for update;
  if p.id is null or p.destinatario_id <> (select auth.uid()) then raise exception 'Proposta não encontrada.'; end if;
  if p.status <> 'pendente' then raise exception 'Essa proposta já foi respondida.'; end if;

  if not p_aceitar then
    update public.propostas set status = 'recusada', updated_at = now() where id = p_id;
    return;
  end if;

  if exists (select 1 from public.roupas
             where id in (p.roupa_desejada_id, p.roupa_oferecida_id) and status <> 'disponivel') then
    raise exception 'Uma das peças não está mais disponível.';
  end if;

  perform set_config('modacircular.sistema', 'on', true);
  update public.roupas set status = 'reservada'
   where id in (p.roupa_desejada_id, p.roupa_oferecida_id);
  perform set_config('modacircular.sistema', 'off', true);

  update public.propostas set status = 'aceita', updated_at = now() where id = p_id;

  -- outras propostas pendentes com as mesmas peças são recusadas automaticamente
  update public.propostas set status = 'recusada', updated_at = now()
   where id <> p_id and status = 'pendente'
     and (roupa_desejada_id in (p.roupa_desejada_id, p.roupa_oferecida_id)
       or roupa_oferecida_id in (p.roupa_desejada_id, p.roupa_oferecida_id));
end $$;

-- Proponente cancela uma pendente; qualquer um cancela uma aceita (libera as peças)
create or replace function public.cancelar_proposta(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.propostas; eu uuid := (select auth.uid());
begin
  select * into p from public.propostas where id = p_id for update;
  if p.id is null or eu not in (p.proponente_id, p.destinatario_id) then raise exception 'Proposta não encontrada.'; end if;
  if p.status = 'pendente' and eu <> p.proponente_id then
    raise exception 'Use "recusar" para propostas recebidas.';
  end if;
  if p.status not in ('pendente', 'aceita') then raise exception 'Essa proposta não pode ser cancelada.'; end if;

  if p.status = 'aceita' then
    perform set_config('modacircular.sistema', 'on', true);
    update public.roupas set status = 'disponivel'
     where id in (p.roupa_desejada_id, p.roupa_oferecida_id) and status = 'reservada';
    perform set_config('modacircular.sistema', 'off', true);
  end if;
  update public.propostas set status = 'cancelada', updated_at = now() where id = p_id;
end $$;

-- Depois da entrega no campus, qualquer um dos dois confirma
create or replace function public.concluir_proposta(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.propostas;
begin
  select * into p from public.propostas where id = p_id for update;
  if p.id is null or (select auth.uid()) not in (p.proponente_id, p.destinatario_id) then
    raise exception 'Proposta não encontrada.';
  end if;
  if p.status <> 'aceita' then raise exception 'Só propostas aceitas podem ser concluídas.'; end if;

  perform set_config('modacircular.sistema', 'on', true);
  update public.roupas
     set status = case when p.tipo = 'troca' then 'trocada'::public.status_roupa else 'vendida'::public.status_roupa end
   where id in (p.roupa_desejada_id, p.roupa_oferecida_id);
  perform set_config('modacircular.sistema', 'off', true);

  update public.propostas set status = 'concluida', updated_at = now() where id = p_id;
end $$;

-- Combinar ponto e horário de entrega
create or replace function public.definir_entrega(p_id uuid, p_ponto bigint, p_data timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.propostas;
begin
  select * into p from public.propostas where id = p_id for update;
  if p.id is null or (select auth.uid()) not in (p.proponente_id, p.destinatario_id) then
    raise exception 'Proposta não encontrada.';
  end if;
  if p.status not in ('pendente', 'aceita') then raise exception 'Essa proposta já foi encerrada.'; end if;
  if p_ponto is not null and not exists (
    select 1 from public.pontos_entrega where id = p_ponto and faculdade_id = p.faculdade_id
  ) then raise exception 'Ponto de entrega inválido.'; end if;
  if p_data is not null and p_data < now() then raise exception 'Escolha uma data futura.'; end if;

  update public.propostas
     set ponto_entrega_id = p_ponto, data_entrega = p_data, updated_at = now()
   where id = p_id;
end $$;

-- =====================================================================
-- Permissões de execução
-- =====================================================================
revoke execute on function public.minha_faculdade() from public, anon;
revoke execute on function public.eh_participante(uuid) from public, anon;
revoke execute on function public.criar_perfil_novo_usuario() from public, anon, authenticated;
revoke execute on function public.preparar_roupa() from public, anon, authenticated;
revoke execute on function public.validar_proposta() from public, anon, authenticated;
revoke execute on function public.responder_proposta(uuid, boolean) from public, anon;
revoke execute on function public.cancelar_proposta(uuid) from public, anon;
revoke execute on function public.concluir_proposta(uuid) from public, anon;
revoke execute on function public.definir_entrega(uuid, bigint, timestamptz) from public, anon;
grant execute on function public.minha_faculdade() to authenticated;
grant execute on function public.eh_participante(uuid) to authenticated;
grant execute on function public.responder_proposta(uuid, boolean) to authenticated;
grant execute on function public.cancelar_proposta(uuid) to authenticated;
grant execute on function public.concluir_proposta(uuid) to authenticated;
grant execute on function public.definir_entrega(uuid, bigint, timestamptz) to authenticated;
grant execute on function public.verificar_cadastro(text, bigint, text) to anon, authenticated;
grant execute on function public.cpf_valido(text) to anon, authenticated;

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.faculdades enable row level security;
alter table public.pontos_entrega enable row level security;
alter table public.perfis enable row level security;
alter table public.dados_privados enable row level security;
alter table public.roupas enable row level security;
alter table public.propostas enable row level security;
alter table public.mensagens enable row level security;

-- Faculdades: lista pública (necessária na tela de cadastro)
create policy "faculdades visiveis" on public.faculdades
  for select to anon, authenticated using (true);

-- Pontos de entrega: só os da própria faculdade
create policy "pontos da minha faculdade" on public.pontos_entrega
  for select to authenticated using (faculdade_id = (select public.minha_faculdade()));

-- Perfis: colegas da mesma faculdade veem nome e curso
create policy "perfis da minha faculdade" on public.perfis
  for select to authenticated
  using (id = (select auth.uid()) or faculdade_id = (select public.minha_faculdade()));
create policy "editar meu perfil" on public.perfis
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke insert, update, delete on public.perfis from anon, authenticated;
grant update (nome, curso, avatar_url) on public.perfis to authenticated;

-- Dados privados: só o dono
create policy "meus dados privados" on public.dados_privados
  for select to authenticated using (id = (select auth.uid()));
revoke insert, update, delete on public.dados_privados from anon, authenticated;

-- Roupas
create policy "roupas da minha faculdade" on public.roupas
  for select to authenticated using (faculdade_id = (select public.minha_faculdade()));
create policy "cadastrar minhas roupas" on public.roupas
  for insert to authenticated with check (dono_id = (select auth.uid()));
create policy "editar minhas roupas" on public.roupas
  for update to authenticated
  using (dono_id = (select auth.uid())) with check (dono_id = (select auth.uid()));
create policy "apagar minhas roupas" on public.roupas
  for delete to authenticated using (dono_id = (select auth.uid()) and status <> 'reservada');

-- Propostas: só os envolvidos; criação passa pelo trigger de validação
create policy "minhas propostas" on public.propostas
  for select to authenticated
  using ((select auth.uid()) in (proponente_id, destinatario_id));
create policy "criar proposta" on public.propostas
  for insert to authenticated with check (proponente_id = (select auth.uid()));
revoke update, delete on public.propostas from anon, authenticated;

-- Mensagens: só os envolvidos na proposta
create policy "ler mensagens da proposta" on public.mensagens
  for select to authenticated using ((select public.eh_participante(proposta_id)));
create policy "enviar mensagem" on public.mensagens
  for insert to authenticated
  with check (autor_id = (select auth.uid()) and (select public.eh_participante(proposta_id)));
revoke update, delete on public.mensagens from anon, authenticated;

-- Nada para visitantes anônimos além da lista de faculdades
revoke all on public.pontos_entrega, public.perfis, public.dados_privados,
              public.roupas, public.propostas, public.mensagens from anon;

-- Mensagens em tempo real
alter publication supabase_realtime add table public.mensagens;
alter publication supabase_realtime add table public.propostas;

-- =====================================================================
-- Storage: fotos das roupas (leitura pública, upload na pasta do aluno)
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('roupas', 'roupas', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "enviar fotos na minha pasta" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'roupas' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "apagar minhas fotos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'roupas' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- =====================================================================
-- Dados iniciais (edite à vontade)
-- =====================================================================
insert into public.faculdades (nome, sigla) values
  ('Universidade Federal do Paraná', 'UFPR'),
  ('Universidade Tecnológica Federal do Paraná', 'UTFPR'),
  ('Pontifícia Universidade Católica do Paraná', 'PUCPR'),
  ('Universidade de São Paulo', 'USP'),
  ('Universidade Estadual de Campinas', 'UNICAMP'),
  ('Universidade Federal da Bahia', 'UFBA'),
  ('FAE Centro Universitário', 'FAE');

insert into public.pontos_entrega (faculdade_id, nome, descricao)
select f.id, p.nome, p.descricao
from public.faculdades f
cross join (values
  ('Biblioteca Central', 'Entrada principal da biblioteca'),
  ('Restaurante Universitário', 'Em frente ao RU'),
  ('Portaria Principal', 'Ao lado da guarita'),
  ('Centro Acadêmico', 'Sala do DCE / centro acadêmico')
) as p(nome, descricao);
