/* =====================================================================
   Gráfico do saldo da conta, dia a dia (SVG, sem biblioteca).
   Uma série só: linha de 2px na cor da marca, área suave até o zero,
   pontos verdes nos dias em que entra dinheiro e o menor saldo marcado.
   Passar o mouse (ou o dedo) mostra a mira e o resumo do dia; com o
   gráfico focado, as setas andam de dia em dia.
   ===================================================================== */
(function () {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";

  function passoBonito(bruto) {
    var p = Math.pow(10, Math.floor(Math.log10(bruto || 1)));
    var n = bruto / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }

  function moedaCurta(v) {
    var a = Math.abs(v);
    var s = a >= 1000 ? (a / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mil" : Math.round(a).toLocaleString("pt-BR");
    return (v < 0 ? "−" : "") + "R$ " + s;
  }

  /*
    pontos = [{ data, saldo, entra, sai, inicial? }]
  */
  MB.graficoSaldo = function (alvo, pontos) {
    var estado = { indice: null };

    function desenhar() {
      alvo.innerHTML = "";
      if (!pontos.length) return;
      var largura = Math.max(alvo.clientWidth - parseFloat(getComputedStyle(alvo).paddingLeft) - parseFloat(getComputedStyle(alvo).paddingRight), 260);
      var altura = alvo.clientWidth < 600 ? 192 : 240;
      var m = { cima: 12, direita: 12, baixo: 26, esquerda: 64 };
      if (largura < 480) m.esquerda = 54;
      var w = largura - m.esquerda - m.direita;
      var h = altura - m.cima - m.baixo;

      var valores = pontos.map(function (p) { return p.saldo; });
      var min = Math.min(0, Math.min.apply(null, valores));
      var max = Math.max(0, Math.max.apply(null, valores));
      if (max === min) max = min + 100;
      var passo = passoBonito((max - min) / 4);
      min = Math.floor(min / passo) * passo;
      max = Math.ceil(max / passo) * passo;

      var x = function (i) { return m.esquerda + (pontos.length === 1 ? w / 2 : (i / (pontos.length - 1)) * w); };
      var y = function (v) { return m.cima + (1 - (v - min) / (max - min)) * h; };

      var svg = document.createElementNS(NS, "svg");
      svg.setAttribute("viewBox", "0 0 " + largura + " " + altura);
      svg.setAttribute("tabindex", "0");
      svg.setAttribute("aria-label", "Saldo projetado; use as setas para ver cada dia");
      svg.style.height = altura + "px";

      var html = '<g class="grade">';
      for (var v = min; v <= max + passo / 2; v += passo) {
        html += '<line x1="' + m.esquerda + '" x2="' + (m.esquerda + w) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>' +
          '<text x="' + (m.esquerda - 8) + '" y="' + (y(v) + 3) + '" text-anchor="end">' + moedaCurta(v) + "</text>";
      }
      html += "</g>";
      if (min < 0) html += '<line class="zero" x1="' + m.esquerda + '" x2="' + (m.esquerda + w) + '" y1="' + y(0) + '" y2="' + y(0) + '"/>';

      // Eixo X: dia do mês, espaçado para não encostar.
      var cada = Math.max(1, Math.ceil(pontos.length / Math.floor(w / 42)));
      html += '<g class="eixo-x">';
      pontos.forEach(function (p, i) {
        if (i % cada && i !== pontos.length - 1) return;
        if (i !== pontos.length - 1 && pontos.length - 1 - i < cada / 2) return;
        html += '<text x="' + x(i) + '" y="' + (altura - 6) + '" text-anchor="middle">' + MB.diaMes(p.data) + "</text>";
      });
      html += "</g>";

      var caminho = pontos.map(function (p, i) { return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p.saldo).toFixed(1); }).join(" ");
      html += '<path class="area" d="' + caminho + " L" + x(pontos.length - 1).toFixed(1) + " " + y(0) + " L" + x(0).toFixed(1) + " " + y(0) + ' Z"/>';
      html += '<path class="linha-saldo" d="' + caminho + '"/>';

      var menor = 0;
      pontos.forEach(function (p, i) {
        if (p.saldo < pontos[menor].saldo) menor = i;
        if (p.entra > 0) html += '<circle class="ponto-entrada" r="4.5" cx="' + x(i) + '" cy="' + y(p.saldo) + '"/>';
      });
      html += '<circle class="ponto-minimo" r="5" cx="' + x(menor) + '" cy="' + y(pontos[menor].saldo) + '"/>';
      html += '<g class="camada-mira" hidden><line class="mira" y1="' + m.cima + '" y2="' + (m.cima + h) + '"/><circle class="ponto-mira" r="5"/></g>';
      html += '<rect x="' + m.esquerda + '" y="0" width="' + w + '" height="' + altura + '" fill="transparent" data-alvo/>';
      svg.innerHTML = html;
      alvo.appendChild(svg);

      var dica = document.createElement("div");
      dica.className = "grafico-dica";
      dica.hidden = true;
      alvo.appendChild(dica);

      var camada = svg.querySelector(".camada-mira");
      function mostrar(i) {
        if (i == null) { camada.setAttribute("hidden", ""); dica.hidden = true; estado.indice = null; return; }
        i = Math.max(0, Math.min(pontos.length - 1, i));
        estado.indice = i;
        var p = pontos[i];
        var px = x(i), py = y(p.saldo);
        camada.removeAttribute("hidden");
        camada.querySelector("line").setAttribute("x1", px);
        camada.querySelector("line").setAttribute("x2", px);
        camada.querySelector("circle").setAttribute("cx", px);
        camada.querySelector("circle").setAttribute("cy", py);
        var dia = Projecao.NOMES_DIA[Projecao.diaSemana(p.data)];
        dica.innerHTML = "<strong>" + dia + " · " + MB.data(p.data) + (p.inicial ? " · saldo informado" : "") + "</strong>" +
          "<div><span>Saldo</span><b class=\"" + (p.saldo < 0 ? "negativo" : "") + "\">" + MB.dinheiro(p.saldo) + "</b></div>" +
          (p.inicial ? "" :
            "<div><span>Entra</span><b>" + MB.dinheiro(p.entra) + "</b></div>" +
            "<div><span>Sai</span><b>" + MB.dinheiro(p.sai) + "</b></div>");
        dica.hidden = false;
        var escala = svg.getBoundingClientRect().width / largura;
        var esquerda = svg.offsetLeft + px * escala;
        var meia = dica.offsetWidth / 2;
        esquerda = Math.max(meia, Math.min(alvo.clientWidth - meia, esquerda));
        dica.style.left = esquerda + "px";
        dica.style.top = (svg.offsetTop + py * escala) + "px";
      }

      function pelaPosicao(ev) {
        var r = svg.getBoundingClientRect();
        var cx = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
        var vx = cx * (largura / r.width);
        mostrar(Math.round(((vx - m.esquerda) / w) * (pontos.length - 1)));
      }
      var area = svg.querySelector("[data-alvo]");
      area.addEventListener("mousemove", pelaPosicao);
      area.addEventListener("touchstart", pelaPosicao, { passive: true });
      area.addEventListener("touchmove", pelaPosicao, { passive: true });
      svg.addEventListener("mouseleave", function () { mostrar(null); });
      svg.addEventListener("blur", function () { mostrar(null); });
      svg.addEventListener("keydown", function (ev) {
        if (ev.key !== "ArrowRight" && ev.key !== "ArrowLeft") return;
        ev.preventDefault();
        var atual = estado.indice == null ? (ev.key === "ArrowRight" ? -1 : pontos.length) : estado.indice;
        mostrar(atual + (ev.key === "ArrowRight" ? 1 : -1));
      });
    }

    desenhar();
    var largAnterior = alvo.clientWidth;
    window.addEventListener("resize", function () {
      if (alvo.clientWidth === largAnterior) return;
      largAnterior = alvo.clientWidth;
      desenhar();
    });
  };
})();
