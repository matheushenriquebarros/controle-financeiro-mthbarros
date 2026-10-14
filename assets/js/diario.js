/* =====================================================================
   Dia a dia (aba Diário da planilha): cada dia do mês com o que entra,
   o custo do dia de trabalho (marmita + Uber), outros gastos e o saldo
   da conta no fim do dia.

   • "Trabalha" alterna folga/feriado (ou trabalho extra no fim de
     semana) e grava em fin_dias.
   • "Marmita" = levou de casa: o item marcado como marmita nos ajustes
     não sai naquele dia.
   • Dias até a data do saldo informado já estão dentro dele: aparecem
     apagados e não contam de novo.
   ===================================================================== */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var dados = null;
  var mes = "";

  MB.exigirAcesso({ pagina: "diario" }).then(function () {
    $("mes").addEventListener("change", function () { if ($("mes").value) irPara($("mes").value); });
    $("mes-anterior").addEventListener("click", function () { irPara(MB.somarMeses(mes + "-01", -1).slice(0, 7)); });
    $("mes-seguinte").addEventListener("click", function () { irPara(MB.somarMeses(mes + "-01", 1).slice(0, 7)); });
    $("tabela").addEventListener("click", aoClicar);
    return MB.carregarDados().then(function (d) {
      dados = d;
      var pedido = MB.parametro("mes");
      irPara(/^\d{4}-\d{2}$/.test(pedido || "") ? pedido : Projecao.somarDias(d.saldo.data, 1).slice(0, 7));
    });
  }).catch(MB.erro);

  function irPara(novo) {
    mes = novo;
    $("mes").value = mes;
    history.replaceState(null, "", "?mes=" + mes);
    desenhar();
  }

  function somar(lista, campo) {
    return Math.round(lista.reduce(function (t, x) { return t + Math.round((Number(x[campo]) || 0) * 100); }, 0)) / 100;
  }

  function valor(v, rotulo, classe) {
    if (!v) return '<span class="zero">—</span>';
    return '<span data-rotulo="' + rotulo + '" class="' + (classe || "") + '">' + MB.dinheiro(v) + "</span>";
  }

  function nomes(lista) {
    return lista.map(function (l) { return l.descricao; }).join(", ");
  }

  /* ---------- Desenho ---------- */
  function desenhar() {
    var s = dados.saldo;
    var inicio = Projecao.somarDias(s.data, 1);
    var deMes = mes + "-01";
    var fimMes = Projecao.fimDoMes(deMes);
    var hoje = MB.hoje();

    $("titulo-mes").textContent = MB.mesExtenso(mes).replace(/^./, function (c) { return c.toUpperCase(); });

    var proj = fimMes >= inicio
      ? Projecao.projetar({ saldo: s, config: dados.config, dias: dados.dias, lancamentos: dados.lancamentos, ate: fimMes })
      : { linhas: [], saldoInicial: s.conta };
    var porData = {};
    proj.linhas.forEach(function (l) { porData[l.data] = l; });

    var mapa = Projecao.mapaDias(dados.dias);
    var linhas = [];
    for (var d = deMes; d <= fimMes; d = Projecao.somarDias(d, 1)) {
      if (porData[d]) { linhas.push(porData[d]); continue; }
      // Dia que já está dentro do saldo: mostra o que foi lançado, sem contar.
      var lanc = dados.lancamentos.filter(function (l) { return l.data === d; });
      var entradas = lanc.filter(function (l) { return l.tipo === "entrada"; });
      var saidas = lanc.filter(function (l) { return l.tipo === "saida"; });
      linhas.push({
        data: d, semana: Projecao.diaSemana(d), passado: true,
        trabalha: Projecao.trabalha(d, dados.config, mapa), padrao: Projecao.trabalhaPadrao(d, dados.config),
        marmita: !!(mapa[d] && mapa[d].marmita), motivo: (mapa[d] && mapa[d].motivo) || "",
        entra: somar(entradas, "valor"), outros: somar(saidas, "valor"), custoDia: 0, itensDia: [],
        sai: somar(saidas, "valor"), saldo: d === s.data ? s.conta : null,
        entradas: entradas, saidas: saidas
      });
    }

    var futuras = linhas.filter(function (l) { return !l.passado; });
    var aviso = $("aviso-passado");
    if (!futuras.length) {
      aviso.hidden = false;
      aviso.innerHTML = "<strong>Este mês já está no saldo</strong>O saldo informado em " + MB.data(s.data) + " já inclui tudo o que entrou e saiu aqui. A projeção começa em " + MB.data(inicio) + ".";
    } else if (futuras.length < linhas.length) {
      aviso.hidden = false;
      aviso.innerHTML = "Até " + MB.data(s.data) + " já está dentro do saldo informado (" + MB.dinheiro(s.conta) + "): esses dias ficam apagados e não contam de novo.";
    } else aviso.hidden = true;

    // Indicadores do mês (só o que ainda vai acontecer)
    var antes = Projecao.somarDias(deMes, -1);
    var saldoAntes = antes < inicio ? s.conta : Projecao.saldoEm(proj, antes);
    var entra = somar(futuras, "entra");
    var custo = somar(futuras, "custoDia");
    var outros = somar(futuras, "outros");
    var fim = futuras.length ? futuras[futuras.length - 1].saldo : s.conta;
    var trabalhados = futuras.filter(function (l) { return l.trabalha; }).length;
    var marmitas = futuras.filter(function (l) { return l.marmita; }).length;
    var economia = Math.round(marmitas * (Projecao.custoPorDia(dados.config).pedindo - Projecao.custoPorDia(dados.config).levando) * 100) / 100;

    $("indicadores").innerHTML =
      indicador("Entra", MB.dinheiro(entra), futuras.length ? "De " + MB.diaMes(futuras[0].data) + " a " + MB.diaMes(fimMes) : "Nada a projetar") +
      indicador("Sai", MB.dinheiro(custo + outros), "Dia a dia " + MB.dinheiro(custo) + " · outros " + MB.dinheiro(outros)) +
      indicador("Saldo no fim do mês", MB.dinheiro(fim), "Começa em " + MB.dinheiro(saldoAntes), fim < 0 ? "destaque-ember" : "") +
      indicador("Dias trabalhados", String(trabalhados), marmitas ? marmitas + " com marmita · economia " + MB.dinheiro(economia) : "Nenhum com marmita marcado");

    // Tabela
    $("tabela").innerHTML =
      '<thead><tr><th>Dia</th><th>Trabalho</th><th class="num">Entra</th><th class="num">Dia de trabalho</th><th class="num">Outros gastos</th><th class="num">Sai</th><th class="num">Saldo</th></tr></thead><tbody>' +
      linhas.map(function (l) {
        var classes = [];
        if (l.semana >= 6) classes.push("fim-semana");
        if (!l.trabalha) classes.push("livre");
        if (l.passado) classes.push("passado");
        if (l.data === hoje) classes.push("hoje");

        var rotuloTrab, classeTrab, titulo;
        if (l.trabalha) { rotuloTrab = l.padrao ? "Trabalha" : "Trabalho extra"; classeTrab = "trabalha"; titulo = "Marcar como folga"; }
        else if (l.padrao) { rotuloTrab = l.motivo ? "Folga · " + l.motivo : "Folga"; classeTrab = "folga"; titulo = "Voltar a dia de trabalho"; }
        else { rotuloTrab = "Livre"; classeTrab = "livre"; titulo = "Marcar trabalho extra"; }

        var detalheDia = l.itensDia.map(function (i) { return i.nome; }).join(" + ");
        return '<tr class="' + classes.join(" ") + '" data-data="' + l.data + '">' +
          '<td class="dia"><strong>' + MB.diaMes(l.data) + "</strong><small>" + Projecao.NOMES_DIA[l.semana] + (l.data === hoje ? " · hoje" : "") + "</small></td>" +
          '<td class="botoes-dia">' +
            '<button type="button" class="alternar ' + classeTrab + '" data-acao="trabalha" title="' + titulo + '"' + (l.passado ? " disabled" : "") + ">" + MB.esc(rotuloTrab) + "</button> " +
            '<button type="button" class="alternar' + (l.marmita ? " marmita-sim" : "") + '" data-acao="marmita" title="Levou marmita de casa?" aria-pressed="' + (l.marmita ? "true" : "false") + '"' + (!l.trabalha || l.passado ? " disabled" : "") + ">" + MB.icone("marmita") + (l.marmita ? "Levou marmita" : "Marmita") + "</button>" +
          "</td>" +
          '<td class="num movimento' + (l.entra ? "" : " sem-valor") + '">' + valor(l.entra, "Entra", "entrada-valor") + (l.entradas.length ? '<span class="detalhe">' + MB.esc(nomes(l.entradas)) + "</span>" : "") + "</td>" +
          '<td class="num movimento' + (l.custoDia ? "" : " sem-valor") + '" title="' + MB.esc(detalheDia) + '">' + (l.passado ? '<span class="zero">—</span>' : valor(l.custoDia, "Dia de trabalho")) + "</td>" +
          '<td class="num movimento' + (l.outros ? "" : " sem-valor") + '">' + valor(l.outros, "Outros") + (l.saidas.length ? '<span class="detalhe">' + MB.esc(nomes(l.saidas)) + "</span>" : "") + "</td>" +
          '<td class="num so-largo">' + (l.sai ? MB.dinheiro(l.sai) : '<span class="zero">—</span>') + "</td>" +
          '<td class="num saldo' + (l.saldo != null && l.saldo < 0 ? " negativo" : "") + '">' + (l.saldo == null ? '<span class="zero">—</span>' : MB.dinheiro(l.saldo)) + "</td>" +
        "</tr>";
      }).join("") + "</tbody>" +
      '<tfoot><tr><td>Total</td><td class="so-largo"></td>' +
        '<td class="num"><span class="so-estreito suave">Entra </span>' + MB.dinheiro(entra) + "</td>" +
        '<td class="num so-largo">' + MB.dinheiro(custo) + "</td>" +
        '<td class="num so-largo">' + MB.dinheiro(outros) + "</td>" +
        '<td class="num"><span class="so-estreito suave">Sai </span>' + MB.dinheiro(custo + outros) + "</td>" +
        '<td class="num"><span class="so-estreito suave">Fim </span>' + MB.dinheiro(fim) + "</td></tr></tfoot>";
  }

  function indicador(rotulo, texto, nota, classe) {
    return '<div class="cartao indicador' + (classe ? " " + classe : "") + '"><span>' + MB.esc(rotulo) + "</span><strong>" + MB.esc(texto) + "</strong><small>" + MB.esc(nota) + "</small></div>";
  }

  /* ---------- Alternar trabalho / marmita ---------- */
  function aoClicar(ev) {
    var botao = ev.target.closest("[data-acao]");
    if (!botao || botao.disabled) return;
    var data = botao.closest("tr").getAttribute("data-data");
    var mapa = Projecao.mapaDias(dados.dias);
    var atual = mapa[data] || { data: data, trabalha: null, marmita: false, motivo: "" };
    var padrao = Projecao.trabalhaPadrao(data, dados.config);
    var trabalhaHoje = Projecao.trabalha(data, dados.config, mapa);
    var novo = { data: data, trabalha: atual.trabalha, marmita: !!atual.marmita, motivo: atual.motivo || "" };

    if (botao.getAttribute("data-acao") === "trabalha") {
      if (trabalhaHoje) novo.trabalha = padrao ? false : null;
      else novo.trabalha = padrao ? null : true;
      if (novo.trabalha == null) novo.motivo = "";
      if (novo.trabalha === false || (novo.trabalha == null && !padrao)) novo.marmita = false;
    } else {
      novo.marmita = !novo.marmita;
    }

    var antes = dados.dias.slice();
    dados.dias = dados.dias.filter(function (d) { return d.data !== data; });
    if (novo.trabalha != null || novo.marmita || novo.motivo) dados.dias.push(novo);
    desenhar();

    MB.salvarDia(novo).catch(function (e) {
      dados.dias = antes;
      desenhar();
      MB.erro(e);
    });
  }
})();
