/* =====================================================================
   Acessos (só admin): aprovar contas novas, liberar a aba Clientes,
   dar/tirar admin e remover.
   Remover aqui apaga o perfil: a pessoa fica bloqueada. A conta de login
   continua no Supabase (Authentication → Users); para ela voltar, apague
   a conta lá e peça um cadastro novo.
   ===================================================================== */
(function () {
  "use strict";

  var sb = MB.supabase;
  var $ = function (id) { return document.getElementById(id); };
  var perfis = [];
  var eu = null;

  MB.exigirAcesso({ pagina: "usuarios", admin: true }).then(function (acesso) {
    eu = acesso.perfil;
    $("lista-usuarios").addEventListener("change", aoMudar);
    $("lista-usuarios").addEventListener("click", aoClicar);
    return carregar();
  }).catch(MB.erro);

  function carregar() {
    return sb.from("fin_perfis").select("*").order("aprovado").order("criado_em").then(function (r) {
      if (r.error) throw r.error;
      perfis = r.data || [];
      desenhar();
    });
  }

  function desenhar() {
    $("lista-usuarios").innerHTML = perfis.map(function (p) {
      var souEu = p.id === eu.id;
      return '<div class="usuario-linha" data-id="' + p.id + '">' +
        '<div class="quem"><strong>' + MB.esc(p.nome) + (souEu ? '<span class="marcador">Você</span>' : "") +
          (!p.aprovado ? '<span class="marcador">Aguardando</span>' : "") + "</strong>" +
          "<small>" + MB.esc(p.email) + " · desde " + MB.data(p.criado_em) + "</small></div>" +
        '<label class="chave"><input type="checkbox" data-campo="aprovado"' + (p.aprovado ? " checked" : "") + (souEu ? " disabled" : "") + '><i></i><span class="suave">Aprovado</span></label>' +
        '<label class="chave" title="' + (p.admin ? "Admin já vê a aba Clientes" : "Pode ver e cadastrar clientes e contratos") + '"><input type="checkbox" data-campo="clientes"' + (p.admin || p.clientes ? " checked" : "") + (p.admin ? " disabled" : "") + '><i></i><span class="suave">Clientes</span></label>' +
        '<label class="chave"><input type="checkbox" data-campo="admin"' + (p.admin ? " checked" : "") + (souEu ? " disabled" : "") + '><i></i><span class="suave">Admin</span></label>' +
        (souEu ? "" : '<button class="botao-icone perigo" type="button" data-remover title="Remover acesso" aria-label="Remover ' + MB.esc(p.nome) + '">' + MB.icone("lixeira") + "</button>") +
      "</div>";
    }).join("");
  }

  function acharPerfil(el) {
    var linha = el.closest("[data-id]");
    return linha && perfis.filter(function (p) { return p.id === linha.getAttribute("data-id"); })[0];
  }

  function aoMudar(ev) {
    var campo = ev.target.getAttribute("data-campo");
    var p = acharPerfil(ev.target);
    if (!campo || !p) return;
    var dados = {};
    dados[campo] = ev.target.checked;
    sb.from("fin_perfis").update(dados).eq("id", p.id).then(function (r) {
      if (r.error) throw r.error;
      p[campo] = ev.target.checked;
      desenhar();
      var mensagens = {
        aprovado: p.aprovado ? "acesso liberado." : "acesso bloqueado.",
        clientes: p.clientes ? "agora vê a aba Clientes." : "não vê mais a aba Clientes.",
        admin: p.admin ? "agora é admin." : "não é mais admin."
      };
      MB.aviso(p.nome + ": " + mensagens[campo]);
    }).catch(function (e) {
      ev.target.checked = !ev.target.checked;
      MB.erro(e);
    });
  }

  function aoClicar(ev) {
    if (!ev.target.closest("[data-remover]")) return;
    var p = acharPerfil(ev.target);
    MB.confirmar("Remover " + p.nome + "?", "A pessoa perde o acesso ao controle. Os dados dela continuam guardados no banco.", "Remover").then(function (sim) {
      if (!sim) return;
      return sb.from("fin_perfis").delete().eq("id", p.id).then(function (r) {
        if (r.error) throw r.error;
        perfis = perfis.filter(function (x) { return x.id !== p.id; });
        desenhar();
        MB.aviso("Acesso removido.");
      });
    }).catch(MB.erro);
  }
})();
