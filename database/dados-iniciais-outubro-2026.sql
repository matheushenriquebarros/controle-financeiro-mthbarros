-- =====================================================================
-- Dados da planilha_financeira.xlsx (outubro/2026), para não digitar
-- tudo de novo. Rodar UMA vez, depois do schema.sql e depois de criar
-- a sua conta no controle (entram na conta admin mais antiga).
-- Se rodar de novo, só entra o que ainda não existe.
-- =====================================================================
do $$
declare
  dono uuid := (select id from public.fin_perfis where admin and aprovado order by criado_em limit 1);
begin
  if dono is null then
    raise exception 'Crie sua conta no controle antes de rodar este arquivo.';
  end if;

  -- Premissas da aba Resumo: seg a sex, marmita R$ 20, Uber R$ 20 + R$ 20,
  -- vale R$ 25 + ajuda de custo R$ 12 por dia trabalhado, pagos no dia 5.
  insert into public.fin_config (user_id, dias_semana, custos_dia, ganhos_dia, dia_beneficio)
  values (
    dono,
    '{1,2,3,4,5}',
    '[{"id":"alimentacao","nome":"Alimentação (pedindo marmita)","valor":20,"tipo":"marmita","desde":null,"ate":null},
      {"id":"uber-ida","nome":"Uber de ida","valor":20,"tipo":"transporte","desde":null,"ate":null},
      {"id":"uber-volta","nome":"Uber de volta","valor":20,"tipo":"transporte","desde":null,"ate":null}]'::jsonb,
    '[{"nome":"Vale alimentação","valor":25},
      {"nome":"Ajuda de custo","valor":12}]'::jsonb,
    5
  )
  on conflict (user_id) do nothing;

  -- Saldo informado: R$ 454 na conta, já contando até 06/10.
  insert into public.fin_saldos (user_id, data, conta, caixinha, observacao)
  select dono, '2026-10-06', 454, 0, 'Saldo da planilha'
  where not exists (select 1 from public.fin_saldos where user_id = dono);

  -- Recebimentos e gastos.
  insert into public.fin_lancamentos (user_id, tipo, data, descricao, categoria, valor, observacao)
  select dono, v.tipo, v.data::date, v.descricao, v.categoria, v.valor, v.observacao
  from (values
    ('entrada', '2026-10-05', 'Vale alimentação + ajuda de custo', 'Vale e benefícios', 703::numeric, '19 dias × R$ 37 (já estava no saldo)'),
    ('entrada', '2026-10-09', 'Microsenior', 'Trabalho',  500::numeric, ''),
    ('entrada', '2026-10-10', 'Newton',      'Freela',    200::numeric, ''),
    ('entrada', '2026-10-16', 'Microsenior', 'Trabalho',  500::numeric, ''),
    ('entrada', '2026-10-23', 'Microsenior', 'Trabalho',  500::numeric, ''),
    ('entrada', '2026-10-30', 'Microsenior', 'Trabalho',  500::numeric, ''),
    ('entrada', '2026-11-02', 'Recebimento de 02/11', 'Trabalho', 3140::numeric, ''),
    ('saida',   '2026-10-08', 'Gasto avulso', 'Outros',            35::numeric, 'Valor lançado direto no Diário da planilha'),
    ('saida',   '2026-10-10', 'Lovable',      'Assinaturas',      140::numeric, '')
  ) as v (tipo, data, descricao, categoria, valor, observacao)
  where not exists (
    select 1 from public.fin_lancamentos l
    where l.user_id = dono and l.data = v.data::date and l.descricao = v.descricao and l.valor = v.valor
  );

  -- Folga: 12/10, Dia das Crianças.
  insert into public.fin_dias (user_id, data, trabalha, marmita, motivo)
  values (dono, '2026-10-12', false, false, 'Dia das Crianças')
  on conflict (user_id, data) do nothing;
end $$;
