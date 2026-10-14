/* =====================================================================
   Base do controle: conexão com o Supabase, controle de acesso, topo,
   formatação de dinheiro, avisos e a leitura dos dados que quase toda
   página usa (ajustes, saldo, dias e lançamentos). Expõe tudo em
   window.MB.
   ===================================================================== */
(function () {
  "use strict";

  var config = window.MB_CONFIG || {};
  var configurado = config.supabaseUrl && config.supabaseUrl.indexOf("SEU-PROJETO") === -1;
  var MB = (window.MB = {});

  MB.supabase = configurado && window.supabase
    ? window.supabase.createClient(config.supabaseUrl, config.supabaseChave)
    : null;

  /* ---------- Texto e números ---------- */
  var moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  var decimal = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  MB.esc = function (texto) {
    return String(texto == null ? "" : texto)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  };

  MB.dinheiro = function (n) { return moeda.format(Number(n) || 0); };
  MB.decimal = function (n) { return decimal.format(Number(n) || 0); };

  /* Aceita "1.234,56", "1234,56", "1234.56" e "R$ 1.234". */
  MB.lerNumero = function (texto) {
    var s = String(texto == null ? "" : texto).replace(/[^\d,.\-]/g, "");
    if (s.indexOf(",") > -1) s = s.replace(/\./g, "").replace(",", ".");
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  };

  MB.data = function (iso) {
    if (!iso) return "";
    var p = String(iso).slice(0, 10).split("-");
    return p[2] + "/" + p[1] + "/" + p[0];
  };

  /* "2026-10-07" → "07/10" */
  MB.diaMes = function (iso) {
    if (!iso) return "";
    var p = String(iso).slice(0, 10).split("-");
    return p[2] + "/" + p[1];
  };

  MB.hoje = function () {
    var d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  };

  /* "2026-10" → "outubro de 2026" */
  MB.mesExtenso = function (iso) {
    if (!iso) return "";
    var p = String(iso).slice(0, 7).split("-").map(Number);
    return new Date(p[0], p[1] - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  };

  /* Soma meses a "AAAA-MM-DD" e devolve "AAAA-MM-DD" (sem fuso). */
  MB.somarMeses = function (iso, meses) {
    var p = String(iso).slice(0, 10).split("-").map(Number);
    var d = new Date(p[0], p[1] - 1 + meses, p[2]);
    if (d.getDate() !== p[2]) d.setDate(0); // 31/01 + 1 mês → 28/02
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  };

  MB.parametro = function (nome) {
    return new URLSearchParams(location.search).get(nome);
  };

  /* Campos de dinheiro: formatam ao sair do campo. */
  MB.campoDinheiro = function (campo, aoMudar) {
    campo.addEventListener("input", function () { if (aoMudar) aoMudar(); });
    campo.addEventListener("blur", function () {
      if (campo.value.trim() === "") return;
      campo.value = MB.decimal(MB.lerNumero(campo.value));
      if (aoMudar) aoMudar();
    });
  };

  /* ---------- Avisos ---------- */
  MB.aviso = function (texto, erro) {
    document.querySelectorAll(".toast").forEach(function (t) { t.remove(); });
    var el = document.createElement("div");
    el.className = "toast" + (erro ? " erro" : "");
    el.setAttribute("role", erro ? "alert" : "status");
    el.textContent = texto;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 3600);
  };

  MB.erro = function (e) {
    console.error(e);
    var msg = (e && e.message) || "Algo deu errado. Tente de novo.";
    MB.aviso(traduzirErro(msg), true);
  };

  function traduzirErro(msg) {
    var mapa = {
      "Invalid login credentials": "E-mail ou senha incorretos.",
      "Email not confirmed": "Confirme seu e-mail antes de entrar (veja a caixa de entrada).",
      "User already registered": "Este e-mail já tem conta. Use \"Entrar\".",
      "Password should be at least 6 characters": "A senha precisa ter pelo menos 6 caracteres.",
      "Failed to fetch": "Sem conexão com o servidor. Verifique a internet."
    };
    for (var k in mapa) if (msg.indexOf(k) > -1) return mapa[k];
    if (/row-level security/i.test(msg)) return "Sem permissão para isso. Seu acesso foi aprovado?";
    if (/fin_\w+.*(does not exist|Could not find)|Could not find the table 'public\.fin_/i.test(msg)) return "Banco não preparado: rode database/schema.sql no Supabase.";
    return msg;
  }
  MB.traduzirErro = traduzirErro;

  /* ---------- Ícones (mesma família do site: Lucide) ---------- */
  var tracos = {
    resumo: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="m19 9-5 5-4-4-3 3"/>',
    diario: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/>',
    recebimentos: '<path d="M12 17V3M6 11l6 6 6-6"/><path d="M19 21H5"/>',
    gastos: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    ajustes: '<path d="M20 7h-9M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
    usuarios: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    editar: '<path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    repetir: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
    voltar: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    sair: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    menu: '<path d="M4 5h16M4 12h16M4 19h16"/>',
    fechar: '<path d="M18 6 6 18M6 6l12 12"/>',
    lixeira: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    mais: '<path d="M12 5v14M5 12h14"/>',
    seta: '<path d="M5 12h14M12 5l7 7-7 7"/>',
    anterior: '<path d="m15 18-6-6 6-6"/>',
    proximo: '<path d="m9 18 6-6-6-6"/>',
    baixar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    ok: '<path d="M20 6 9 17l-5-5"/>',
    carteira: '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>',
    marmita: '<path d="M3 11h18v6a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/><path d="M5 11V9a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2M12 4v3"/>',
    sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2m-7.07-2.93 1.41-1.41M17.66 6.34l1.41-1.41M2 12h2m16 0h2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41"/>',
    lua: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    alerta: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>'
  };
  MB.icone = function (nome) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (tracos[nome] || "") + "</svg>";
  };

  /* ---------- Tema claro/escuro ---------- */
  MB.temaAtual = function () {
    return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  };

  MB.botaoTema = function () {
    var claro = MB.temaAtual() === "light";
    return '<button class="botao-icone" type="button" data-tema aria-label="' + (claro ? "Usar tema escuro" : "Usar tema claro") + '" title="' + (claro ? "Tema escuro" : "Tema claro") + '">' + MB.icone(claro ? "lua" : "sol") + "</button>";
  };

  document.addEventListener("click", function (ev) {
    var botao = ev.target.closest("[data-tema]");
    if (!botao) return;
    var novo = MB.temaAtual() === "light" ? "dark" : "light";
    if (novo === "light") document.documentElement.setAttribute("data-theme", "light");
    else document.documentElement.removeAttribute("data-theme");
    try { localStorage.setItem("mb-tema", novo); } catch (e) {}
    var cor = document.querySelector('meta[name="theme-color"]');
    if (cor && window.MB_MARCA) cor.setAttribute("content", MB_MARCA.corDaBarra(novo));
    botao.outerHTML = MB.botaoTema();
    document.dispatchEvent(new CustomEvent("mb-tema"));
  });

  document.querySelectorAll("[data-icone]").forEach(function (el) {
    el.outerHTML = MB.icone(el.getAttribute("data-icone"));
  });
  document.querySelectorAll("[data-lugar-tema]").forEach(function (el) {
    el.outerHTML = MB.botaoTema();
  });

  /* ---------- Acesso ---------- */
  MB.sair = function () {
    var fim = function () { location.href = "/entrar/"; };
    if (!MB.supabase) return fim();
    MB.supabase.auth.signOut().then(fim, fim);
  };

  /*
    Usado no topo de toda página interna. Sem sessão → volta pro login.
    Sem aprovação → login mostra "aguardando". Página só de admin → resumo.
  */
  MB.exigirAcesso = function (opcoes) {
    opcoes = opcoes || {};
    if (!MB.supabase) {
      location.href = "/entrar/";
      return new Promise(function () {});
    }
    return MB.supabase.auth.getSession().then(function (r) {
      var sessao = r.data && r.data.session;
      if (!sessao) {
        location.href = "/entrar/";
        return new Promise(function () {});
      }
      return MB.supabase.from("fin_perfis").select("*").eq("id", sessao.user.id).maybeSingle().then(function (p) {
        if (p.error) throw p.error;
        var perfil = p.data;
        if (!perfil || !perfil.aprovado) {
          location.href = "/entrar/?aguardando=1";
          return new Promise(function () {});
        }
        if (opcoes.admin && !perfil.admin) {
          location.href = "/painel/";
          return new Promise(function () {});
        }
        MB.perfil = perfil;
        MB.usuario = sessao.user;
        montarTopo(perfil, opcoes.pagina);
        document.body.classList.add("pronto");
        return { usuario: sessao.user, perfil: perfil };
      });
    });
  };

  function montarTopo(perfil, pagina) {
    var alvo = document.getElementById("topo");
    if (!alvo) return;

    var links = [
      { id: "resumo", rotulo: "Resumo", href: "/painel/" },
      { id: "diario", rotulo: "Dia a dia", href: "/painel/diario/" },
      { id: "recebimentos", rotulo: "Recebimentos", href: "/painel/recebimentos/" },
      { id: "gastos", rotulo: "Gastos", href: "/painel/gastos/" },
      { id: "ajustes", rotulo: "Ajustes", href: "/painel/ajustes/" }
    ];
    if (perfil.admin) links.push({ id: "usuarios", rotulo: "Acessos", href: "/painel/usuarios/" });

    var itens = links.map(function (l) {
      var ativo = l.id === pagina;
      return '<li><a class="topo-link' + (ativo ? " ativo" : "") + '" href="' + l.href + '"' + (ativo ? ' aria-current="page"' : "") + ">" +
        MB.icone(l.id) + "<span>" + l.rotulo + "</span></a></li>";
    }).join("");

    alvo.innerHTML =
      '<nav class="topo-nav" aria-label="Navegação do controle">' +
        '<a class="marca" href="/painel/">' +
          (window.MB_MARCA ? MB_MARCA.logo("navio", "Logo MB") : "") +
          '<span><strong>Controle</strong><small>Financeiro</small></span>' +
        "</a>" +
        '<ul class="topo-links" id="menu-painel">' + itens + "</ul>" +
        '<div class="topo-conta">' +
          MB.botaoTema() +
          '<span class="topo-usuario" title="' + MB.esc(perfil.email) + '">' + MB.esc(perfil.nome) + "</span>" +
          '<button class="botao contorno pequeno" type="button" data-sair>' + MB.icone("sair") + "<span>Sair</span></button>" +
          '<button class="botao-icone topo-menu" type="button" aria-label="Abrir menu" aria-expanded="false" aria-controls="menu-painel" data-menu>' + MB.icone("menu") + "</button>" +
        "</div>" +
      "</nav>";

    alvo.querySelector("[data-sair]").addEventListener("click", MB.sair);
    var botaoMenu = alvo.querySelector("[data-menu]");
    botaoMenu.addEventListener("click", function () {
      var aberto = document.body.classList.toggle("menu-aberto");
      botaoMenu.setAttribute("aria-expanded", aberto ? "true" : "false");
      botaoMenu.innerHTML = MB.icone(aberto ? "fechar" : "menu");
    });
  }

  /* ---------- Dados da pessoa logada ---------- */
  /*
    Lê ajustes, último saldo, exceções de dias e lançamentos. Sem saldo
    informado ainda, usa R$ 0 em "ontem" (a projeção começa hoje).
  */
  MB.carregarDados = function () {
    var sb = MB.supabase;
    return Promise.all([
      sb.from("fin_config").select("*").maybeSingle(),
      sb.from("fin_saldos").select("*").order("data", { ascending: false }).order("id", { ascending: false }).limit(1),
      sb.from("fin_dias").select("*"),
      sb.from("fin_lancamentos").select("*").order("data").order("id")
    ]).then(function (r) {
      r.forEach(function (x) { if (x.error) throw x.error; });
      var saldo = (r[1].data || [])[0] || null;
      return {
        config: Projecao.normalizarConfig(r[0].data),
        temConfig: !!r[0].data,
        saldo: saldo
          ? { id: saldo.id, data: saldo.data, conta: Number(saldo.conta), caixinha: Number(saldo.caixinha), observacao: saldo.observacao }
          : { data: Projecao.somarDias(MB.hoje(), -1), conta: 0, caixinha: 0, vazio: true },
        dias: r[2].data || [],
        lancamentos: (r[3].data || []).map(function (l) { l.valor = Number(l.valor); return l; })
      };
    });
  };

  /* Grava (ou apaga, se voltou ao padrão) a exceção de um dia. */
  MB.salvarDia = function (dia) {
    var sb = MB.supabase;
    var vazio = dia.trabalha == null && !dia.marmita && !dia.motivo;
    if (vazio) return sb.from("fin_dias").delete().eq("data", dia.data).then(function (r) { if (r.error) throw r.error; return null; });
    return sb.from("fin_dias").upsert({
      user_id: MB.usuario.id,
      data: dia.data,
      trabalha: dia.trabalha,
      marmita: !!dia.marmita,
      motivo: dia.motivo || ""
    }, { onConflict: "user_id,data" }).select().single().then(function (r) {
      if (r.error) throw r.error;
      return r.data;
    });
  };

  /*
    Diálogo "Atualizar saldo": grava um novo fin_saldos e resolve com a
    linha salva (ou null se cancelou). A projeção passa a começar no dia
    seguinte à data informada.
  */
  MB.atualizarSaldo = function (atual) {
    var d = document.createElement("dialog");
    d.className = "dialogo";
    d.innerHTML =
      '<form method="dialog" novalidate>' +
        "<h2>Atualizar saldo</h2>" +
        '<p class="suave">Quanto tem agora, já contando tudo o que entrou e saiu até o fim do dia escolhido.</p>' +
        '<div class="grupo"><label for="ds-conta">Saldo na conta</label><div class="campo-prefixo"><span>R$</span><input class="campo num" id="ds-conta" inputmode="decimal" autocomplete="off"></div></div>' +
        '<div class="grupo"><label for="ds-caixinha">Guardado na caixinha</label><div class="campo-prefixo"><span>R$</span><input class="campo num" id="ds-caixinha" inputmode="decimal" autocomplete="off"></div></div>' +
        '<div class="grupo"><label for="ds-data">Saldo do fim do dia</label><input class="campo" id="ds-data" type="date"></div>' +
        '<div class="dialogo-acoes"><button class="botao fantasma pequeno" type="button" value="nao">Cancelar</button><button class="botao pequeno" type="submit" value="sim">Salvar saldo</button></div>' +
      "</form>";
    document.body.appendChild(d);
    var conta = d.querySelector("#ds-conta");
    var caixinha = d.querySelector("#ds-caixinha");
    var data = d.querySelector("#ds-data");
    conta.value = atual && !atual.vazio ? MB.decimal(atual.conta) : "";
    caixinha.value = MB.decimal(atual ? atual.caixinha : 0);
    data.value = MB.hoje();
    MB.campoDinheiro(conta);
    MB.campoDinheiro(caixinha);

    return new Promise(function (resolver) {
      var fechar = function (valor) { d.close(); d.remove(); resolver(valor); };
      d.addEventListener("cancel", function (ev) { ev.preventDefault(); fechar(null); });
      d.querySelector("[value=nao]").addEventListener("click", function () { fechar(null); });
      d.querySelector("form").addEventListener("submit", function (ev) {
        ev.preventDefault();
        if (conta.value.trim() === "") { conta.focus(); return MB.aviso("Informe o saldo da conta.", true); }
        var botao = d.querySelector("[type=submit]");
        botao.disabled = true;
        MB.supabase.from("fin_saldos").insert({
          data: data.value || MB.hoje(),
          conta: MB.lerNumero(conta.value),
          caixinha: MB.lerNumero(caixinha.value)
        }).select().single().then(function (r) {
          if (r.error) throw r.error;
          MB.aviso("Saldo atualizado.");
          fechar(r.data);
        }).catch(function (e) { botao.disabled = false; MB.erro(e); });
      });
      d.showModal();
      conta.focus();
    });
  };

  /* Confirmação simples com <dialog>; cai no confirm() se não houver suporte. */
  MB.confirmar = function (titulo, texto, rotuloOk) {
    var d = document.createElement("dialog");
    if (!d.showModal) return Promise.resolve(window.confirm(titulo + "\n\n" + texto));
    d.className = "dialogo";
    d.innerHTML =
      "<h2>" + MB.esc(titulo) + "</h2>" +
      '<p class="suave">' + MB.esc(texto) + "</p>" +
      '<div class="dialogo-acoes">' +
        '<button class="botao fantasma pequeno" type="button" value="nao">Cancelar</button>' +
        '<button class="botao pequeno" type="button" value="sim">' + MB.esc(rotuloOk || "Confirmar") + "</button>" +
      "</div>";
    document.body.appendChild(d);
    return new Promise(function (resolver) {
      d.addEventListener("click", function (ev) {
        var b = ev.target.closest("button");
        if (b) d.close(b.value);
        else if (ev.target === d) d.close("nao");
      });
      d.addEventListener("close", function () {
        resolver(d.returnValue === "sim");
        d.remove();
      });
      d.showModal();
    });
  };
})();
