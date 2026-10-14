/* =====================================================================
   Página principal: ano no rodapé e, se já houver sessão, os botões
   "Entrar" viram "Abrir painel".
   ===================================================================== */
(function () {
  "use strict";

  document.getElementById("ano").textContent = new Date().getFullYear();
  if (!MB.supabase) return;

  MB.supabase.auth.getSession().then(function (r) {
    if (!(r.data && r.data.session)) return;
    document.querySelectorAll("[data-acesso]").forEach(function (a) {
      a.href = "/painel/";
      var seta = a.querySelector("svg");
      a.textContent = a.closest(".entrar-topo") ? "Abrir painel" : "Abrir meu painel ";
      if (seta) a.appendChild(seta);
    });
    document.querySelectorAll("[data-cadastro]").forEach(function (a) { a.hidden = true; });
  }).catch(function () {});
})();
