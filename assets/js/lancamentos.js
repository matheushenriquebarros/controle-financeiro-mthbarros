/* =====================================================================
   Recebimentos e Gastos (abas Recebimentos e Gastos da planilha).
   A mesma página serve os dois: <body data-tipo="entrada|saida">.

   • Lançamento com data até o dia do saldo informado = "no saldo"
     (já está dentro dele). Depois disso = "previsto" e entra na
     projeção do dia a dia.
   • "Repetir" cria vários lançamentos de uma vez (ex.: R$ 500 toda
     sexta, 4 vezes).
   ===================================================================== */
(function () {
  "use strict";

  var sb = MB.supabase;
  var $ = function (id) { return document.getElementById(id); };
  var TIPO = document.body.getAttribute("data-tipo") === "saida" ? "saida" : "entrada";
  var ENTRADA = TIPO === "entrada";
  var PADRAO = ENTRADA
    ? ["Trabalho", "Freela", "Vale e benefícios", "Reembolso", "Outros"]
    : ["Alimentação", "Transporte", "Moradia", "Contas da casa", "Cartão de crédito", "Assinaturas", "Lazer", "Saúde", "Outros"];
  var OUTRA = "__outra__";
  var NOME = ENTRADA ? "recebimento" : "gasto";

  var dados = null;
  var editando = null;
  var categoria = "";

  MB.exigirAcesso({ pagina: ENTRADA ? "recebimentos" : "gastos" }).then(iniciar).catch(MB.erro);

  function iniciar() {
    $("data").value = MB.hoje();
    MB.campoDinheiro($("valor"));

    $("form").addEventListener("submit", function (ev) { ev.preventDefault(); salvar(); });
    $("cancelar-edicao").addEventListener("click", limparFormulario);
    $("categorias").addEventListener("change", function (ev) {
      categoria = ev.target.value;
      $("categoria-outra").hidden = categoria !== OUTRA;
      if (categoria === OUTRA) $("categoria-outra").focus();
    });
    $("repetir").addEventListener("change", function () { $("vezes").disabled = !$("repetir").value; });
    ["filtro-mes", "filtro-categoria"].forEach(function (id) { $(id).addEventListener("change", desenhar); });
    $("filtro-busca").addEventListener("input", desenhar);
    $("filtro-todos").addEventListener("click", function () { $("filtro-mes").value = ""; desenhar(); });
    $("exportar").addEventListener("click", exportar);
    $("tabela").addEventListener("click", aoClicarTabela);

    return MB.carregarDados().then(function (d) {
      dados = d;
      $("filtro-mes").value = Projecao.somarDias(d.saldo.data, 1).slice(0, 7);
      categoria = PADRAO[0];
      montarCategorias();
      desenhar();
    });
  }

  /* ---------- Ajudantes ---------- */
  function meus() { return dados.lancamentos.filter(function (l) { return l.tipo === TIPO; }); }

  function somar(lista) {
    return Math.round(lista.reduce(function (t, x) { return t + Math.round((Number(x.valor) || 0) * 100); }, 0)) / 100;
  }

  function noMes(iso, mes) { return !mes || String(iso).slice(0, 7) === mes; }

  function noSaldo(l) { return !dados.saldo.vazio && l.data <= dados.saldo.data; }

  function todasCategorias() {
    var lista = PADRAO.slice();
    meus().forEach(function (l) { if (l.categoria && lista.indexOf(l.categoria) === -1) lista.splice(lista.length - 1, 0, l.categoria); });
    return lista;
  }

  function ordenar() {
    dados.lancamentos.sort(function (a, b) { return a.data < b.data ? -1 : a.data > b.data ? 1 : a.id - b.id; });
  }

  /* ---------- Formulário ---------- */
  function montarCategorias() {
    var lista = todasCategorias();
    $("categorias").innerHTML = lista.map(function (c) {
      return '<label class="pilula"><input type="radio" name="categoria" value="' + MB.esc(c) + '"' + (c === categoria ? " checked" : "") + "><span>" + MB.esc(c) + "</span></label>";
    }).join("") + '<label class="pilula"><input type="radio" name="categoria" value="' + OUTRA + '"' + (categoria === OUTRA ? " checked" : "") + "><span>+ Outra</span></label>";

    var atual = $("filtro-categoria").value;
    $("filtro-categoria").innerHTML = '<option value="">Todas</option>' + lista.map(function (c) {
      return '<option value="' + MB.esc(c) + '"' + (c === atual ? " selected" : "") + ">" + MB.esc(c) + "</option>";
    }).join("");
  }

  function limparFormulario() {
    editando = null;
    $("titulo-form").textContent = "Lançar " + NOME;
    $("salvar").lastElementChild.textContent = "Lançar " + NOME;
    $("cancelar-edicao").hidden = true;
    $("bloco-repetir").hidden = false;
    $("form").classList.remove("editando");
    $("valor").value = "";
    $("descricao").value = "";
    $("observacao").value = "";
    $("categoria-outra").value = "";
    $("repetir").value = "";
    $("vezes").disabled = true;
    if (!$("data").value) $("data").value = MB.hoje();
    montarCategorias();
  }

  function editar(l) {
    editando = l;
    categoria = l.categoria;
    $("titulo-form").textContent = "Editando " + NOME;
    $("salvar").lastElementChild.textContent = "Salvar alterações";
    $("cancelar-edicao").hidden = false;
    $("bloco-repetir").hidden = true;
    $("form").classList.add("editando");
    $("valor").value = MB.decimal(l.valor);
    $("data").value = l.data;
    $("descricao").value = l.descricao;
    $("observacao").value = l.observacao || "";
    $("categoria-outra").hidden = true;
    montarCategorias();
    desenhar();
    $("form").scrollIntoView({ behavior: "smooth", block: "start" });
    $("valor").focus({ preventScroll: true });
  }

  /* Datas da repetição: a cada 7/14 dias ou todo mês, a partir da data. */
  function datasRepetidas(inicio) {
    var regra = $("repetir").value;
    if (!regra || editando) return [inicio];
    var vezes = Math.max(2, Math.min(60, Number($("vezes").value) || 2));
    var lista = [];
    for (var i = 0; i < vezes; i++) {
      lista.push(regra === "mes" ? MB.somarMeses(inicio, i) : Projecao.somarDias(inicio, i * Number(regra)));
    }
    return lista;
  }

  function salvar() {
    var valor = MB.lerNumero($("valor").value);
    var descricao = $("descricao").value.trim();
    var cat = categoria === OUTRA ? $("categoria-outra").value.trim() : categoria;
    if (!(valor > 0)) { $("valor").focus(); return MB.aviso("Informe o valor.", true); }
    if (!descricao) { $("descricao").focus(); return MB.aviso(ENTRADA ? "Diga de onde vem." : "Diga o que foi o gasto.", true); }
    if (!cat) return MB.aviso(categoria === OUTRA ? "Dê um nome para a categoria." : "Escolha a categoria.", true);

    var base = {
      tipo: TIPO,
      descricao: descricao,
      categoria: cat,
      valor: valor,
      observacao: $("observacao").value.trim()
    };
    var data = $("data").value || MB.hoje();

    var botao = $("salvar");
    botao.disabled = true;
    var pedido;
    if (editando) {
      base.data = data;
      pedido = sb.from("fin_lancamentos").update(base).eq("id", editando.id).select();
    } else {
      pedido = sb.from("fin_lancamentos").insert(datasRepetidas(data).map(function (d) {
        var x = Object.assign({}, base);
        x.data = d;
        return x;
      })).select();
    }

    pedido.then(function (r) {
      if (r.error) throw r.error;
      var novo = !editando;
      var salvos = (r.data || []).map(function (l) { l.valor = Number(l.valor); return l; });
      if (novo) dados.lancamentos = dados.lancamentos.concat(salvos);
      else dados.lancamentos = dados.lancamentos.map(function (l) { return l.id === salvos[0].id ? salvos[0] : l; });
      ordenar();
      categoria = cat;
      limparFormulario();
      desenhar();
      MB.aviso(novo
        ? (salvos.length > 1 ? salvos.length + " lançamentos de " + MB.dinheiro(valor) + " criados." : MB.dinheiro(valor) + " lançado.")
        : "Lançamento atualizado.");
      $("valor").focus();
    }).catch(MB.erro).then(function () { botao.disabled = false; });
  }

  /* ---------- Indicadores e lista ---------- */
  function desenharIndicadores() {
    var mes = $("filtro-mes").value;
    var nomeMes = mes ? MB.mesExtenso(mes) : "todo o período";
    var doMes = meus().filter(function (l) { return noMes(l.data, mes); });
    var jaFoi = doMes.filter(noSaldo);
    var previsto = doMes.filter(function (l) { return !noSaldo(l); });
    var cartoes;

    if (ENTRADA) {
      var fimMes = mes ? Projecao.fimDoMes(mes + "-01") : null;
      var depois = fimMes ? meus().filter(function (l) { return l.data > fimMes; }) : [];
      cartoes = [
        { rotulo: "Recebido · " + nomeMes, valor: somar(jaFoi), nota: "Já está no saldo" },
        { rotulo: "Ainda vai entrar", valor: somar(previsto), nota: previsto.length + (previsto.length === 1 ? " lançamento previsto" : " lançamentos previstos"), classe: "positivo" },
        { rotulo: "Total · " + nomeMes, valor: somar(doMes), nota: doMes.length + (doMes.length === 1 ? " recebimento" : " recebimentos") },
        { rotulo: "Agendado depois", valor: somar(depois), nota: fimMes ? "Depois de " + MB.data(fimMes) : "Escolha um mês" }
      ];
    } else {
      // Custos do dia a dia (marmita + Uber) projetados para o mês.
      var custo = 0, dias = 0;
      if (mes) {
        var fim = Projecao.fimDoMes(mes + "-01");
        var inicio = Projecao.somarDias(dados.saldo.data, 1);
        if (fim >= inicio) {
          var proj = Projecao.projetar({ saldo: dados.saldo, config: dados.config, dias: dados.dias, lancamentos: [], ate: fim });
          proj.linhas.forEach(function (l) { if (noMes(l.data, mes)) { custo += Math.round(l.custoDia * 100); if (l.trabalha) dias++; } });
          custo = custo / 100;
        }
      }
      cartoes = [
        { rotulo: "Já saiu · " + nomeMes, valor: somar(jaFoi), nota: "Já está no saldo" },
        { rotulo: "Ainda vai sair", valor: somar(previsto), nota: "Gastos lançados, a partir de " + MB.diaMes(Projecao.somarDias(dados.saldo.data, 1)) },
        { rotulo: "Custos do dia a dia", valor: custo, nota: mes ? dias + " dias trabalhados previstos" : "Escolha um mês" },
        { rotulo: "Total ainda a sair", valor: Math.round((somar(previsto) + custo) * 100) / 100, nota: "Lançados + dia a dia", classe: "destaque-ember" }
      ];
    }

    $("indicadores").innerHTML = cartoes.map(function (k) {
      return '<div class="cartao indicador' + (k.classe ? " " + k.classe : "") + '"><span>' + MB.esc(k.rotulo) + "</span><strong>" + MB.dinheiro(k.valor) + "</strong><small>" + MB.esc(k.nota) + "</small></div>";
    }).join("");
  }

  function filtrados() {
    var mes = $("filtro-mes").value;
    var cat = $("filtro-categoria").value;
    var busca = $("filtro-busca").value.trim().toLowerCase();
    return meus().filter(function (l) {
      if (!noMes(l.data, mes)) return false;
      if (cat && l.categoria !== cat) return false;
      if (busca && (l.descricao + " " + (l.observacao || "")).toLowerCase().indexOf(busca) === -1) return false;
      return true;
    });
  }

  function desenhar() {
    desenharIndicadores();
    var lista = filtrados();
    var total = somar(lista);
    $("resumo-lista").textContent = lista.length + (lista.length === 1 ? " lançamento · " : " lançamentos · ") + MB.dinheiro(total);

    var cats = {};
    lista.forEach(function (l) { cats[l.categoria] = (cats[l.categoria] || 0) + Number(l.valor); });
    var ordem = Object.keys(cats).sort(function (a, b) { return cats[b] - cats[a]; });
    $("por-categoria").innerHTML = ordem.map(function (c) {
      return '<span class="tag">' + MB.esc(c) + " <b>" + MB.dinheiro(cats[c]) + "</b></span>";
    }).join("");
    $("por-categoria").hidden = ordem.length < 2;

    $("vazio").hidden = lista.length > 0;
    $("tabela").hidden = lista.length === 0;
    if (!lista.length) { $("tabela").innerHTML = ""; return; }

    $("tabela").innerHTML =
      '<thead><tr><th>Data</th><th>' + (ENTRADA ? "Recebimento" : "Gasto") + '</th><th class="num">Valor</th><th><span class="so-leitor">Ações</span></th></tr></thead><tbody>' +
      lista.map(function (l) {
        var situacao = noSaldo(l)
          ? '<span class="tag no-saldo" title="Data até o saldo informado: já está dentro dele">No saldo</span>'
          : '<span class="tag previsto" title="Entra na projeção do dia a dia">Previsto</span>';
        return '<tr data-id="' + l.id + '"' + (editando && editando.id === l.id ? ' class="em-edicao"' : "") + ">" +
          '<td class="mono data">' + MB.data(l.data) + " · " + Projecao.NOMES_DIA[Projecao.diaSemana(l.data)] + "</td>" +
          '<td class="descricao"><strong>' + MB.esc(l.descricao) + "</strong><small>" + situacao + ' <span class="tag">' + MB.esc(l.categoria) + "</span>" + (l.observacao ? " " + MB.esc(l.observacao) : "") + "</small></td>" +
          '<td class="num valor-lanc' + (ENTRADA ? " entrada-valor" : "") + '">' + MB.dinheiro(l.valor) + "</td>" +
          '<td><div class="acoes">' +
            '<button class="botao-icone" type="button" data-editar title="Editar" aria-label="Editar ' + MB.esc(l.descricao) + '">' + MB.icone("editar") + "</button>" +
            '<button class="botao-icone perigo" type="button" data-excluir title="Excluir" aria-label="Excluir ' + MB.esc(l.descricao) + '">' + MB.icone("lixeira") + "</button>" +
          "</div></td>" +
        "</tr>";
      }).join("") +
      "</tbody><tfoot><tr><td></td><td>Total (" + lista.length + ")</td>" +
      '<td class="num">' + MB.dinheiro(total) + "</td><td></td></tr></tfoot>";
  }

  function aoClicarTabela(ev) {
    var linha = ev.target.closest("tr[data-id]");
    if (!linha) return;
    var l = dados.lancamentos.filter(function (x) { return x.id === Number(linha.getAttribute("data-id")); })[0];
    if (!l) return;

    if (ev.target.closest("[data-editar]")) return editar(l);

    if (ev.target.closest("[data-excluir]")) {
      MB.confirmar("Excluir lançamento?", l.descricao + " — " + MB.dinheiro(l.valor) + " em " + MB.data(l.data) + ". Essa ação não pode ser desfeita.", "Excluir").then(function (sim) {
        if (!sim) return;
        return sb.from("fin_lancamentos").delete().eq("id", l.id).then(function (r) {
          if (r.error) throw r.error;
          dados.lancamentos = dados.lancamentos.filter(function (x) { return x.id !== l.id; });
          if (editando && editando.id === l.id) limparFormulario();
          desenhar();
          MB.aviso("Lançamento excluído.");
        });
      }).catch(MB.erro);
    }
  }

  /* CSV com ";" — abre direto no Excel. */
  function exportar() {
    var lista = filtrados();
    if (!lista.length) return MB.aviso("Nada para exportar neste filtro.", true);
    var txt = function (s) { return '"' + String(s == null ? "" : s).replace(/"/g, '""') + '"'; };
    var num = function (n) { return (Number(n) || 0).toFixed(2).replace(".", ","); };
    var linhas = [["Data", ENTRADA ? "Recebimento" : "Gasto", "Categoria", "Valor", "Situação", "Observação"].map(txt).join(";")];
    lista.forEach(function (l) {
      linhas.push([txt(MB.data(l.data)), txt(l.descricao), txt(l.categoria), num(l.valor), txt(noSaldo(l) ? "No saldo" : "Previsto"), txt(l.observacao)].join(";"));
    });
    var blob = new Blob(["﻿" + linhas.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (ENTRADA ? "recebimentos-" : "gastos-") + ($("filtro-mes").value || "todos") + ".csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
})();
