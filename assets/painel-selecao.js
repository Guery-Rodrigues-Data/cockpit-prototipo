/* ==========================================================================
   Cockpit — painel lateral do Mapa. Clicar num dispositivo ou numa área/corredor
   dentro do mapa abre, à esquerda do próprio widget, um painel com os dados do que
   foi selecionado. O Mapa (map.js) só avisa qual é a seleção; tudo que é conteúdo
   e botão do painel mora aqui, no mesmo espírito de app.js.

   Só mostra o que existe nos dados: status e alertas são os simulados pelo LiveState,
   a região do dispositivo é a calculada pela posição (regioes.js). Nada de dado de
   negócio inventado.
   ========================================================================== */

const PainelSelecao = (() => {
  let acoesExtras = null; // (sel) => html; o modo admin acrescenta Renomear/Excluir
  let abaAtiva = "geral"; // aba do painel de controlador; mantida ao passar de um controlador para outro

  const painelEl = () => document.querySelector(".map-selecao");

  const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1).replace(".", ",")} km` : `${Math.round(m)} m`);
  const fmtArea = (m2) => (m2 >= 1e6 ? `${(m2 / 1e6).toFixed(2).replace(".", ",")} km²` : `${Math.round(m2).toLocaleString("pt-BR")} m²`);

  const regiaoPor = (tipo, id) => (tipo === "subarea" ? SUBAREAS : CORREDORES).find((r) => r.id === id) || null;
  const equipamentosDaRegiao = (tipo, id) => {
    const campo = tipo === "subarea" ? "subareaId" : "corredorId";
    return LiveState.getEquipamentos().filter((e) => e[campo] === id);
  };

  /* ---------- conteúdo ---------- */

  function dadosEquipamentoMarkup(eq) {
    const alertas = LiveState.alertasDoEquipamento(eq.id);
    const sub = eq.subareaId ? nomeSubarea(eq.subareaId) : null;
    const cor = eq.corredorId ? nomeCorredor(eq.corredorId) : null;
    return `
      <div class="sel-bloco">
        <div class="sel-linha"><span>Status</span><span class="status-tag" data-status="${eq.online ? "online" : "offline"}">${eq.online ? "Online" : "Offline"}</span></div>
        <div class="sel-linha"><span>Categoria</span><strong>${categoriaLabel(eq.tipo)}</strong></div>
        <div class="sel-linha"><span>Subárea</span>${sub ? `<strong>${sub}</strong>` : "<em>Fora de subárea</em>"}</div>
        <div class="sel-linha"><span>Corredor</span>${cor ? `<strong>${cor}</strong>` : "<em>Fora de corredor</em>"}</div>
        <div class="sel-linha"><span>Posição</span><strong class="sel-mono">${eq.lat.toFixed(5)}, ${eq.lng.toFixed(5)}</strong></div>
      </div>
      <div class="sel-bloco">
        <h5>Alertas ativos <span class="sel-contagem">${alertas.length}</span></h5>
        ${
          alertas.length
            ? alertas
                .map(
                  (a) => `
          <div class="sel-alerta">
            <div><span class="severidade-tag" data-sev="${a.severidade}">${a.severidade}</span><span class="id-mono">${a.dataHora}</span></div>
            <p>${a.descricao}</p>
          </div>`
                )
                .join("")
            : '<div class="sel-vazio">Nenhum alerta ativo.</div>'
        }
      </div>`;
  }

  function dadosRegiaoMarkup(tipo, reg) {
    const eqs = equipamentosDaRegiao(tipo, reg.id);
    const offline = eqs.filter((e) => !e.online).length;
    const idsRegiao = new Set(eqs.map((e) => e.id));
    const alertas = LiveState.getAlertas().filter((a) => idsRegiao.has(a.equipamentoId));
    const porSeveridade = SEVERIDADES.map((sev) => [sev, alertas.filter((a) => a.severidade === sev).length]).filter(([, n]) => n > 0);
    const porCategoria = CATEGORIAS_EQUIPAMENTO.map((c) => {
      const lista = eqs.filter((e) => e.tipo === c.id);
      return { c, total: lista.length, off: lista.filter((e) => !e.online).length };
    }).filter((x) => x.total > 0);
    const comAlerta = (e) => LiveState.alertasDoEquipamento(e.id).length;
    const atencao = eqs
      .filter((e) => !e.online || comAlerta(e) > 0)
      .sort((a, b) => Number(a.online) - Number(b.online) || comAlerta(b) - comAlerta(a));

    const geometria =
      tipo === "corredor"
        ? `<div class="sel-linha"><span>Extensão</span><strong>${fmtDist(comprimentoPolilinhaM(reg.linha))}</strong></div>` +
          (reg.raioM ? `<div class="sel-linha"><span>Alcance da linha</span><strong>${reg.raioM} m</strong></div>` : "")
        : `<div class="sel-linha"><span>Área</span><strong>${fmtArea(areaPoligonoM2(reg.poligono))}</strong></div>`;

    return `
      <div class="sel-bloco">
        <div class="sel-kpis">
          <div class="sel-kpi"><b>${eqs.length}</b><span>Dispositivos</span></div>
          <div class="sel-kpi"><b>${eqs.length - offline}</b><span>Online</span></div>
          <div class="sel-kpi ${offline ? "is-alerta" : ""}"><b>${offline}</b><span>Offline</span></div>
          <div class="sel-kpi ${alertas.length ? "is-alerta" : ""}"><b>${alertas.length}</b><span>Alertas</span></div>
        </div>
      </div>
      <div class="sel-bloco">${geometria}</div>
      <div class="sel-bloco">
        <h5>Por categoria</h5>
        ${
          porCategoria.length
            ? porCategoria
                .map(
                  ({ c, total, off }) => `
          <div class="sel-cat">${ICONES_CATEGORIA[c.id] || ""}<span>${c.label}</span><b>${total}</b>${off ? `<span class="sel-cat-off">${off} offline</span>` : ""}</div>`
                )
                .join("")
            : '<div class="sel-vazio">Nenhum dispositivo dentro desta região.</div>'
        }
      </div>
      ${
        porSeveridade.length
          ? `<div class="sel-bloco"><h5>Alertas por severidade</h5><div class="sel-sev">${porSeveridade
              .map(([sev, n]) => `<span class="severidade-tag" data-sev="${sev}">${sev} ${n}</span>`)
              .join("")}</div></div>`
          : ""
      }
      ${
        atencao.length
          ? `<div class="sel-bloco"><h5>Precisam de atenção <span class="sel-contagem">${atencao.length}</span></h5>
        ${atencao
          .slice(0, 6)
          .map(
            (e) => `
          <button type="button" class="sel-item" data-sel-acao="abrir" data-alvo="${e.id}">
            <span><strong>${e.nome}</strong><span class="id-mono">${e.id}</span></span>
            <span class="status-tag" data-status="${e.online ? "online" : "offline"}">${e.online ? "Online" : "Offline"}</span>
          </button>`
          )
          .join("")}
        ${atencao.length > 6 ? `<div class="sel-vazio">e mais ${atencao.length - 6}</div>` : ""}</div>`
          : ""
      }`;
  }

  function descricaoDaSelecao(sel) {
    if (sel.tipo === "equipamento") {
      const eq = LiveState.equipamentoPorId(sel.id);
      if (!eq) return null;
      // Controlador (semáforo) ganha abas; os demais equipamentos seguem com a visão única.
      const ehControlador = eq.tipo === "semaforo";
      return {
        icone: ICONES_CATEGORIA[eq.tipo] || ICONS.mapPin,
        titulo: eq.nome,
        sub: `${eq.id} · ${categoriaLabel(eq.tipo)}`,
        selo: PainelControlador.statusTag(eq), // fica visível em todas as abas
        abas: ehControlador ? PainelControlador.abas(eq) : null,
        dados: (aba) => {
          const atual = LiveState.equipamentoPorId(sel.id);
          return ehControlador ? PainelControlador.dados(atual, aba) : dadosEquipamentoMarkup(atual);
        },
        botoes: `<button type="button" class="btn-secondary" data-sel-acao="centralizar">Centralizar no mapa</button>`,
      };
    }
    const reg = regiaoPor(sel.tipo, sel.id);
    if (!reg) return null;
    return {
      icone: ICONS.layers,
      titulo: reg.nome,
      sub: `${reg.id} · ${sel.tipo === "subarea" ? "Subárea" : "Corredor"}`,
      dados: () => dadosRegiaoMarkup(sel.tipo, regiaoPor(sel.tipo, sel.id)),
      botoes: "", // enquadrar e filtrar já acontecem ao clicar na lista de Regiões
    };
  }

  /* ---------- render ---------- */

  function renderizar(sel) {
    const el = painelEl();
    if (!el) return;
    const desc = sel && descricaoDaSelecao(sel);
    marcarLinhaSelecionada(desc ? sel : null);
    if (!desc) {
      el.hidden = true;
      el.classList.remove("is-open");
      el.innerHTML = "";
      return;
    }
    const estavaFechado = el.hidden;
    const abas = desc.abas;
    if (abas) {
      if (!abas.some((a) => a.id === abaAtiva)) abaAtiva = abas[0].id;
      if (abaAtiva === "grupos") PainelControlador.carregarGrupos(sel.id);
    } else {
      abaAtiva = "geral";
    }
    const acoes = desc.botoes + (acoesExtras ? acoesExtras(sel) : "");
    el.innerHTML = `
      <header class="sel-head">
        <span class="sel-icone">${desc.icone}</span>
        <div class="sel-titulo"><strong>${desc.titulo}</strong><span>${desc.sub}</span></div>
        <span class="sel-selo">${desc.selo || ""}</span>
        <button type="button" class="widget-icon-btn" data-sel-acao="fechar" title="Fechar (Esc)">${ICONS.x}</button>
      </header>
      ${
        abas
          ? `<nav class="sel-abas" role="tablist">${abas
              .map(
                (a) =>
                  `<button type="button" role="tab" class="sel-aba${a.id === abaAtiva ? " is-ativa" : ""}" aria-selected="${a.id === abaAtiva}" data-sel-acao="aba" data-aba="${a.id}">${a.label}</button>`
              )
              .join("")}</nav>`
          : ""
      }
      <div class="sel-corpo">
        <div class="sel-dados">${desc.dados(abaAtiva)}</div>
        ${acoes ? `<div class="sel-acoes">${acoes}</div>` : ""}
      </div>`;
    el.hidden = false;
    if (estavaFechado) {
      el.classList.remove("is-open");
      void el.offsetWidth; // reinicia a animação de entrada
      el.classList.add("is-open");
    }
  }

  // Marca nas listas dos widgets a linha do que está aberto no painel, sem refazer a lista
  // (refazer voltaria a rolagem ao topo a cada clique).
  function marcarLinhaSelecionada(sel) {
    document.querySelectorAll('tr[data-action="lista-row"]').forEach((tr) => {
      tr.classList.toggle("is-selecionada", !!sel && tr.dataset.tipo === sel.tipo && tr.dataset.alvo === sel.id);
    });
  }

  // A cada tick do tempo real só os dados são refeitos, sem mexer nos botões (e num
  // campo de renomear aberto pelo admin) nem na posição da rolagem.
  function atualizarDados({ forcar = false } = {}) {
    const sel = CockpitMap.getSelecao();
    const el = painelEl();
    const dadosEl = el && el.querySelector(".sel-dados");
    const desc = sel && descricaoDaSelecao(sel);
    if (!dadosEl || !desc) return;
    const selo = el.querySelector(".sel-selo");
    if (selo) selo.innerHTML = desc.selo || "";
    // a contagem de alertas no rótulo da aba acompanha o tempo real
    if (desc.abas) {
      desc.abas.forEach((a) => {
        const botao = el.querySelector(`.sel-aba[data-aba="${a.id}"]`);
        if (botao) botao.innerHTML = a.label;
      });
    }
    // Comandos e Grupos não mudam sozinhos com o tempo real; refazê-los a cada tick desarmaria
    // o botão "Confirmar?" do Reset. Quem os altera pede o redesenho (redesenharDados).
    if (!forcar && (abaAtiva === "comandos" || abaAtiva === "grupos")) return;
    dadosEl.innerHTML = desc.dados(abaAtiva);
  }

  /* ---------- ligação com o mapa e os cliques do painel ---------- */

  CockpitMap.definirAoSelecionar(renderizar);
  LiveState.subscribe(() => {
    if (CockpitMap.getSelecao()) atualizarDados();
  });

  document.addEventListener("click", (e) => {
    const alvo = e.target.closest("[data-sel-acao]");
    if (!alvo) return;
    const sel = CockpitMap.getSelecao();
    switch (alvo.dataset.selAcao) {
      case "fechar":
        CockpitMap.limparSelecao();
        break;
      case "aba":
        if (sel) {
          abaAtiva = alvo.dataset.aba;
          renderizar(sel);
        }
        break;
      case "centralizar":
        if (sel && sel.tipo === "equipamento") CockpitMap.selecionarEquipamento(sel.id, { centralizar: true });
        break;
      case "abrir":
        CockpitMap.selecionarEquipamento(alvo.dataset.alvo, { centralizar: true });
        break;
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !CockpitMap.getSelecao()) return;
    if (e.target.matches?.("input, textarea") || document.querySelector(".modal-overlay.is-open")) return;
    CockpitMap.limparSelecao();
  });

  return {
    definirAcoesExtras(fn) {
      acoesExtras = fn;
    },
    redesenharDados() {
      if (CockpitMap.getSelecao()) atualizarDados({ forcar: true });
    },
  };
})();
