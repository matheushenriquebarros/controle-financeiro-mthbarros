/* =====================================================================
   Tela de entrada: login, cadastro, "esqueci a senha" e o aviso de
   "aguardando aprovação" para contas novas.
   ===================================================================== */
(function () {
  "use strict";

  var sb = MB.supabase;
  var $ = function (id) { return document.getElementById(id); };

  $("ano").textContent = new Date().getFullYear();

  if (!sb) {
    $("aviso-config").hidden = false;
    document.querySelectorAll("form button[type=submit]").forEach(function (b) { b.disabled = true; });
    return;
  }

  /* ---------- Abas ---------- */
  function abrirAba(qual) {
    var entrar = qual === "entrar";
    $("aba-entrar").setAttribute("aria-selected", entrar);
    $("aba-cadastro").setAttribute("aria-selected", !entrar);
    $("form-entrar").hidden = !entrar;
    $("form-cadastro").hidden = entrar;
    (entrar ? $("entrar-email") : $("cadastro-nome")).focus();
  }
  $("aba-entrar").addEventListener("click", function () { abrirAba("entrar"); });
  $("aba-cadastro").addEventListener("click", function () { abrirAba("cadastro"); });

  /* ---------- Estados (mensagem no lugar do formulário) ---------- */
  function mostrarEstado(titulo, texto, opcoes) {
    opcoes = opcoes || {};
    $("painel-formularios").hidden = true;
    $("estado").hidden = false;
    $("estado-titulo").textContent = titulo;
    $("estado-texto").textContent = texto;
    $("estado-voltar").textContent = opcoes.sair ? "Sair desta conta" : "Voltar";
    $("estado-voltar").onclick = function () {
      if (opcoes.sair) return MB.sair();
      $("estado").hidden = true;
      $("painel-formularios").hidden = false;
    };
  }

  function mostrarAguardando() {
    mostrarEstado(
      "Aguardando aprovação",
      "Sua conta foi criada. Assim que um administrador liberar o acesso, é só entrar de novo.",
      { sair: true }
    );
  }

  /* Com sessão: aprovado vai pro painel; senão, mostra o aviso. */
  function seguir(sessao) {
    return sb.from("fin_perfis").select("aprovado").eq("id", sessao.user.id).maybeSingle().then(function (r) {
      if (r.error) throw r.error;
      if (r.data && r.data.aprovado) location.href = "/painel/";
      else mostrarAguardando();
    });
  }

  function ocupado(form, sim) {
    var b = form.querySelector("button[type=submit]");
    b.disabled = sim;
    b.style.opacity = sim ? ".6" : "";
  }

  /* ---------- Login ---------- */
  $("form-entrar").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var form = ev.currentTarget;
    var email = $("entrar-email").value.trim();
    var senha = $("entrar-senha").value;
    if (!email || !senha) return MB.aviso("Preencha e-mail e senha.", true);

    ocupado(form, true);
    sb.auth.signInWithPassword({ email: email, password: senha })
      .then(function (r) {
        if (r.error) throw r.error;
        return seguir(r.data.session);
      })
      .catch(MB.erro)
      .then(function () { ocupado(form, false); });
  });

  /* ---------- Cadastro ---------- */
  $("form-cadastro").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var form = ev.currentTarget;
    var nome = $("cadastro-nome").value.trim();
    var email = $("cadastro-email").value.trim();
    var senha = $("cadastro-senha").value;
    if (!nome || !email) return MB.aviso("Preencha nome e e-mail.", true);
    if (senha.length < 8) return MB.aviso("A senha precisa ter pelo menos 8 caracteres.", true);

    ocupado(form, true);
    sb.auth.signUp({
      email: email,
      password: senha,
      options: { data: { nome: nome }, emailRedirectTo: location.origin + "/entrar/" }
    })
      .then(function (r) {
        if (r.error) throw r.error;
        if (r.data.session) return seguir(r.data.session);
        mostrarEstado(
          "Confirme seu e-mail",
          "Enviamos um link para " + email + ". Depois de confirmar, um administrador libera o seu acesso."
        );
      })
      .catch(MB.erro)
      .then(function () { ocupado(form, false); });
  });

  /* ---------- Esqueci a senha ---------- */
  $("esqueci-senha").addEventListener("click", function () {
    var email = $("entrar-email").value.trim();
    if (!email) {
      $("entrar-email").focus();
      return MB.aviso("Digite seu e-mail no campo acima.", true);
    }
    sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + "/redefinir-senha/" })
      .then(function (r) {
        if (r.error) throw r.error;
        mostrarEstado("Confira seu e-mail", "Se existir uma conta para " + email + ", chega um link para criar uma senha nova.");
      })
      .catch(MB.erro);
  });

  /* ---------- Ao abrir a página ---------- */
  sb.auth.getSession().then(function (r) {
    var sessao = r.data && r.data.session;
    if (sessao) return seguir(sessao);
    if (MB.parametro("aguardando")) abrirAba("entrar");
    else if (MB.parametro("aba") === "cadastro") abrirAba("cadastro");
  }).catch(MB.erro);
})();
