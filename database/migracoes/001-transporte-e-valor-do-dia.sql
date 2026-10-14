-- =====================================================================
-- Controle MB — 001: botão de Uber/transporte e valor ajustado por dia.
-- Rodar uma vez no SQL Editor (depois do schema.sql). Pode repetir.
--
--   sem_transporte = true → naquele dia não saem os gastos do tipo
--                            "transporte" (ex.: não foi de Uber).
--   valores        = { "uber-ida": 27 } → valor de um gasto só naquele
--                    dia (ex.: Uber mais caro). Chave = id do gasto
--                    em fin_config.custos_dia.
-- Os gastos por dia trabalhado (fin_config.custos_dia) agora têm
-- id, tipo ("marmita" | "transporte" | "fixo") e período (desde/ate);
-- isso fica no JSON, sem coluna nova. Os antigos são convertidos sozinhos.
-- =====================================================================
alter table public.fin_dias add column if not exists sem_transporte boolean not null default false;
alter table public.fin_dias add column if not exists valores jsonb not null default '{}'::jsonb;

-- Dá id e tipo aos gastos por dia já salvos (formato antigo { marmita }).
update public.fin_config c
set custos_dia = (
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', coalesce(i.item ->> 'id',
                     case when i.item ->> 'nome' ilike 'uber de ida%' then 'uber-ida'
                          when i.item ->> 'nome' ilike 'uber de volta%' then 'uber-volta'
                          when (i.item ->> 'marmita')::boolean then 'alimentacao'
                          else 'item-' || i.n end),
      'nome', i.item ->> 'nome',
      'valor', (i.item ->> 'valor')::numeric,
      'tipo', coalesce(i.item ->> 'tipo',
                       case when coalesce((i.item ->> 'marmita')::boolean, false) then 'marmita'
                            when i.item ->> 'nome' ~* '(uber|99|t[aá]xi|[oô]nibus|metr|gasolina|combust|estacion|ped[aá]gio)' then 'transporte'
                            else 'fixo' end),
      'desde', i.item -> 'desde',
      'ate', i.item -> 'ate'
    ) order by i.n), '[]'::jsonb)
  from jsonb_array_elements(c.custos_dia) with ordinality as i (item, n)
)
where exists (select 1 from jsonb_array_elements(c.custos_dia) x where not (x ? 'tipo'));
