/* =====================================================================
   Motor do controle: a mesma conta da planilha_financeira.xlsx.

   • O saldo informado já inclui tudo até o dia dele. A projeção começa
     no dia seguinte (Resumo!B8) e anda dia a dia (aba Diário).
   • Dia trabalhado = dia da semana marcado nos ajustes e sem folga.
     Nele saem os "gastos por dia trabalhado" (marmita + Uber); o item
     marcado "marmita" não sai nos dias em que você levou de casa.
   • Entra = recebimentos do dia. Outros gastos = gastos lançados no dia.
   • Saldo do dia = saldo de ontem + entra − sai.

   Sem acesso ao banco: recebe os dados e devolve números. Tudo é feito
   em centavos para não errar arredondamento.
   ===================================================================== */
(function () {
  "use strict";

  var P = (window.Projecao = {});

  /* ---------- Datas "AAAA-MM-DD" (sem fuso) ---------- */
  function partes(iso) { var p = String(iso).slice(0, 10).split("-").map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); }
  function iso(ms) { return new Date(ms).toISOString().slice(0, 10); }

  P.somarDias = function (data, n) { return iso(partes(data) + n * 864e5); };
  /* 1 = segunda … 7 = domingo (igual ao WEEKDAY(x;2) do Excel). */
  P.diaSemana = function (data) { var d = new Date(partes(data)).getUTCDay(); return d === 0 ? 7 : d; };
  P.segunda = function (data) { return P.somarDias(data, 1 - P.diaSemana(data)); };
  P.fimDoMes = function (data) {
    var d = new Date(partes(data));
    return iso(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  };
  P.inicioDoMes = function (data) { return String(data).slice(0, 7) + "-01"; };
  P.diasEntre = function (a, b) { return Math.round((partes(b) - partes(a)) / 864e5); };
  P.NOMES_DIA = ["", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

  var c = function (v) { return Math.round((Number(v) || 0) * 100); };
  var r = function (cent) { return cent / 100; };

  /* ---------- Ajustes ---------- */
  P.CONFIG_PADRAO = {
    dias_semana: [1, 2, 3, 4, 5],
    custos_dia: [
      { nome: "Alimentação (pedindo marmita)", valor: 20, marmita: true },
      { nome: "Uber de ida", valor: 20, marmita: false },
      { nome: "Uber de volta", valor: 20, marmita: false }
    ],
    ganhos_dia: [
      { nome: "Vale alimentação", valor: 25 },
      { nome: "Ajuda de custo", valor: 12 }
    ],
    dia_beneficio: 5
  };

  P.normalizarConfig = function (cfg) {
    cfg = cfg || {};
    var base = P.CONFIG_PADRAO;
    return {
      dias_semana: Array.isArray(cfg.dias_semana) ? cfg.dias_semana.map(Number) : base.dias_semana.slice(),
      custos_dia: Array.isArray(cfg.custos_dia) ? cfg.custos_dia : JSON.parse(JSON.stringify(base.custos_dia)),
      ganhos_dia: Array.isArray(cfg.ganhos_dia) ? cfg.ganhos_dia : JSON.parse(JSON.stringify(base.ganhos_dia)),
      dia_beneficio: Number(cfg.dia_beneficio) || base.dia_beneficio
    };
  };

  /* Lista de fin_dias → { "2026-10-12": {trabalha:false, marmita:false, motivo:"…"} } */
  P.mapaDias = function (lista) {
    var m = {};
    (lista || []).forEach(function (d) { m[String(d.data).slice(0, 10)] = d; });
    return m;
  };

  P.trabalhaPadrao = function (data, cfg) { return cfg.dias_semana.indexOf(P.diaSemana(data)) > -1; };

  P.trabalha = function (data, cfg, dias) {
    var x = dias[data];
    if (x && x.trabalha != null) return !!x.trabalha;
    return P.trabalhaPadrao(data, cfg);
  };

  /* Custos de um dia trabalhado: com e sem marmita (Resumo!B23 e B24). */
  P.custoPorDia = function (cfg) {
    var pedindo = 0, levando = 0;
    cfg.custos_dia.forEach(function (i) {
      pedindo += c(i.valor);
      if (!i.marmita) levando += c(i.valor);
    });
    return { pedindo: r(pedindo), levando: r(levando) };
  };

  /* ---------- Projeção dia a dia (aba Diário) ---------- */
  /*
    entrada = {
      saldo: { data, conta, caixinha },
      config, dias (lista ou mapa), lancamentos: [{ tipo, data, valor, … }],
      ate: "AAAA-MM-DD"  (último dia projetado)
    }
  */
  P.projetar = function (entrada) {
    var cfg = P.normalizarConfig(entrada.config);
    var dias = Array.isArray(entrada.dias) ? P.mapaDias(entrada.dias) : (entrada.dias || {});
    var saldo = entrada.saldo || { data: P.somarDias(entrada.ate, -1), conta: 0, caixinha: 0 };
    var inicio = P.somarDias(saldo.data, 1);
    var ate = entrada.ate;

    var porDia = {};
    (entrada.lancamentos || []).forEach(function (l) {
      var d = String(l.data).slice(0, 10);
      if (d < inicio || d > ate) return; // até o dia do saldo já está dentro dele
      (porDia[d] = porDia[d] || []).push(l);
    });

    var linhas = [];
    var atual = c(saldo.conta);
    var minimo = null;

    for (var d = inicio; d <= ate; d = P.somarDias(d, 1)) {
      var info = dias[d] || {};
      var trab = P.trabalha(d, cfg, dias);
      var marmita = trab && !!info.marmita;
      var itens = [];
      var custo = 0;
      if (trab) {
        cfg.custos_dia.forEach(function (i) {
          if (marmita && i.marmita) return;
          custo += c(i.valor);
          itens.push({ nome: i.nome, valor: Number(i.valor) || 0 });
        });
      }
      var lanc = porDia[d] || [];
      var entradas = lanc.filter(function (l) { return l.tipo === "entrada"; });
      var saidas = lanc.filter(function (l) { return l.tipo === "saida"; });
      var entra = entradas.reduce(function (t, l) { return t + c(l.valor); }, 0);
      var outros = saidas.reduce(function (t, l) { return t + c(l.valor); }, 0);
      atual += entra - custo - outros;

      var linha = {
        data: d,
        semana: P.diaSemana(d),
        trabalha: trab,
        padrao: P.trabalhaPadrao(d, cfg),
        marmita: marmita,
        motivo: info.motivo || "",
        entra: r(entra),
        custoDia: r(custo),
        itensDia: itens,
        outros: r(outros),
        sai: r(custo + outros),
        saldo: r(atual),
        entradas: entradas,
        saidas: saidas
      };
      linhas.push(linha);
      if (!minimo || atual < c(minimo.saldo)) minimo = { data: d, saldo: r(atual) };
    }

    return { inicio: inicio, ate: ate, saldoInicial: Number(saldo.conta) || 0, linhas: linhas, minimo: minimo };
  };

  /* Saldo da conta no fim de um dia (antes do início = saldo informado). */
  P.saldoEm = function (proj, data) {
    var s = proj.saldoInicial;
    for (var i = 0; i < proj.linhas.length; i++) {
      if (proj.linhas[i].data > data) break;
      s = proj.linhas[i].saldo;
    }
    return s;
  };

  function somaLanc(lista, tipo, de, ate) {
    return r((lista || []).reduce(function (t, l) {
      var d = String(l.data).slice(0, 10);
      return l.tipo === tipo && d >= de && d <= ate ? t + c(l.valor) : t;
    }, 0));
  }
  P.somaLanc = somaLanc;

  function somaLinhas(linhas, campo, de, ate) {
    return r(linhas.reduce(function (t, l) { return l.data >= de && l.data <= ate ? t + c(l[campo]) : t; }, 0));
  }

  /* ---------- Resumo (aba Resumo) ---------- */
  P.resumo = function (entrada) {
    var saldo = entrada.saldo;
    var cfg = P.normalizarConfig(entrada.config);
    var lanc = entrada.lancamentos || [];
    var inicio = P.somarDias(saldo.data, 1);
    var fimMes = P.fimDoMes(inicio);
    var seg = P.segunda(inicio);
    var sex = P.somarDias(seg, 4);
    var dom = P.somarDias(seg, 6);
    var ate = dom > fimMes ? dom : fimMes;

    var proj = P.projetar({ saldo: saldo, config: cfg, dias: entrada.dias, lancamentos: lanc, ate: ate });
    var linhasMes = proj.linhas.filter(function (l) { return l.data <= fimMes; });
    var conta = Number(saldo.conta) || 0;
    var caixinha = Number(saldo.caixinha) || 0;
    var ontem = saldo.data;

    // Esta semana, Resumo!B27:B33. A planilha soma até a sexta, mas o
    // recebimento de sábado e os gastos do fim de semana entram aqui
    // para o "saldo no domingo" bater com a semana 1 da tabela.
    var semana = {
      segunda: seg,
      sexta: sex,
      domingo: dom,
      jaRecebido: somaLanc(lanc, "entrada", seg, ontem < dom ? ontem : dom),
      vaiReceber: somaLanc(lanc, "entrada", inicio, dom),
      gastosPrevistos: somaLinhas(proj.linhas, "sai", inicio, dom),
      saldoDomingo: P.saldoEm(proj, dom)
    };
    semana.totalSemana = r(c(semana.jaRecebido) + c(semana.vaiReceber));

    // Semana por semana até o fim do mês (Resumo!D5:J11)
    var semanas = [];
    for (var de = seg, n = 1; de <= fimMes; de = P.somarDias(de, 7), n++) {
      var fim = P.somarDias(de, 6);
      if (fim > fimMes) fim = fimMes;
      semanas.push({
        n: n,
        de: de,
        ate: fim,
        jaRecebido: de <= ontem ? somaLanc(lanc, "entrada", de, ontem < fim ? ontem : fim) : 0,
        vaiReceber: somaLanc(lanc, "entrada", de < inicio ? inicio : de, fim),
        gastos: somaLinhas(proj.linhas, "sai", de, fim),
        saldoFim: P.saldoEm(proj, fim)
      });
    }

    // Mês (Resumo!B36:B43)
    var entra = somaLinhas(linhasMes, "entra", inicio, fimMes);
    var sai = somaLinhas(linhasMes, "sai", inicio, fimMes);
    var minimo = null;
    linhasMes.forEach(function (l) { if (!minimo || l.saldo < minimo.saldo) minimo = { data: l.data, saldo: l.saldo }; });
    var saldoFim = P.saldoEm(proj, fimMes);
    var mes = {
      inicioMes: P.inicioDoMes(inicio),
      fimMes: fimMes,
      jaRecebido: somaLanc(lanc, "entrada", P.inicioDoMes(inicio), ontem),
      jaGasto: somaLanc(lanc, "saida", P.inicioDoMes(inicio), ontem),
      entra: entra,
      sai: sai,
      custosDia: somaLinhas(linhasMes, "custoDia", inicio, fimMes),
      outros: somaLinhas(linhasMes, "outros", inicio, fimMes),
      sobra: r(c(entra) - c(sai)),
      saldoFim: saldoFim,
      saldoTotalFim: r(c(saldoFim) + c(caixinha)),
      menor: minimo || { data: ontem, saldo: conta },
      diasTrabalhados: linhasMes.filter(function (l) { return l.trabalha; }).length,
      diasMarmita: linhasMes.filter(function (l) { return l.marmita; }).length
    };

    // Depois do fim do mês (Resumo!B46:B47)
    var depoisLista = lanc.filter(function (l) { return String(l.data).slice(0, 10) > fimMes; })
      .sort(function (a, b) { return a.data < b.data ? -1 : a.data > b.data ? 1 : 0; });
    var depois = {
      entradas: somaLanc(lanc, "entrada", P.somarDias(fimMes, 1), "9999-12-31"),
      saidas: somaLanc(lanc, "saida", P.somarDias(fimMes, 1), "9999-12-31"),
      lista: depoisLista
    };
    depois.saldoTotal = r(c(mes.saldoTotalFim) + c(depois.entradas) - c(depois.saidas));

    return {
      inicio: inicio,
      hoje: {
        conta: conta,
        caixinha: caixinha,
        disponivel: r(c(conta) + c(caixinha)),
        data: saldo.data
      },
      custo: P.custoPorDia(cfg),
      semana: semana,
      semanas: semanas,
      mes: mes,
      depois: depois,
      projecao: proj,
      linhasMes: linhasMes
    };
  };

  /* ---------- Vale + ajuda de custo do mês (Resumo!B11:B17) ---------- */
  P.beneficio = function (mesIso, config, dias) {
    var cfg = P.normalizarConfig(config);
    var mapa = Array.isArray(dias) ? P.mapaDias(dias) : (dias || {});
    var de = P.inicioDoMes(mesIso);
    var fim = P.fimDoMes(de);
    var n = 0;
    for (var d = de; d <= fim; d = P.somarDias(d, 1)) if (P.trabalha(d, cfg, mapa)) n++;
    var porDia = cfg.ganhos_dia.reduce(function (t, g) { return t + c(g.valor); }, 0);
    var dia = Math.min(cfg.dia_beneficio, Number(fim.slice(8, 10)));
    return {
      dias: n,
      porDia: r(porDia),
      total: r(porDia * n),
      data: de.slice(0, 8) + String(dia).padStart(2, "0"),
      itens: cfg.ganhos_dia
    };
  };
})();
