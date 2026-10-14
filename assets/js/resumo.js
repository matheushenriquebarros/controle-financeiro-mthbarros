/* =====================================================================
   Resumo (aba Resumo da planilha): onde você está hoje, saldo até o
   fim do mês com gráfico, esta semana, semana por semana, depois do
   mês, vale/ajuda de custo e as premissas usadas na conta.
   ===================================================================== */
(function () {
  "use strict";

  var sb = MB.supabase;
  var $ = function (id) { return document.getElementById(id); };
  var dados = null;

  MB.exigirAcesso({ pagina: "resumo" }).then(function () {
    $("botao-saldo").addEventListener("click", pedirSaldo);
    $("aviso-saldo").addEventListener("click", function (ev) { if (ev.target.closest("[data-saldo]")) pedirSaldo(); });
    $("beneficio").addEventListener("click", function (ev) { if (ev.target.closest("[data-lancar]")) lancarBeneficio(); });
    return carregar();
  }).catch(MB.erro);

  function carregar() {
    return MB.carregarDados().then(function (d) {
      dados = d;
      desenhar();
    });
  }

  function pedirSaldo() {
    MB.atualizarSaldo(dados && dados.saldo).then(function (novo) { if (novo) carregar().catch(MB.erro); });
  }

  /* ---------- Ajudantes de HTML ---------- */
  function cartao(rotulo, valor, nota, classe) {
    return '<div class="cartao indicador' + (classe ? " " + classe : "") + '"><span>' + MB.esc(rotulo) + "</span><strong>" + MB.dinheiro(valor) + "</strong><small>" + MB.esc(nota || "") + "</small></div>";
  }

  function item(rotulo, valor, nota, classe) {
    return '<div class="' + (classe || "") + '"><dt>' + MB.esc(rotulo) + (nota ? "<small>" + MB.esc(nota) + "</small>" : "") + "</dt>" +
      '<dd class="' + (valor < 0 ? "negativo" : "") + '">' + MB.dinheiro(valor) + "</dd></div>";
  }

  function dataLonga(iso) {
    var p = iso.split("-").map(Number);
    return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString("pt-BR", { day: "numeric", month: "long" });
  }

  /* ---------- Desenho ---------- */
  function desenhar() {
    var s = dados.saldo;
    var R = Projecao.resumo({ saldo: s, config: dados.config, dias: dados.dias, lancamentos: dados.lancamentos });
    var mes = R.mes;
    var hoje = MB.hoje();

    $("rotulo-mes").textContent = MB.mesExtenso(R.inicio);

    // Aviso de saldo antigo / sem saldo
    var ontem = Projecao.somarDias(hoje, -1);
    var aviso = "";
    if (s.vazio) aviso = "Você ainda não informou o saldo. A conta está partindo de R$ 0,00.";
    else if (s.data < ontem) aviso = "O último saldo informado é de " + MB.data(s.data) + ". Atualize para a projeção começar de hoje.";
    $("aviso-saldo").hidden = !aviso;
    $("aviso-saldo").innerHTML = aviso ? MB.icone("alerta") + "<span>" + MB.esc(aviso) + '</span><button class="botao pequeno" type="button" data-saldo>Atualizar saldo</button>' : "";

    // Onde você está hoje
    $("hoje").innerHTML =
      cartao("Saldo na conta", R.hoje.conta, s.vazio ? "Ainda não informado" : "Fim do dia " + MB.data(s.data), R.hoje.conta < 0 ? "destaque-ember" : "") +
      cartao("Guardado na caixinha", R.hoje.caixinha, "Fica separado do dia a dia") +
      cartao("Total disponível agora", R.hoje.disponivel, "Conta + caixinha") +
      cartao("Menor saldo do mês", mes.menor.saldo, "Em " + MB.data(mes.menor.data) + " · folga para gastos extras", mes.menor.saldo < 0 ? "destaque-ember" : "");

    // Fim do mês + gráfico
    $("periodo").textContent = MB.data(R.inicio) + " a " + MB.data(mes.fimMes);
    $("rotulo-fim").textContent = "Saldo em " + dataLonga(mes.fimMes);
    $("saldo-fim").textContent = MB.dinheiro(mes.saldoFim);
    $("saldo-fim").classList.toggle("negativo", mes.saldoFim < 0);
    $("conta-fim").innerHTML =
      "<span>Hoje <b>" + MB.dinheiro(R.hoje.conta) + "</b></span>" +
      "<span>+ entra <b>" + MB.dinheiro(mes.entra) + "</b></span>" +
      "<span>− sai <b>" + MB.dinheiro(mes.sai) + "</b></span>";

    var pontos = [{ data: s.data, saldo: R.hoje.conta, entra: 0, sai: 0, inicial: true }].concat(R.linhasMes);
    MB.graficoSaldo($("grafico"), pontos);
    $("grafico-legenda").innerHTML =
      '<span><i style="background:var(--ember)"></i>Saldo da conta no fim do dia</span>' +
      '<span><i style="background:var(--ok)"></i>Dia em que entra dinheiro</span>' +
      '<span><i style="background:var(--erro, var(--ember));box-shadow:0 0 0 2px var(--superficie),0 0 0 3px var(--erro, var(--ember))"></i>Menor saldo: ' + MB.dinheiro(mes.menor.saldo) + " em " + MB.diaMes(mes.menor.data) + "</span>";

    // Esta semana
    var w = R.semana;
    $("semana-periodo").textContent = MB.diaMes(w.segunda) + " a " + MB.diaMes(w.domingo);
    $("semana").innerHTML =
      item("Já recebido na semana", w.jaRecebido, "Já está no saldo") +
      item("Ainda vai receber", w.vaiReceber, "De " + MB.diaMes(R.inicio) + " até domingo") +
      item("Total que você recebe na semana", w.totalSemana) +
      item("Gastos previstos", -w.gastosPrevistos, "Dia a dia + gastos lançados, até domingo") +
      item("Saldo da conta no domingo", w.saldoDomingo, MB.data(w.domingo), "total");

    // Mês
    $("mes-periodo").textContent = "Até " + MB.data(mes.fimMes);
    $("mes").innerHTML =
      item("Já recebido no mês", mes.jaRecebido, "Já está no saldo") +
      item("Ainda vai entrar", mes.entra) +
      item("Custos do dia a dia", -mes.custosDia, mes.diasTrabalhados + (mes.diasTrabalhados === 1 ? " dia trabalhado" : " dias trabalhados") + (mes.diasMarmita ? " · " + mes.diasMarmita + " com marmita" : "")) +
      item("Outros gastos lançados", -mes.outros) +
      item("Sobra (entra − sai)", mes.sobra) +
      item("Saldo da conta no último dia", mes.saldoFim) +
      item("Saldo total no fim do mês", mes.saldoTotalFim, "Conta + caixinha", "total");

    desenharSemanas(R);
    desenharDepois(R);
    desenharBeneficio(R);
    desenharPremissas(R);
  }

  function desenharSemanas(R) {
    var hoje = MB.hoje();
    $("semanas").innerHTML =
      '<thead><tr><th>Semana</th><th>Período</th><th class="num">Já recebido</th><th class="num">Vai receber</th><th class="num">Gastos previstos</th><th class="num">Saldo no fim</th></tr></thead><tbody>' +
      R.semanas.map(function (x) {
        var atual = hoje >= x.de && hoje <= x.ate;
        return "<tr" + (atual ? ' class="atual"' : "") + ">" +
          "<td>Semana " + x.n + "</td>" +
          '<td class="mono data" data-rotulo="Período">' + MB.diaMes(x.de) + " a " + MB.diaMes(x.ate) + "</td>" +
          '<td class="num" data-rotulo="Já recebido">' + MB.dinheiro(x.jaRecebido) + "</td>" +
          '<td class="num entrada-valor" data-rotulo="Vai receber">' + MB.dinheiro(x.vaiReceber) + "</td>" +
          '<td class="num" data-rotulo="Gastos previstos">' + MB.dinheiro(x.gastos) + "</td>" +
          '<td class="num' + (x.saldoFim < 0 ? " negativo" : "") + '" data-rotulo="Saldo no fim"><strong>' + MB.dinheiro(x.saldoFim) + "</strong></td>" +
        "</tr>";
      }).join("") + "</tbody>";
  }

  function desenharDepois(R) {
    var d = R.depois;
    var linhas = d.lista.slice(0, 6).map(function (l) {
      var v = l.tipo === "entrada" ? l.valor : -l.valor;
      return item(l.descricao, v, MB.data(l.data));
    }).join("");
    if (d.lista.length > 6) linhas += '<div><dt>+ ' + (d.lista.length - 6) + ' lançamentos</dt><dd></dd></div>';
    if (!d.lista.length) linhas = '<div><dt>Nada agendado depois de ' + MB.data(R.mes.fimMes) + "</dt><dd></dd></div>";
    $("depois").innerHTML = linhas + item("Saldo total depois de receber", d.saldoTotal, "Conta + caixinha + o que está agendado", "total");
  }

  /* Vale + ajuda: sugere o do mês atual se ainda não foi lançado, senão o do próximo. */
  function mesDoBeneficio(R) {
    var meses = [R.inicio.slice(0, 7), Projecao.somarDias(R.mes.fimMes, 1).slice(0, 7)];
    for (var i = 0; i < meses.length; i++) {
      var ja = dados.lancamentos.some(function (l) { return l.tipo === "entrada" && l.categoria === "Vale e benefícios" && String(l.data).slice(0, 7) === meses[i]; });
      if (!ja) return meses[i];
    }
    return null;
  }

  function desenharBeneficio(R) {
    var porDia = dados.config.ganhos_dia.reduce(function (t, g) { return t + (Number(g.valor) || 0); }, 0);
    if (!porDia) {
      $("beneficio-mes").textContent = "";
      $("beneficio").innerHTML = '<p class="suave" style="margin:0">Sem vale ou ajuda por dia cadastrados. <a class="link" href="/painel/ajustes/">Cadastrar nos ajustes</a></p>';
      return;
    }
    var mes = mesDoBeneficio(R);
    if (!mes) {
      $("beneficio-mes").textContent = "";
      $("beneficio").innerHTML = '<p class="suave" style="margin:0">Vale deste mês e do próximo já lançados em Recebimentos.</p>';
      return;
    }
    var b = Projecao.beneficio(mes + "-01", dados.config, dados.dias);
    $("beneficio-mes").textContent = MB.mesExtenso(mes);
    $("beneficio").innerHTML =
      '<p class="beneficio-conta" style="margin:0">' + b.itens.map(function (g) { return MB.esc(g.nome) + " " + MB.dinheiro(g.valor); }).join(" + ") + " = " + MB.dinheiro(b.porDia) + " por dia trabalhado</p>" +
      '<div class="linha-campos">' +
        '<div class="grupo"><label for="beneficio-dias">Dias trabalhados</label><input class="campo num" id="beneficio-dias" type="number" min="0" max="31" value="' + b.dias + '"></div>' +
        '<div class="grupo"><label for="beneficio-data">Cai na conta em</label><input class="campo" id="beneficio-data" type="date" value="' + b.data + '"></div>' +
      "</div>" +
      '<div class="resumo-conta"><span>Total <b id="beneficio-total">' + MB.dinheiro(b.porDia * b.dias) + "</b></span></div>" +
      '<button class="botao pequeno" type="button" data-lancar><span>' + MB.icone("mais") + "</span> Lançar em Recebimentos</button>";
    $("beneficio-dias").addEventListener("input", function () {
      $("beneficio-total").textContent = MB.dinheiro(b.porDia * (Number($("beneficio-dias").value) || 0));
    });
    $("beneficio").dataset.porDia = b.porDia;
  }

  function lancarBeneficio() {
    var dias = Number($("beneficio-dias").value) || 0;
    var porDia = Number($("beneficio").dataset.porDia) || 0;
    if (!dias) return MB.aviso("Informe quantos dias.", true);
    var nomes = dados.config.ganhos_dia.map(function (g) { return g.nome; }).join(" + ");
    sb.from("fin_lancamentos").insert({
      tipo: "entrada",
      data: $("beneficio-data").value || MB.hoje(),
      descricao: nomes || "Vale e ajuda de custo",
      categoria: "Vale e benefícios",
      valor: Math.round(porDia * dias * 100) / 100,
      observacao: dias + " dias × " + MB.dinheiro(porDia)
    }).then(function (r) {
      if (r.error) throw r.error;
      MB.aviso("Lançado em Recebimentos.");
      return carregar();
    }).catch(MB.erro);
  }

  function desenharPremissas(R) {
    var cfg = dados.config;
    var s = dados.saldo;
    var nomesDias = cfg.dias_semana.slice().sort().map(function (d) { return Projecao.NOMES_DIA[d].toLowerCase(); });
    var folgas = dados.dias.filter(function (d) { return d.trabalha === false && d.data >= R.inicio && d.data <= R.mes.fimMes; })
      .sort(function (a, b) { return a.data < b.data ? -1 : 1; })
      .map(function (d) { return MB.diaMes(d.data) + (d.motivo ? " (" + d.motivo + ")" : ""); });
    var itens = cfg.custos_dia.map(function (i) { return MB.esc(i.nome) + " " + MB.dinheiro(i.valor); }).join(" + ");
    var temMarmita = cfg.custos_dia.some(function (i) { return i.marmita; });
    var entradas = dados.lancamentos.filter(function (l) { return l.tipo === "entrada" && l.data >= R.inicio && l.data <= R.mes.fimMes; });

    var lista = [
      s.vazio
        ? "Sem saldo informado: a projeção começa de <b>R$ 0,00</b> hoje."
        : "O saldo de <b>" + MB.dinheiro(s.conta) + "</b> já inclui tudo até <b>" + MB.data(s.data) + "</b>. A projeção conta de " + MB.data(R.inicio) + " em diante.",
      "Você trabalha <b>" + (nomesDias.join(", ") || "nenhum dia") + "</b>: são <b>" + R.mes.diasTrabalhados + " dias</b> de " + MB.diaMes(R.inicio) + " até o fim do mês" + (folgas.length ? ", sem " + MB.esc(folgas.join(", ")) : "") + ".",
      itens
        ? "Por dia trabalhado: " + itens + " = <b>" + MB.dinheiro(R.custo.pedindo) + "</b>" + (temMarmita ? " (" + MB.dinheiro(R.custo.levando) + " levando marmita; marque no Dia a dia)." : ".")
        : "Nenhum gasto por dia trabalhado cadastrado.",
      entradas.length
        ? "Até o fim do mês entram <b>" + entradas.length + "</b> recebimentos, somando " + MB.dinheiro(R.mes.entra) + "."
        : "Nenhum recebimento lançado até o fim do mês.",
      "Gastos fixos (aluguel, contas, cartão) só entram na conta se estiverem lançados em <a class=\"link\" href=\"/painel/gastos/\">Gastos</a>."
    ];
    $("premissas").innerHTML = lista.map(function (t) { return "<li>" + t + "</li>"; }).join("");
  }
})();
