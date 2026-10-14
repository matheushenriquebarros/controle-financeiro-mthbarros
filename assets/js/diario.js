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
        semTransporte: !!(mapa[d] && mapa[d].sem_transporte), nomeTransporte: Projecao.nomeTransporte(dados.config, d),
        temMarmita: Projecao.itensDoDia(dados.config, d).some(function (i) { return i.tipo === "marmita"; }),
        entra: somar(entradas, "valor"), outros: somar(saidas, "valor"), custoDia: 0, itensDia: [], detalheDia: [],
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
    var semTransp = futuras.filter(function (l) { return l.semTransporte; }).length;
    // Economia = o que sairia sem marmita/sem dispensar transporte − o que sai.
    var economia = futuras.reduce(function (t, l) {
      return t + l.detalheDia.reduce(function (s, i) { return s + (i.fora ? Math.round(i.padrao * 100) : 0); }, 0);
    }, 0) / 100;
    var notaDias = [];
    if (marmitas) notaDias.push(marmitas + " com marmita");
    if (semTransp) notaDias.push(semTransp + " sem transporte");

    $("indicadores").innerHTML =
      indicador("Entra", MB.dinheiro(entra), futuras.length ? "De " + MB.diaMes(futuras[0].data) + " a " + MB.diaMes(fimMes) : "Nada a projetar") +
      indicador("Sai", MB.dinheiro(custo + outros), "Dia a dia " + MB.dinheiro(custo) + " · outros " + MB.dinheiro(outros)) +
      indicador("Saldo no fim do mês", MB.dinheiro(fim), "Começa em " + MB.dinheiro(saldoAntes), fim < 0 ? "destaque-ember" : "") +
      indicador("Dias trabalhados", String(trabalhados), notaDias.length ? notaDias.join(" · ") + " · economia " + MB.dinheiro(economia) : "Toque em Marmita ou Uber nos dias");

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

        var bloqueado = !l.trabalha || l.passado;
        var detalheDia = l.itensDia.map(function (i) { return i.nome + " " + MB.dinheiro(i.valor); }).join(" + ");
        var botaoTransp = l.nomeTransporte && l.trabalha
          ? '<button type="button" class="alternar' + (l.semTransporte && l.trabalha ? " sem" : "") + '" data-acao="transporte" title="' + (l.nomeTransporte === "Uber" ? "Foi de Uber" : "Teve gasto de transporte") + ' neste dia?" aria-pressed="' + (l.semTransporte ? "false" : "true") + '"' + (bloqueado ? " disabled" : "") + ">" + MB.icone("carro") + (l.semTransporte && l.trabalha ? (l.nomeTransporte === "Uber" ? "Sem Uber" : "Sem transporte") : MB.esc(l.nomeTransporte)) + "</button>"
          : "";
        var botaoMarmita = l.temMarmita && l.trabalha
          ? '<button type="button" class="alternar' + (l.marmita ? " marmita-sim" : "") + '" data-acao="marmita" title="Levou marmita de casa?" aria-pressed="' + (l.marmita ? "true" : "false") + '"' + (bloqueado ? " disabled" : "") + ">" + MB.icone("marmita") + (l.marmita ? "Levou marmita" : "Marmita") + "</button>"
          : "";
        var celulaDia;
        if (l.passado || !l.trabalha) celulaDia = '<span class="zero">—</span>';
        else celulaDia = '<button type="button" class="valor-dia' + (l.ajustado ? " ajustado" : "") + '" data-acao="valores" title="' + MB.esc(detalheDia || "Sem gastos") + ' · toque para mudar os valores deste dia">' +
          '<span data-rotulo="Dia de trabalho">' + MB.dinheiro(l.custoDia) + "</span>" + MB.icone("editar") + "</button>" +
          (l.ajustado ? '<span class="detalhe">valor ajustado</span>' : "");
        return '<tr class="' + classes.join(" ") + '" data-data="' + l.data + '">' +
          '<td class="dia"><strong>' + MB.diaMes(l.data) + "</strong><small>" + Projecao.NOMES_DIA[l.semana] + (l.data === hoje ? " · hoje" : "") + "</small></td>" +
          '<td class="botoes-dia">' +
            '<button type="button" class="alternar ' + classeTrab + '" data-acao="trabalha" title="' + titulo + '"' + (l.passado ? " disabled" : "") + ">" + MB.esc(rotuloTrab) + "</button> " +
            botaoMarmita + " " + botaoTransp +
          "</td>" +
          '<td class="num movimento' + (l.entra ? "" : " sem-valor") + '">' + valor(l.entra, "Entra", "entrada-valor") + (l.entradas.length ? '<span class="detalhe">' + MB.esc(nomes(l.entradas)) + "</span>" : "") + "</td>" +
          '<td class="num movimento' + (l.trabalha && !l.passado ? "" : " sem-valor") + '">' + celulaDia + "</td>" +
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

  /* ---------- Alternar trabalho / marmita / transporte ---------- */
  function diaAtual(data) {
    var atual = Projecao.mapaDias(dados.dias)[data] || {};
    return {
      data: data,
      trabalha: atual.trabalha == null ? null : atual.trabalha,
      marmita: !!atual.marmita,
      sem_transporte: !!atual.sem_transporte,
      valores: Object.assign({}, atual.valores || {}),
      motivo: atual.motivo || ""
    };
  }

  function gravar(novo) {
    var antes = dados.dias.slice();
    dados.dias = dados.dias.filter(function (d) { return d.data !== novo.data; });
    if (!MB.diaVazio(novo)) dados.dias.push(novo);
    desenhar();
    return MB.salvarDia(novo).then(function () { return true; }, function (e) {
      dados.dias = antes;
      desenhar();
      MB.erro(e);
      return false;
    });
  }

  function aoClicar(ev) {
    var botao = ev.target.closest("[data-acao]");
    if (!botao || botao.disabled) return;
    var data = botao.closest("tr").getAttribute("data-data");
    var acao = botao.getAttribute("data-acao");
    var novo = diaAtual(data);

    if (acao === "valores") return editarValores(novo);

    if (acao === "trabalha") {
      var padrao = Projecao.trabalhaPadrao(data, dados.config);
      var trabalhaHoje = Projecao.trabalha(data, dados.config, Projecao.mapaDias(dados.dias));
      if (trabalhaHoje) novo.trabalha = padrao ? false : null;
      else novo.trabalha = padrao ? null : true;
      if (novo.trabalha == null) novo.motivo = "";
      if (novo.trabalha === false || (novo.trabalha == null && !padrao)) {
        novo.marmita = false;
        novo.sem_transporte = false;
        novo.valores = {};
      }
    } else if (acao === "marmita") {
      novo.marmita = !novo.marmita;
    } else if (acao === "transporte") {
      novo.sem_transporte = !novo.sem_transporte;
    }
    gravar(novo);
  }

  /* ---------- Valores do dia (Uber mais caro, sem marmita etc.) ---------- */
  function editarValores(novo) {
    var itens = Projecao.custosDoDia(dados.config, novo.data, novo);
    if (!itens.length) return MB.aviso("Nenhum gasto por dia trabalhado vale nesta data. Veja em Ajustes.", true);

    var d = document.createElement("dialog");
    d.className = "dialogo dialogo-dia";
    d.innerHTML =
      '<form method="dialog" novalidate>' +
        "<h2>Gastos de " + Projecao.NOMES_DIA[Projecao.diaSemana(novo.data)].toLowerCase() + ", " + MB.diaMes(novo.data) + "</h2>" +
        '<p class="suave">Mude o valor só deste dia. Deixe 0 se não teve o gasto.</p>' +
        itens.map(function (i) {
          var atual = i.fora ? 0 : i.valor;
          return '<div class="grupo"><label for="v-' + MB.esc(i.id) + '">' + MB.esc(i.nome) +
            ' <span class="suave">(normal ' + MB.dinheiro(i.padrao) + ")</span></label>" +
            '<div class="campo-prefixo"><span>R$</span><input class="campo num" id="v-' + MB.esc(i.id) + '" data-id="' + MB.esc(i.id) + '" inputmode="decimal" value="' + MB.decimal(atual) + '" autocomplete="off"></div></div>';
        }).join("") +
        '<div class="dialogo-acoes">' +
          '<button class="botao fantasma pequeno" type="button" data-padrao>Voltar ao normal</button>' +
          '<button class="botao fantasma pequeno" type="button" data-cancelar>Cancelar</button>' +
          '<button class="botao pequeno" type="submit">Salvar</button>' +
        "</div>" +
      "</form>";
    document.body.appendChild(d);
    d.querySelectorAll("input[data-id]").forEach(function (c) { MB.campoDinheiro(c); });

    var fechar = function () { d.close(); d.remove(); };
    d.addEventListener("cancel", function (ev) { ev.preventDefault(); fechar(); });
    d.querySelector("[data-cancelar]").addEventListener("click", fechar);
    d.querySelector("[data-padrao]").addEventListener("click", function () {
      itens.forEach(function (i) {
        delete novo.valores[i.id];
        if (i.tipo === "marmita") novo.marmita = false;
        if (i.tipo === "transporte") novo.sem_transporte = false;
      });
      fechar();
      gravar(novo).then(function (ok) { if (ok) MB.aviso("Dia " + MB.diaMes(novo.data) + " voltou aos valores normais."); });
    });
    d.querySelector("form").addEventListener("submit", function (ev) {
      ev.preventDefault();
      itens.forEach(function (i) {
        var v = MB.lerNumero(d.querySelector('[data-id="' + i.id + '"]').value);
        // Igual ao normal → não guarda ajuste. 0 em marmita/transporte → usa o botão.
        if (v === 0 && i.tipo === "marmita") { novo.marmita = true; delete novo.valores[i.id]; return; }
        if (i.tipo === "marmita") novo.marmita = false;
        if (Math.round(v * 100) === Math.round(i.padrao * 100)) delete novo.valores[i.id];
        else novo.valores[i.id] = v;
      });
      // Transporte: todos os itens zerados = "sem transporte".
      var transp = itens.filter(function (i) { return i.tipo === "transporte"; });
      if (transp.length && transp.every(function (i) { return novo.valores[i.id] === 0; })) {
        novo.sem_transporte = true;
        transp.forEach(function (i) { delete novo.valores[i.id]; });
      } else if (transp.length) {
        novo.sem_transporte = false;
      }
      fechar();
      gravar(novo).then(function (ok) { if (ok) MB.aviso("Valores de " + MB.diaMes(novo.data) + " salvos."); });
    });
    d.showModal();
    var primeiro = d.querySelector("input[data-id]");
    if (primeiro) { primeiro.focus(); primeiro.select(); }
  }
})();
