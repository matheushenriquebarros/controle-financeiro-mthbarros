/* =====================================================================
   Marca do controle. O mesmo site atende dois endereços e muda só a cara:
     controle.mthbarros.com.br         → MB (Matheus Henrique Barros)
     controle.agenciafellowship.com.br → Fellow Ship
   Banco, login e dados são os mesmos. Carregado no <head>, antes dos
   CSS, para já aplicar marca e tema sem piscar. Para testar a outra
   marca em qualquer endereço: ?marca=fellowship (ou ?marca=mb).
   ===================================================================== */
(function () {
  "use strict";

  var marcas = {
    mb: {
      id: "mb",
      nome: "Matheus Henrique Barros",
      painel: "Controle MB",
      site: "https://mthbarros.com.br",
      dominio: "controle.mthbarros.com.br",
      temaPadrao: "dark",
      corBarra: { dark: "#1c1917", light: "#f8f6f3" },
      fontes: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=DM+Sans:wght@400;500&family=JetBrains+Mono:wght@400;500&display=swap"
    },
    fellowship: {
      id: "fellowship",
      nome: "Fellow Ship",
      painel: "Controle Fellow Ship",
      site: "https://agenciafellowship.com.br",
      dominio: "controle.agenciafellowship.com.br",
      temaPadrao: "light",
      corBarra: { dark: "#101b37", light: "#f5f6f9" },
      fontes: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..700&family=Inter:wght@400;500;600;700&display=swap",
      favicon: "/img/fellowship-favicon.png",
      appleIcon: "/img/fellowship-apple-touch-icon.png"
    }
  };

  function escolher() {
    var pedido = null;
    try {
      pedido = new URLSearchParams(location.search).get("marca");
      if (pedido && marcas[pedido]) sessionStorage.setItem("mb-marca", pedido);
      else pedido = sessionStorage.getItem("mb-marca");
    } catch (e) {}
    if (pedido && marcas[pedido]) return marcas[pedido];
    return /agenciafellowship/i.test(location.hostname) ? marcas.fellowship : marcas.mb;
  }

  var marca = (window.MB_MARCA = escolher());
  var raiz = document.documentElement;
  raiz.setAttribute("data-marca", marca.id);

  /* Tema salvo (por endereço) ou o padrão da marca. */
  var tema = null;
  try { tema = localStorage.getItem("mb-tema"); } catch (e) {}
  if (tema !== "light" && tema !== "dark") tema = marca.temaPadrao;
  if (tema === "light") raiz.setAttribute("data-theme", "light");

  marca.corDaBarra = function (t) { return marca.corBarra[t] || marca.corBarra.dark; };
  var barra = document.querySelector('meta[name="theme-color"]');
  if (barra) barra.setAttribute("content", marca.corDaBarra(tema));

  var fontes = document.createElement("link");
  fontes.rel = "stylesheet";
  fontes.href = marca.fontes;
  document.head.appendChild(fontes);

  /* Logo: MB usa a imagem; Fellow Ship usa o navio como máscara, que
     pega a cor do texto e funciona nos dois temas. */
  marca.logo = function (tipo, alt) {
    if (marca.id === "fellowship") {
      return '<span class="logo-fs ' + (tipo === "horizontal" ? "horizontal" : "navio") + '" role="img" aria-label="' + (alt || marca.nome) + '"></span>';
    }
    return '<img src="/img/marca/logo-mb.webp" alt="' + (alt || "Logo MB de Matheus Henrique Barros") + '" width="40" height="40">';
  };

  document.addEventListener("DOMContentLoaded", function () {
    if (marca.id === "mb") return;

    document.title = document.title.replace(marcas.mb.painel, marca.painel);

    document.querySelectorAll('link[rel~="icon"]').forEach(function (l) { l.remove(); });
    var icone = document.createElement("link");
    icone.rel = "icon";
    icone.type = "image/png";
    icone.href = marca.favicon;
    document.head.appendChild(icone);
    var apple = document.querySelector('link[rel="apple-touch-icon"]');
    if (apple) apple.href = marca.appleIcon;

    document.querySelectorAll("[data-marca-logo]").forEach(function (el) {
      el.outerHTML = marca.logo(el.getAttribute("data-marca-logo"));
    });
    document.querySelectorAll("[data-marca-nome]").forEach(function (el) { el.textContent = marca.nome; });
    document.querySelectorAll("[data-marca-dominio]").forEach(function (el) { el.textContent = marca.dominio; });
    document.querySelectorAll("[data-marca-site]").forEach(function (el) { el.href = marca.site; });
  });
})();
