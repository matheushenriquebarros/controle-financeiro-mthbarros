/* =====================================================================
   Ajustes (premissas da aba Resumo): dias trabalhados na semana,
   gastos e ganhos por dia trabalhado, dia do vale, histórico de saldos
   e folgas/feriados.
   ===================================================================== */
(function () {
  "use strict";

  var sb = MB.supabase;
  var $ = function (id) { return document.getElementById(id); };
  var cfg = null;
  var saldos = [];
  var folgas = [];
  var alterado = false;

  MB.exigirAcesso({ pagina: "ajustes" }).then(function () {
    $("form-config").addEventListener("submit", function (ev) { ev.preventDefault(); salvarConfig(); });
    $("form-config").addEventListener("input", marcarAlterado);
    $("form-config").addEventListener("change", aoMudarConfig);
    $("form-config").addEventListener("click", aoClicarConfig);
    $("mais-custo").addEventListener("click", function () {
      cfg.custos_dia.push({ id: "c" + Date.now().toString(36), nome: "", valor: 0, tipo: "fixo", desde: null, ate: null });
      desenharItens(); focarUltimo("custos"); marcarAlterado();
    });
    $("mais-ganho").addEventListener("click", function () { cfg.ganhos_dia.push({ nome: "", valor: 0 }); desenharItens(); focarUltimo("ganhos"); marcarAlterado(); });
    $("botao-saldo").addEventListener("click", function () {
      MB.atualizarSaldo(saldos[0] ? { conta: Number(saldos[0].conta), caixinha: Number(saldos[0].caixinha) } : null).then(function (novo) {
        if (novo) { saldos.unshift(novo); ordenarSaldos(); desenharSaldos(); }
      });
    });
    $("saldos").addEventListener("click", aoClicarSaldo);
    $("form-folga").addEventListener("submit", function (ev) { ev.preventDefault(); adicionarFolga(); });
    $("folgas").addEventListener("click", aoClicarFolga);
    window.addEventListener("beforeunload", function (ev) { if (alterado) { ev.preventDefault(); ev.returnValue = ""; } });

    return Promise.all([
      sb.from("fin_config").select("*").maybeSingle(),
      sb.from("fin_saldos").select("*").order("data", { ascending: false }).order("id", { ascending: false }).limit(30),
      sb.from("fin_dias").select("*").eq("trabalha", false).order("data")
    ]).then(function (r) {
      r.forEach(function (x) { if (x.error) throw x.error; });
      cfg = Projecao.normalizarConfig(r[0].data);
      saldos = r[1].data || [];
      folgas = r[2].data || [];
      if (!r[0].data) $("estado-config").textContent = "Valores iniciais da planilha: confira e salve.";
      desenharConfig();
      desenharSaldos();
      desenharFolgas();
    });
  }).catch(MB.erro);

  function marcarAlterado() {
    alterado = true;
    $("estado-config").textContent = "Alterações não salvas";
  }

  function focarUltimo(id) {
    var campos = $(id).querySelectorAll("[data-c=nome]");
    if (campos.length) campos[campos.length - 1].focus();
  }

  /* ---------- Rotina de trabalho ---------- */
  function desenharConfig() {
    $("dias-semana").innerHTML = [1, 2, 3, 4, 5, 6, 7].map(function (d) {
      return '<label class="pilula"><input type="checkbox" value="' + d + '" data-dia' + (cfg.dias_semana.indexOf(d) > -1 ? " checked" : "") + "><span>" + Projecao.NOMES_DIA[d] + "</span></label>";
    }).join("");
    $("dia-beneficio").value = cfg.dia_beneficio;
    desenharItens();
  }

  function linhaItem(lista, i, item) {
    return '<div class="item-lista sem-chave" data-lista="' + lista + '" data-i="' + i + '">' +
      '<input class="campo" data-c="nome" value="' + MB.esc(item.nome) + '" placeholder="Nome" aria-label="Nome">' +
      '<div class="campo-prefixo"><span>R$</span><input class="campo num" data-c="valor" inputmode="decimal" value="' + MB.decimal(item.valor) + '" aria-label="Valor"></div>' +
      '<button class="botao-icone perigo" type="button" data-remover title="Remover" aria-label="Remover ' + MB.esc(item.nome || "item") + '">' + MB.icone("lixeira") + "</button>" +
    "</div>";
  }

  var TIPOS = [
    ["marmita", "Alimentação · some com marmita"],
    ["transporte", "Transporte · botão Uber no dia a dia"],
    ["fixo", "Fixo · todo dia trabalhado"]
  ];

  /* Gasto por dia trabalhado: nome, valor, tipo e período (de/até). */
  function linhaCusto(i, item) {
    var hoje = MB.hoje();
    var situacao = item.ate && item.ate < hoje ? '<span class="tag no-saldo">Encerrado</span>'
      : item.desde && item.desde > hoje ? '<span class="tag previsto">A partir de ' + MB.diaMes(item.desde) + "</span>" : "";
    return '<div class="item-custo" data-lista="custos_dia" data-i="' + i + '">' +
      '<div class="item-lista sem-chave">' +
        '<input class="campo" data-c="nome" value="' + MB.esc(item.nome) + '" placeholder="Ex.: Gasolina (ida e volta)" aria-label="Nome">' +
        '<div class="campo-prefixo"><span>R$</span><input class="campo num" data-c="valor" inputmode="decimal" value="' + MB.decimal(item.valor) + '" aria-label="Valor por dia"></div>' +
        '<button class="botao-icone perigo" type="button" data-remover title="Remover" aria-label="Remover ' + MB.esc(item.nome || "item") + '">' + MB.icone("lixeira") + "</button>" +
      "</div>" +
      '<div class="item-custo-extra">' +
        '<select class="selecao" data-c="tipo" aria-label="Tipo">' + TIPOS.map(function (t) {
          return '<option value="' + t[0] + '"' + (item.tipo === t[0] ? " selected" : "") + ">" + t[1] + "</option>";
        }).join("") + "</select>" +
        '<label class="periodo"><span>De</span><input class="campo" type="date" data-c="desde" value="' + (item.desde || "") + '" aria-label="Vale a partir de"></label>' +
        '<label class="periodo"><span>Até</span><input class="campo" type="date" data-c="ate" value="' + (item.ate || "") + '" aria-label="Vale até"></label>' +
        situacao +
      "</div>" +
    "</div>";
  }

  function desenharItens() {
    $("custos").innerHTML = cfg.custos_dia.map(function (x, i) { return linhaCusto(i, x); }).join("") ||
      '<div class="vazio pequeno">Nenhum gasto por dia trabalhado.</div>';
    $("ganhos").innerHTML = cfg.ganhos_dia.map(function (x, i) { return linhaItem("ganhos_dia", i, x); }).join("") ||
      '<div class="vazio pequeno">Nenhum ganho por dia trabalhado.</div>';
    desenharSomas();
  }

  function desenharSomas() {
    var hoje = MB.hoje();
    var c = Projecao.custoPorDia(cfg, hoje);
    var temMarmita = Projecao.itensDoDia(cfg, hoje).some(function (x) { return x.tipo === "marmita"; });
    $("soma-custos").innerHTML = "Hoje, por dia <b>" + MB.dinheiro(c.pedindo) + "</b>" + (temMarmita ? " · levando marmita <b>" + MB.dinheiro(c.levando) + "</b>" : "");
    var g = cfg.ganhos_dia.reduce(function (t, x) { return t + (Number(x.valor) || 0); }, 0);
    $("soma-ganhos").innerHTML = "Por dia <b>" + MB.dinheiro(g) + "</b>";
  }

  function aoMudarConfig(ev) {
    var el = ev.target;
    if (el.hasAttribute("data-dia")) {
      cfg.dias_semana = Array.prototype.map.call($("dias-semana").querySelectorAll("input:checked"), function (x) { return Number(x.value); });
      return marcarAlterado();
    }
    lerItem(el);
    if (el.getAttribute("data-c") === "valor") el.value = MB.decimal(MB.lerNumero(el.value));
    desenharSomas();
    marcarAlterado();
  }

  function lerItem(el) {
    var linha = el.closest("[data-lista]");
    if (!linha) return;
    var item = cfg[linha.getAttribute("data-lista")][Number(linha.getAttribute("data-i"))];
    var campo = el.getAttribute("data-c");
    if (campo === "nome") item.nome = el.value.trim();
    if (campo === "valor") item.valor = MB.lerNumero(el.value);
    if (campo === "tipo") item.tipo = el.value;
    if (campo === "desde") item.desde = el.value || null;
    if (campo === "ate") item.ate = el.value || null;
  }

  function aoClicarConfig(ev) {
    var b = ev.target.closest("[data-remover]");
    if (!b) return;
    var linha = b.closest("[data-lista]");
    cfg[linha.getAttribute("data-lista")].splice(Number(linha.getAttribute("data-i")), 1);
    desenharItens();
    marcarAlterado();
  }

  function salvarConfig() {
    // Lê os campos de novo (o último pode não ter disparado "change").
    $("form-config").querySelectorAll("[data-lista] [data-c]").forEach(lerItem);
    var limpar = function (lista) { return lista.filter(function (x) { return x.nome || Number(x.valor); }).map(function (x) { x.nome = x.nome || "Sem nome"; return x; }); };
    cfg.custos_dia = limpar(cfg.custos_dia);
    cfg.ganhos_dia = limpar(cfg.ganhos_dia).map(function (x) { return { nome: x.nome, valor: Number(x.valor) || 0 }; });
    cfg.dia_beneficio = Math.max(1, Math.min(31, Number($("dia-beneficio").value) || 5));
    var invertido = cfg.custos_dia.filter(function (x) { return x.desde && x.ate && x.desde > x.ate; })[0];
    if (invertido) return MB.aviso(invertido.nome + ": a data \"de\" está depois da \"até\".", true);

    var botao = $("salvar-config");
    botao.disabled = true;
    sb.from("fin_config").upsert({
      user_id: MB.usuario.id,
      dias_semana: cfg.dias_semana.slice().sort(),
      custos_dia: cfg.custos_dia,
      ganhos_dia: cfg.ganhos_dia,
      dia_beneficio: cfg.dia_beneficio,
      atualizado_em: new Date().toISOString()
    }, { onConflict: "user_id" }).then(function (r) {
      if (r.error) throw r.error;
      alterado = false;
      $("estado-config").textContent = "Salvo";
      desenharConfig();
      MB.aviso("Ajustes salvos. A projeção já usa os novos valores.");
    }).catch(MB.erro).then(function () { botao.disabled = false; });
  }

  /* ---------- Saldos ---------- */
  function ordenarSaldos() {
    saldos.sort(function (a, b) { return a.data < b.data ? 1 : a.data > b.data ? -1 : b.id - a.id; });
  }

  function desenharSaldos() {
    if (!saldos.length) {
      $("saldos").innerHTML = '<div class="vazio pequeno">Nenhum saldo informado ainda. A projeção parte de R$ 0,00.</div>';
      return;
    }
    $("saldos").innerHTML = saldos.map(function (s, i) {
      return '<div class="saldo-linha' + (i === 0 ? " atual" : "") + '" data-id="' + s.id + '">' +
        "<div><strong>" + MB.dinheiro(s.conta) + (Number(s.caixinha) ? ' <span class="suave">+ caixinha ' + MB.dinheiro(s.caixinha) + "</span>" : "") + "</strong>" +
        "<small>Fim do dia " + MB.data(s.data) + (i === 0 ? " · ponto de partida da projeção" : "") + (s.observacao ? " · " + MB.esc(s.observacao) : "") + "</small></div>" +
        '<button class="botao-icone perigo" type="button" data-excluir title="Excluir" aria-label="Excluir saldo de ' + MB.data(s.data) + '">' + MB.icone("lixeira") + "</button>" +
      "</div>";
    }).join("");
  }

  function aoClicarSaldo(ev) {
    if (!ev.target.closest("[data-excluir]")) return;
    var id = Number(ev.target.closest("[data-id]").getAttribute("data-id"));
    var s = saldos.filter(function (x) { return x.id === id; })[0];
    MB.confirmar("Excluir saldo?", MB.dinheiro(s.conta) + " em " + MB.data(s.data) + ". Se for o mais recente, a projeção volta a partir do anterior.", "Excluir").then(function (sim) {
      if (!sim) return;
      return sb.from("fin_saldos").delete().eq("id", id).then(function (r) {
        if (r.error) throw r.error;
        saldos = saldos.filter(function (x) { return x.id !== id; });
        desenharSaldos();
        MB.aviso("Saldo excluído.");
      });
    }).catch(MB.erro);
  }

  /* ---------- Folgas ---------- */
  function desenharFolgas() {
    if (!folgas.length) {
      $("folgas").innerHTML = '<div class="vazio pequeno">Nenhuma folga marcada.</div>';
      return;
    }
    var hoje = MB.hoje();
    $("folgas").innerHTML = folgas.map(function (f) {
      return '<div class="folga-linha" data-data="' + f.data + '"' + (f.data < hoje ? ' style="opacity:.55"' : "") + ">" +
        "<div><strong>" + MB.data(f.data) + " · " + Projecao.NOMES_DIA[Projecao.diaSemana(f.data)] + "</strong><small>" + MB.esc(f.motivo || "Folga") + "</small></div>" +
        '<button class="botao-icone perigo" type="button" data-excluir title="Remover folga" aria-label="Remover folga de ' + MB.data(f.data) + '">' + MB.icone("lixeira") + "</button>" +
      "</div>";
    }).join("");
  }

  function adicionarFolga() {
    var data = $("folga-data").value;
    if (!data) { $("folga-data").focus(); return MB.aviso("Escolha a data.", true); }
    MB.salvarDia({ data: data, trabalha: false, marmita: false, motivo: $("folga-motivo").value.trim() }).then(function (salvo) {
      folgas = folgas.filter(function (f) { return f.data !== data; }).concat([salvo]);
      folgas.sort(function (a, b) { return a.data < b.data ? -1 : 1; });
      $("folga-data").value = "";
      $("folga-motivo").value = "";
      desenharFolgas();
      MB.aviso("Folga em " + MB.data(data) + " marcada.");
    }).catch(MB.erro);
  }

  function aoClicarFolga(ev) {
    if (!ev.target.closest("[data-excluir]")) return;
    var data = ev.target.closest("[data-data]").getAttribute("data-data");
    MB.salvarDia({ data: data, trabalha: null, marmita: false, motivo: "" }).then(function () {
      folgas = folgas.filter(function (f) { return f.data !== data; });
      desenharFolgas();
      MB.aviso("Folga removida: " + MB.data(data) + " volta a ser dia normal.");
    }).catch(MB.erro);
  }
})();
