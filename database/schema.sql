-- =====================================================================
-- Controle MB — Controle financeiro pessoal (Supabase / PostgreSQL)
-- Rodar inteiro no Supabase: SQL Editor → New query → colar → Run.
-- Pode rodar de novo sem quebrar (tudo usa IF NOT EXISTS / OR REPLACE).
--
-- Todas as tabelas começam com "fin_", então dá para usar:
--   • um projeto Supabase novo, só para o controle; ou
--   • o mesmo projeto do painel de divisão de lucros (mesmo login).
-- Cada pessoa só enxerga os próprios dados (RLS por user_id).
-- Depois, se quiser os dados da planilha de outubro, rode
-- database/dados-iniciais-outubro-2026.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Perfis: um por conta do Supabase Auth.
-- A primeira conta vira admin e já entra aprovada; as outras aguardam.
-- ---------------------------------------------------------------------
create table if not exists public.fin_perfis (
  id         uuid primary key references auth.users (id) on delete cascade,
  nome       text not null,
  email      text not null,
  aprovado   boolean not null default false,
  admin      boolean not null default false,
  criado_em  timestamptz not null default now()
);

create or replace function public.fin_aprovado()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.fin_perfis where id = auth.uid() and aprovado);
$$;

create or replace function public.fin_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.fin_perfis where id = auth.uid() and aprovado and admin);
$$;

create or replace function public.fin_criar_perfil()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  primeiro boolean := not exists (select 1 from public.fin_perfis);
begin
  insert into public.fin_perfis (id, nome, email, aprovado, admin)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome'), ''), split_part(new.email, '@', 1)),
    new.email,
    primeiro,
    primeiro
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists fin_ao_criar_usuario on auth.users;
create trigger fin_ao_criar_usuario
  after insert on auth.users
  for each row execute function public.fin_criar_perfil();

-- Se o projeto já tem contas (ex.: o mesmo Supabase do painel), elas
-- ganham perfil aqui. A conta mais antiga vira admin aprovada.
insert into public.fin_perfis (id, nome, email, aprovado, admin)
select u.id,
       coalesce(nullif(trim(u.raw_user_meta_data ->> 'nome'), ''), split_part(u.email, '@', 1)),
       u.email,
       u.id = (select id from auth.users order by created_at limit 1),
       u.id = (select id from auth.users order by created_at limit 1)
from auth.users u
where not exists (select 1 from public.fin_perfis);

-- ---------------------------------------------------------------------
-- Ajustes de cada pessoa (equivalem às premissas da aba Resumo).
-- dias_semana: 1 = segunda … 7 = domingo.
-- custos_dia:  [{ "id": "uber-ida", "nome": "Uber de ida", "valor": 20,
--                 "tipo": "transporte", "desde": null, "ate": null }]
--              tipo marmita    → não sai nos dias em que levou marmita
--              tipo transporte → não sai nos dias marcados "sem Uber"
--              tipo fixo       → sai em todo dia trabalhado
--              desde/ate       → período em que o gasto vale (ex.: carro)
-- ganhos_dia:  [{ "nome": "Vale alimentação", "valor": 25 }]
--              pagos de uma vez no dia_beneficio, pelos dias trabalhados.
-- ---------------------------------------------------------------------
create table if not exists public.fin_config (
  user_id        uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  dias_semana    int[] not null default '{1,2,3,4,5}',
  custos_dia     jsonb not null default '[]'::jsonb,
  ganhos_dia     jsonb not null default '[]'::jsonb,
  dia_beneficio  int not null default 5 check (dia_beneficio between 1 and 31),
  atualizado_em  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Saldos informados. O mais recente é o ponto de partida da projeção:
-- tudo com data até o dia do saldo já está dentro dele; a projeção
-- conta do dia seguinte em diante (igual à planilha).
-- ---------------------------------------------------------------------
create table if not exists public.fin_saldos (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  data        date not null default current_date,
  conta       numeric(12,2) not null default 0,
  caixinha    numeric(12,2) not null default 0,
  observacao  text not null default '',
  criado_em   timestamptz not null default now()
);
create index if not exists idx_fin_saldos on public.fin_saldos (user_id, data desc, id desc);

-- ---------------------------------------------------------------------
-- Lançamentos: abas Recebimentos (entrada) e Gastos (saida).
-- ---------------------------------------------------------------------
create table if not exists public.fin_lancamentos (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  tipo        text not null check (tipo in ('entrada', 'saida')),
  data        date not null default current_date,
  descricao   text not null,
  categoria   text not null default 'Outros',
  valor       numeric(12,2) not null check (valor >= 0),
  observacao  text not null default '',
  criado_em   timestamptz not null default now()
);
create index if not exists idx_fin_lancamentos on public.fin_lancamentos (user_id, data);

-- ---------------------------------------------------------------------
-- Exceções do dia a dia (aba Diário):
--   trabalha null  = segue o padrão da semana
--   trabalha false = folga / feriado (motivo opcional)
--   trabalha true  = trabalhou num dia que normalmente não trabalha
--   marmita true   = levou marmita (não gasta alimentação)
--   sem_transporte = não foi de Uber/transporte naquele dia
--   valores        = { "uber-ida": 27 } valor de um gasto só naquele dia
-- ---------------------------------------------------------------------
create table if not exists public.fin_dias (
  user_id         uuid not null references auth.users (id) on delete cascade default auth.uid(),
  data            date not null,
  trabalha        boolean null,
  marmita         boolean not null default false,
  sem_transporte  boolean not null default false,
  valores         jsonb not null default '{}'::jsonb,
  motivo          text not null default '',
  primary key (user_id, data)
);
alter table public.fin_dias add column if not exists sem_transporte boolean not null default false;
alter table public.fin_dias add column if not exists valores jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------
-- Segurança (RLS): só quem foi aprovado, e só os próprios dados.
-- ---------------------------------------------------------------------
alter table public.fin_perfis      enable row level security;
alter table public.fin_config      enable row level security;
alter table public.fin_saldos      enable row level security;
alter table public.fin_lancamentos enable row level security;
alter table public.fin_dias        enable row level security;

drop policy if exists fin_perfis_ler on public.fin_perfis;
create policy fin_perfis_ler on public.fin_perfis
  for select to authenticated
  using (id = auth.uid() or public.fin_admin());

drop policy if exists fin_perfis_admin_editar on public.fin_perfis;
create policy fin_perfis_admin_editar on public.fin_perfis
  for update to authenticated
  using (public.fin_admin())
  with check (public.fin_admin());

drop policy if exists fin_perfis_admin_excluir on public.fin_perfis;
create policy fin_perfis_admin_excluir on public.fin_perfis
  for delete to authenticated
  using (public.fin_admin() and id <> auth.uid());

drop policy if exists fin_config_dono on public.fin_config;
create policy fin_config_dono on public.fin_config
  for all to authenticated
  using (user_id = auth.uid() and public.fin_aprovado())
  with check (user_id = auth.uid() and public.fin_aprovado());

drop policy if exists fin_saldos_dono on public.fin_saldos;
create policy fin_saldos_dono on public.fin_saldos
  for all to authenticated
  using (user_id = auth.uid() and public.fin_aprovado())
  with check (user_id = auth.uid() and public.fin_aprovado());

drop policy if exists fin_lancamentos_dono on public.fin_lancamentos;
create policy fin_lancamentos_dono on public.fin_lancamentos
  for all to authenticated
  using (user_id = auth.uid() and public.fin_aprovado())
  with check (user_id = auth.uid() and public.fin_aprovado());

drop policy if exists fin_dias_dono on public.fin_dias;
create policy fin_dias_dono on public.fin_dias
  for all to authenticated
  using (user_id = auth.uid() and public.fin_aprovado())
  with check (user_id = auth.uid() and public.fin_aprovado());
