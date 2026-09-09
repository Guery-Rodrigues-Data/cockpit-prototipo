/* ==========================================================================
   Cockpit — grid de widgets: adicionar/mover/redimensionar/configurar/remover,
   persistência por "perfil" (localStorage, 1 tela por usuário — fora de escopo
   compartilhar entre usuários, ver 00 - epic - Cockpit.md) e a renderização de
   cada tipo de widget. O Mapa (map.js) só cuida do Leaflet; tudo que é chrome
   de card, dropdown de filtro e modal de configuração mora aqui.
   ========================================================================== */

const STORAGE_KEY = "cockpitLayoutV1";

const ICONS = {
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
  chevronLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m15 18-6-6 6-6"/></svg>',
  chevronRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m9 18 6-6-6-6"/></svg>',
  chevronDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m6 9 6 6 6-6"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  mapPin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
  cpu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2"/></svg>',
  alertTriangle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></svg>',
  layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/></svg>',
  hash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
  externalLink: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/></svg>',
  dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  grip: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.6"/><circle cx="15" cy="5" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="19" r="1.6"/><circle cx="15" cy="19" r="1.6"/></svg>',
};

const WIDGET_META = {
  mapa: { label: "Mapa", desc: "Visualização geográfica e espacial interativa de dispositivos, subáreas e corredores.", icon: ICONS.mapPin, unico: true },
  dispositivos: { label: "Dispositivos", desc: "Monitoramento gerencial de quantitativo dos equipamentos.", icon: ICONS.cpu, unico: false },
  alertas: { label: "Alertas", desc: "Acompanhamento de falhas ativas.", icon: ICONS.alertTriangle, unico: false },
  regioes: { label: "Subáreas e Corredores", desc: "Exibição dos dispositivos agrupados em subáreas ou corredores.", icon: ICONS.layers, unico: false },
};

function todasRegioesIds() {
  return [...SUBAREAS.map((s) => s.id), ...CORREDORES.map((c) => c.id)];
}

function defaultConfig(type) {
  switch (type) {
    case "mapa":
      return {
        titulo: "",
        filtros: {
          subareas: SUBAREAS.map((s) => s.id),
          corredores: CORREDORES.map((c) => c.id),
          categorias: CATEGORIAS_EQUIPAMENTO.map((c) => c.id),
          statusAlerta: "todos",
          statusConexao: "todos",
        },
      };
    case "dispositivos":
      return {
        titulo: "",
        cor: "azul",
        modo: "totais",
        filtros: { statusConexao: "todos", tipos: CATEGORIAS_EQUIPAMENTO.map((c) => c.id), regioes: todasRegioesIds() },
        listaBusca: "",
        listaPagina: 1,
      };
    case "alertas":
      return {
        titulo: "",
        cor: "vermelho",
        modo: "totais",
        filtros: { tipos: CATEGORIAS_EQUIPAMENTO.map((c) => c.id), regioes: todasRegioesIds(), severidades: [...SEVERIDADES] },
        listaBusca: "",
        listaPagina: 1,
      };
    case "regioes":
      return {
        titulo: "",
        cor: "roxo",
        modo: "totais",
        filtros: { regioes: todasRegioesIds() },
        listaTab: "subareas",
        listaBusca: "",
        listaPagina: 1,
      };
  }
}

function defaultSize(type) {
  switch (type) {
    case "mapa": return { w: 8, h: 7 };
    case "dispositivos": return { w: 3, h: 3 };
    case "alertas": return { w: 4, h: 4 };
    case "regioes": return { w: 4, h: 4 };
  }
}

function corHex(id) {
  const c = CORES_CARD.find((c) => c.id === id);
  return c ? c.hex : "#5b6472";
}

/* ---------- estado do app ---------- */

let instances = []; // [{id, type, x,y,w,h, config}]
let grid = null;
let configDraft = null; // {instanceId, config} enquanto o modal está aberto
const PAGE_SIZE = 6;

function $(sel, ctx) { return (ctx || document).querySelector(sel); }
function $all(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); }

function toast(msg, acao) {
  const el = $("#toast");
  clearTimeout(toast._t);
  el.innerHTML = "";
  const span = document.createElement("span");
  span.textContent = msg;
  el.appendChild(span);
  if (acao) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "toast-action";
    btn.textContent = acao.label;
    btn.addEventListener("click", () => {
      clearTimeout(toast._t);
      el.classList.remove("is-visible");
      acao.fn();
    });
    el.appendChild(btn);
  }
  el.classList.add("is-visible");
  toast._t = setTimeout(() => el.classList.remove("is-visible"), acao ? 6000 : 2600);
}
function notImplemented(label) {
  toast(`${label} — fora do escopo deste protótipo.`);
}

/* ---------- persistência ---------- */

function loadLayout() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}
function saveLayout() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(instances));
}

/* ---------- Bus: integração dos cards com o Widget de Mapa ---------- */

const CockpitBus = {
  mapaAtivo() { return instances.some((i) => i.type === "mapa"); },
  aplicarFiltroCard(payload) {
    if (!this.mapaAtivo()) return;
    CockpitMap.setFiltroCompleto(payload);
    scrollToWidget(instances.find((i) => i.type === "mapa").id);
  },
  focarEquipamento(id) {
    if (!this.mapaAtivo()) return;
    CockpitMap.focarEquipamento(id);
    scrollToWidget(instances.find((i) => i.type === "mapa").id);
  },
  focarRegiao(tipo, id) {
    if (!this.mapaAtivo()) return;
    CockpitMap.focarRegiao(tipo, id);
    scrollToWidget(instances.find((i) => i.type === "mapa").id);
  },
};

function atualizarBibliotecaMapa() {
  const btn = document.querySelector('[data-action="add-widget"][data-type="mapa"]');
  const tag = document.getElementById("libTagMapa");
  const jaTem = instances.some((i) => i.type === "mapa");
  if (btn) btn.toggleAttribute("disabled", jaTem);
  if (tag) tag.hidden = !jaTem;
}

function scrollToWidget(id) {
  const el = document.querySelector(`.grid-stack-item[gs-id="${id}"]`);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/* ---------- filtragem de dados por config de widget ---------- */

function equipamentosFiltrados(filtros) {
  return LiveState.getEquipamentos().filter((eq) => {
    if (!filtros.tipos.includes(eq.tipo)) return false;
    if (filtros.statusConexao === "online" && !eq.online) return false;
    if (filtros.statusConexao === "offline" && eq.online) return false;
    if (eq.subareaId || eq.corredorId) {
      const passa = (eq.subareaId && filtros.regioes.includes(eq.subareaId)) || (eq.corredorId && filtros.regioes.includes(eq.corredorId));
      if (!passa) return false;
    }
    return true;
  });
}
function alertasFiltrados(filtros) {
  return LiveState.getAlertas().filter((a) => {
    const eq = LiveState.equipamentoPorId(a.equipamentoId);
    if (!eq) return false;
    if (!filtros.tipos.includes(eq.tipo)) return false;
    if (!filtros.severidades.includes(a.severidade)) return false;
    if (eq.subareaId || eq.corredorId) {
      const passa = (eq.subareaId && filtros.regioes.includes(eq.subareaId)) || (eq.corredorId && filtros.regioes.includes(eq.corredorId));
      if (!passa) return false;
    }
    return true;
  });
}

/* ---------- grid: init / add / remove ---------- */

function initGrid() {
  grid = GridStack.init({
    column: 12,
    cellHeight: 84,
    margin: 10,
    float: true,
    handle: ".widget-header",
    resizable: { handles: "e, se, s, sw, w" },
  });

  grid.on("change", () => {
    instances.forEach((inst) => {
      const el = document.querySelector(`.grid-stack-item[gs-id="${inst.id}"]`);
      if (el && el.gridstackNode) {
        inst.x = el.gridstackNode.x;
        inst.y = el.gridstackNode.y;
        inst.w = el.gridstackNode.w;
        inst.h = el.gridstackNode.h;
      }
    });
    saveLayout();
  });
  grid.on("resizestop", (ev, el) => {
    const id = el.getAttribute("gs-id");
    const inst = instances.find((i) => i.id === id);
    if (inst && inst.type === "mapa") CockpitMap.invalidateSize();
    aplicarTamanhoResponsivo(id);
  });

  const saved = loadLayout();
  if (saved.length === 0) {
    showEmptyState(true);
  } else {
    instances = saved;
    instances.forEach((inst) => mountWidget(inst, false));
    showEmptyState(false);
  }
}

function showEmptyState(show) {
  $("#cockpitEmpty").hidden = !show;
  $(".grid-stack").style.display = show ? "none" : "block";
}

function addWidget(type) {
  const meta = WIDGET_META[type];
  if (meta.unico && instances.some((i) => i.type === type)) {
    toast(`Já existe um widget de ${meta.label} nesta tela — instância única nesta fase.`);
    return;
  }
  const id = "w-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const size = defaultSize(type);
  const inst = { id, type, x: null, y: null, w: size.w, h: size.h, config: defaultConfig(type) };
  instances.push(inst);
  showEmptyState(false);
  mountWidget(inst, true);
  saveLayout();
  toast(`Widget de ${meta.label} adicionado.`);
}

function mountWidget(inst, isNew) {
  const opts = { id: inst.id, w: inst.w, h: inst.h, content: widgetMarkup(inst) };
  if (!isNew) { opts.x = inst.x; opts.y = inst.y; }
  const el = grid.addWidget(opts);
  el.setAttribute("gs-id", inst.id);
  if (el.gridstackNode) {
    inst.x = el.gridstackNode.x;
    inst.y = el.gridstackNode.y;
    inst.w = el.gridstackNode.w;
    inst.h = el.gridstackNode.h;
  }
  renderWidgetBody(inst.id);
  if (inst.type === "mapa") {
    setTimeout(() => CockpitMap.init($(`#mapaEl-${inst.id}`), atualizarCabecalhoMapa, inst.config.filtros), 30);
  }
  observarTamanho(el, inst.id);
}

function removeWidget(id, opts = {}) {
  const comDesfazer = opts.comDesfazer !== false;
  const inst = instances.find((i) => i.id === id);
  if (!inst) return;
  const snapshot = JSON.parse(JSON.stringify(inst));
  const el = document.querySelector(`.grid-stack-item[gs-id="${id}"]`);
  if (inst.type === "mapa") CockpitMap.destroy();
  if (el) grid.removeWidget(el);
  instances = instances.filter((i) => i.id !== id);
  saveLayout();
  atualizarBibliotecaMapa();
  if (instances.length === 0) showEmptyState(true);
  if (comDesfazer) {
    toast(`Widget de ${WIDGET_META[inst.type].label} removido.`, {
      label: "Desfazer",
      fn: () => restaurarWidgets([snapshot]),
    });
  } else {
    toast(`Widget de ${WIDGET_META[inst.type].label} removido.`);
  }
}

// Recoloca instâncias removidas na posição, tamanho e configuração exatas que
// tinham — usado pelo "Desfazer" da remoção individual e do Limpar Cockpit.
function restaurarWidgets(snaps) {
  if (!snaps.length) return;
  showEmptyState(false);
  snaps.forEach((snap) => {
    instances.push(snap);
    mountWidget(snap, false);
  });
  saveLayout();
  atualizarBibliotecaMapa();
  toast(
    snaps.length === 1
      ? `Widget de ${WIDGET_META[snaps[0].type].label} restaurado.`
      : `${snaps.length} widgets restaurados.`
  );
}

function limparCockpit() {
  const snapshot = JSON.parse(JSON.stringify(instances));
  if (!snapshot.length) return;
  [...instances].forEach((i) => removeWidget(i.id, { comDesfazer: false }));
  const n = snapshot.length;
  toast(`Cockpit limpo — ${n} widget${n === 1 ? "" : "s"} removido${n === 1 ? "" : "s"}.`, {
    label: "Desfazer",
    fn: () => restaurarWidgets(snapshot),
  });
}

// Adapta o widget a "compacto" quando fica pequeno demais pro layout padrão
// (critério de responsividade das histórias de card — ver data-size no CSS).
function observarTamanho(el, id) {
  const ro = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const card = entry.target.querySelector(".widget-card");
      if (!card) continue;
      card.setAttribute("data-size", entry.contentRect.width < 230 ? "sm" : "md");
    }
  });
  ro.observe(el);
}
function aplicarTamanhoResponsivo(id) {
  const el = document.querySelector(`.grid-stack-item[gs-id="${id}"] .widget-card`);
  if (!el) return;
}

/* ---------- markup do card (chrome comum) ---------- */

function widgetMarkup(inst) {
  const meta = WIDGET_META[inst.type];
  const titulo = inst.config.titulo || meta.label;
  const cor = inst.config.cor ? corHex(inst.config.cor) : "#e0342b";
  return `
    <div class="widget-card" data-type="${inst.type}" data-size="md" style="--accent:${cor}; --accent-tint:${cor}1a;">
      <div class="widget-header">
        <span class="widget-drag" aria-hidden="true" title="Arraste para mover">${ICONS.grip}</span>
        <div class="widget-header-icon">${meta.icon}</div>
        <div class="widget-title">${titulo}</div>
        <div class="widget-header-right">
          <div class="widget-header-actions">
            ${inst.type !== "mapa" ? `<button type="button" class="widget-icon-btn" data-action="widget-config-open" data-id="${inst.id}" title="Configurar card">${ICONS.gear}</button>` : ""}
            <button type="button" class="widget-icon-btn is-danger" data-action="widget-remove" data-id="${inst.id}" title="Remover widget">${ICONS.trash}</button>
          </div>
          ${inst.type !== "mapa" ? modoToggleMarkup(inst) : ""}
        </div>
      </div>
      <div class="widget-body" id="widgetBody-${inst.id}"></div>
    </div>`;
}

function modoToggleMarkup(inst) {
  return `
    <div class="modo-toggle" data-action="modo-toggle" data-id="${inst.id}" data-modo="${inst.config.modo}" title="Alternar Card Totais / Lista Detalhada">
      <span class="modo-toggle-option ${inst.config.modo === "totais" ? "is-active" : ""}">${ICONS.hash}</span>
      <span class="modo-toggle-option ${inst.config.modo === "lista" ? "is-active" : ""}">${ICONS.list}</span>
    </div>`;
}

function toggleModo(id) {
  const inst = instances.find((i) => i.id === id);
  inst.config.modo = inst.config.modo === "totais" ? "lista" : "totais";
  saveLayout();
  renderWidgetHeader(id);
  renderWidgetBody(id);
}

function renderWidgetHeader(id) {
  const inst = instances.find((i) => i.id === id);
  const toggle = document.querySelector(`.modo-toggle[data-id="${id}"]`);
  if (!toggle) return;
  toggle.setAttribute("data-modo", inst.config.modo);
  $all(".modo-toggle-option", toggle).forEach((el, i) => {
    el.classList.toggle("is-active", (i === 0 && inst.config.modo === "totais") || (i === 1 && inst.config.modo === "lista"));
  });
}

/* ---------- dispatch de corpo por tipo ---------- */

function renderWidgetBody(id) {
  const inst = instances.find((i) => i.id === id);
  const body = $(`#widgetBody-${id}`);
  if (!inst || !body) return;

  if (inst.type === "mapa") {
    body.innerHTML = mapaBodyMarkup(inst);
    return;
  }
  if (inst.type === "dispositivos") {
    body.innerHTML = inst.config.modo === "totais" ? totaisDispositivosMarkup(inst) : listaDispositivosMarkup(inst);
    return;
  }
  if (inst.type === "alertas") {
    body.innerHTML = inst.config.modo === "totais" ? totaisAlertasMarkup(inst) : listaAlertasMarkup(inst);
    return;
  }
  if (inst.type === "regioes") {
    body.innerHTML = inst.config.modo === "totais" ? totaisRegioesMarkup(inst) : listaRegioesMarkup(inst);
    return;
  }
}

/* ---------- resumo do filtro ativo (legenda do Card Totais) ---------- */

function resumoFiltroCard(inst) {
  const f = inst.config.filtros;
  const partes = [];
  if (inst.type === "dispositivos" || inst.type === "alertas") {
    const tot = CATEGORIAS_EQUIPAMENTO.length;
    if (f.tipos.length >= tot) partes.push("Todos os tipos");
    else if (f.tipos.length === 0) partes.push("Nenhum tipo");
    else if (f.tipos.length <= 2) partes.push(f.tipos.map(categoriaLabel).join(", "));
    else partes.push(`${f.tipos.length} tipos`);
  }
  if (inst.type === "dispositivos" && f.statusConexao && f.statusConexao !== "todos") {
    partes.push(f.statusConexao === "online" ? "Só online" : "Só offline");
  }
  if (inst.type === "alertas" && f.severidades.length < SEVERIDADES.length) {
    partes.push(f.severidades.length === 0 ? "Nenhuma severidade" : f.severidades.length <= 2 ? f.severidades.join(", ") : `${f.severidades.length} severidades`);
  }
  const totReg = SUBAREAS.length + CORREDORES.length;
  if (f.regioes.length >= totReg) partes.push("Todas as regiões");
  else if (f.regioes.length === 0) partes.push("Nenhuma região");
  else partes.push(`${f.regioes.length} de ${totReg} regiões`);
  return partes.join(" · ");
}

/* ---------- Dispositivos ---------- */

function totaisDispositivosMarkup(inst) {
  const n = equipamentosFiltrados(inst.config.filtros).length;
  return `
    <div class="totais-body" data-action="totais-clicar" data-id="${inst.id}">
      <div class="totais-numero">${n}</div>
      <div class="totais-label">Dispositivos</div>
      <div class="totais-filtro">${resumoFiltroCard(inst)}</div>
    </div>`;
}

function listaDispositivosMarkup(inst) {
  const todos = equipamentosFiltrados(inst.config.filtros);
  const busca = (inst.config.listaBusca || "").toLowerCase();
  const filtrados = busca ? todos.filter((e) => e.nome.toLowerCase().includes(busca) || e.id.toLowerCase().includes(busca)) : todos;
  const { pagina, totalPaginas, itens } = paginar(filtrados, inst.config.listaPagina);

  return `
    <div class="lista-toolbar">
      ${buscaMarkup(inst.id)}
    </div>
    <div class="lista-scroll">
      ${itens.length === 0 ? `<div class="lista-vazio">Nenhum dispositivo encontrado.</div>` : `
      <table class="lista-tabela">
        <thead><tr><th>Dispositivo</th><th>Status</th></tr></thead>
        <tbody>
          ${itens.map((e) => `
            <tr data-action="lista-row" data-id="${inst.id}" data-tipo="equipamento" data-alvo="${e.id}">
              <td><strong>${e.nome}</strong><span class="id-mono">${e.id} · ${categoriaLabel(e.tipo)}</span></td>
              <td><span class="status-tag" data-status="${e.online ? "online" : "offline"}">${e.online ? "Online" : "Offline"}</span></td>
            </tr>`).join("")}
        </tbody>
      </table>`}
    </div>
    ${paginacaoMarkup(inst.id, pagina, totalPaginas, filtrados.length)}
  `;
}

/* ---------- Alertas ---------- */

function totaisAlertasMarkup(inst) {
  const lista = alertasFiltrados(inst.config.filtros);
  const porSeveridade = SEVERIDADES.map((sev) => ({ sev, n: lista.filter((a) => a.severidade === sev).length }));
  return `
    <div class="totais-body" data-action="totais-clicar" data-id="${inst.id}">
      <div class="totais-numero">${lista.length}</div>
      <div class="totais-label">Alertas ativos</div>
      <div class="totais-breakdown">
        ${porSeveridade.map((s) => `<span class="totais-chip"><span class="totais-chip-dot" style="background:${SEVERIDADE_COR[s.sev]}"></span>${s.sev} ${s.n}</span>`).join("")}
      </div>
      <div class="totais-filtro">${resumoFiltroCard(inst)}</div>
    </div>`;
}

function listaAlertasMarkup(inst) {
  const todos = alertasFiltrados(inst.config.filtros);
  const busca = (inst.config.listaBusca || "").toLowerCase();
  const filtrados = busca
    ? todos.filter((a) => {
        const eq = LiveState.equipamentoPorId(a.equipamentoId);
        return (eq && (eq.nome.toLowerCase().includes(busca) || eq.id.toLowerCase().includes(busca))) || a.descricao.toLowerCase().includes(busca);
      })
    : todos;
  const { pagina, totalPaginas, itens } = paginar(filtrados, inst.config.listaPagina);

  return `
    <div class="lista-toolbar">
      ${buscaMarkup(inst.id)}
    </div>
    <div class="lista-scroll">
      ${itens.length === 0 ? `<div class="lista-vazio">Nenhum alerta ativo com esse filtro.</div>` : `
      <table class="lista-tabela">
        <thead><tr><th>Equipamento</th><th>Falha</th><th>Severidade</th></tr></thead>
        <tbody>
          ${itens.map((a) => {
            const eq = LiveState.equipamentoPorId(a.equipamentoId);
            return `
            <tr data-action="lista-row" data-id="${inst.id}" data-tipo="equipamento" data-alvo="${a.equipamentoId}">
              <td><strong>${eq ? eq.nome : a.equipamentoId}</strong><span class="id-mono">${a.equipamentoId}</span></td>
              <td>${a.descricao}</td>
              <td><span class="severidade-tag" data-sev="${a.severidade}">${a.severidade}</span></td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>`}
    </div>
    ${paginacaoMarkup(inst.id, pagina, totalPaginas, filtrados.length, true)}
  `;
}

/* ---------- Regiões (Subáreas e Corredores) ---------- */

function totaisRegioesMarkup(inst) {
  const ids = inst.config.filtros.regioes;
  const nSub = SUBAREAS.filter((s) => ids.includes(s.id)).length;
  const nCor = CORREDORES.filter((c) => ids.includes(c.id)).length;
  return `
    <div class="totais-body" data-action="totais-clicar" data-id="${inst.id}">
      <div class="totais-numero">${nSub + nCor}</div>
      <div class="totais-label">Regiões cadastradas</div>
      <div class="totais-breakdown">
        <span class="totais-chip"><span class="totais-chip-dot" style="background:var(--blue)"></span>Subáreas ${nSub}</span>
        <span class="totais-chip"><span class="totais-chip-dot" style="background:var(--purple)"></span>Corredores ${nCor}</span>
      </div>
      <div class="totais-filtro">${resumoFiltroCard(inst)}</div>
    </div>`;
}

function listaRegioesMarkup(inst) {
  const ids = inst.config.filtros.regioes;
  const tab = inst.config.listaTab || "subareas";
  const fonte = tab === "subareas" ? SUBAREAS.filter((s) => ids.includes(s.id)) : CORREDORES.filter((c) => ids.includes(c.id));
  const busca = (inst.config.listaBusca || "").toLowerCase();
  const filtrados = busca ? fonte.filter((r) => r.nome.toLowerCase().includes(busca)) : fonte;
  const { pagina, totalPaginas, itens } = paginar(filtrados, inst.config.listaPagina);
  const tipoAlvo = tab === "subareas" ? "subarea" : "corredor";

  return `
    <div class="lista-toolbar">
      <div class="lista-tabs">
        <button type="button" class="lista-tab ${tab === "subareas" ? "is-active" : ""}" data-action="lista-tab" data-id="${inst.id}" data-tab="subareas">Subáreas</button>
        <button type="button" class="lista-tab ${tab === "corredores" ? "is-active" : ""}" data-action="lista-tab" data-id="${inst.id}" data-tab="corredores">Corredores</button>
      </div>
      ${buscaMarkup(inst.id)}
    </div>
    <div class="lista-scroll">
      ${itens.length === 0 ? `<div class="lista-vazio">Nenhuma região encontrada.</div>` : `
      <table class="lista-tabela">
        <thead><tr><th>${tab === "subareas" ? "Subárea" : "Corredor"}</th></tr></thead>
        <tbody>
          ${itens.map((r) => `
            <tr data-action="lista-row" data-id="${inst.id}" data-tipo="${tipoAlvo}" data-alvo="${r.id}">
              <td><strong>${r.nome}</strong><span class="id-mono">${r.id}</span></td>
            </tr>`).join("")}
        </tbody>
      </table>`}
    </div>
    ${paginacaoMarkup(inst.id, pagina, totalPaginas, filtrados.length)}
  `;
}

/* ---------- helpers de lista (busca, paginação) ---------- */

function buscaMarkup(id) {
  const inst = instances.find((i) => i.id === id);
  return `
    <div class="lista-search">
      ${ICONS.search}
      <input type="text" data-input="lista-busca" data-id="${id}" placeholder="Buscar..." value="${inst.config.listaBusca || ""}" />
    </div>`;
}

function paginar(lista, pagina) {
  const totalPaginas = Math.max(1, Math.ceil(lista.length / PAGE_SIZE));
  const p = Math.min(Math.max(1, pagina || 1), totalPaginas);
  const itens = lista.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
  return { pagina: p, totalPaginas, itens };
}

function paginacaoMarkup(id, pagina, totalPaginas, total, comVerTudo) {
  return `
    <div class="lista-footer">
      <span class="lista-footer-label">${total} item${total === 1 ? "" : "s"}${comVerTudo ? "" : ""}</span>
      <div style="display:flex; align-items:center; gap:10px;">
        ${comVerTudo ? `<button type="button" class="btn-text" data-action="ver-tudo-alertas" style="padding:0;">Ver tudo</button>` : ""}
        <div class="lista-pg-btns">
          <button type="button" data-action="lista-pg" data-id="${id}" data-dir="prev" ${pagina <= 1 ? "disabled" : ""}>${ICONS.chevronLeft}</button>
          <span class="lista-footer-label">${pagina}/${totalPaginas}</span>
          <button type="button" data-action="lista-pg" data-id="${id}" data-dir="next" ${pagina >= totalPaginas ? "disabled" : ""}>${ICONS.chevronRight}</button>
        </div>
      </div>
    </div>`;
}

/* ---------- Mapa: markup do header (dropdowns + busca) ---------- */

function mapaBodyMarkup(inst) {
  const f = CockpitMap.getFiltro();
  const c = CockpitMap.getContagens();
  return `
    <div class="map-widget-header">
      <div class="map-search-mini">
        ${ICONS.search}
        <input type="text" data-input="map-busca" placeholder="Buscar dispositivo, corredor ou subárea..." />
      </div>
      ${filtroBtnMarkup("subareas", "Subáreas", c.subareas)}
      ${filtroBtnMarkup("corredores", "Corredores", c.corredores)}
      ${filtroBtnMarkup("categorias", "Equipamentos", c.categorias)}
    </div>
    <div id="mapaEl-${inst.id}" style="flex:1; min-height:0; position:relative;"></div>
  `;
}

// "· Todas" quando nada está filtrado; "· 2/4" só quando o operador restringe
function contagemChip(c) {
  return c.sel >= c.total ? `<span>· Todas</span>` : `<span>· ${c.sel}/${c.total}</span>`;
}

function filtroBtnMarkup(campo, label, contagem) {
  return `
    <div class="map-filtro-btn-wrap" data-filtro-wrap="${campo}">
      <button type="button" class="map-filtro-btn ${contagem.sel < contagem.total ? "is-active" : ""}" data-action="map-filtro-toggle" data-campo="${campo}">
        ${label} ${contagemChip(contagem)}
      </button>
      <div class="filtros-panel" data-filtro-panel="${campo}">
        ${dropdownConteudo(campo)}
      </div>
    </div>`;
}

function dropdownConteudo(campo) {
  if (campo === "subareas") {
    return dropdownChecklist("subareas", SUBAREAS, CockpitMap.getFiltro().subareas);
  }
  if (campo === "corredores") {
    return dropdownChecklist("corredores", CORREDORES, CockpitMap.getFiltro().corredores);
  }
  // categorias: 3 seções — Categorias, Status de Alerta, Status de Conexão (critério #125167)
  const f = CockpitMap.getFiltro();
  return `
    <div class="filtros-panel-title">Categorias<div class="filtros-panel-bulk">
      <button type="button" data-action="map-bulk" data-campo="categorias" data-valor="true">Todas</button>
      <button type="button" data-action="map-bulk" data-campo="categorias" data-valor="false">Limpar</button>
    </div></div>
    <div class="filtros-panel-list">
      ${CATEGORIAS_EQUIPAMENTO.map((c) => `
        <label class="filtros-check">
          <input type="checkbox" data-input="map-check" data-campo="categorias" data-alvo="${c.id}" ${f.categorias.has(c.id) ? "checked" : ""}/>
          ${c.label}
        </label>`).join("")}
    </div>
    <div class="filtros-panel-divider"></div>
    <div class="filtros-panel-title">Status de Alerta</div>
    <div class="filtros-radio-row">
      <label class="filtros-check"><input type="radio" name="mapStatusAlerta" data-input="map-status-alerta" value="todos" ${f.statusAlerta === "todos" ? "checked" : ""}/> Todos os Equipamentos</label>
      <label class="filtros-check"><input type="radio" name="mapStatusAlerta" data-input="map-status-alerta" value="somente-ativos" ${f.statusAlerta === "somente-ativos" ? "checked" : ""}/> Somente com alertas ativos</label>
    </div>
    <div class="filtros-panel-divider"></div>
    <div class="filtros-panel-title">Status de Conexão</div>
    <div class="filtros-radio-row">
      <label class="filtros-check"><input type="radio" name="mapStatusConexao" data-input="map-status-conexao" value="todos" ${f.statusConexao === "todos" ? "checked" : ""}/> Todos os Dispositivos</label>
      <label class="filtros-check"><input type="radio" name="mapStatusConexao" data-input="map-status-conexao" value="online" ${f.statusConexao === "online" ? "checked" : ""}/> Somente Online</label>
      <label class="filtros-check"><input type="radio" name="mapStatusConexao" data-input="map-status-conexao" value="offline" ${f.statusConexao === "offline" ? "checked" : ""}/> Somente Offline</label>
    </div>`;
}

function dropdownChecklist(campo, lista, selecionados) {
  return `
    <div class="filtros-panel-title">${campo === "subareas" ? "Subáreas Operacionais" : "Corredores Viários"}
      <div class="filtros-panel-bulk">
        <button type="button" data-action="map-bulk" data-campo="${campo}" data-valor="true">Todas</button>
        <button type="button" data-action="map-bulk" data-campo="${campo}" data-valor="false">Limpar</button>
      </div>
    </div>
    <div class="filtros-panel-search">${ICONS.search}<input type="text" data-input="map-dropdown-busca" data-campo="${campo}" placeholder="Buscar..."/></div>
    <div class="filtros-panel-list" data-lista="${campo}">
      ${lista.map((r) => `
        <label class="filtros-check" data-nome="${r.nome.toLowerCase()}">
          <input type="checkbox" data-input="map-check" data-campo="${campo}" data-alvo="${r.id}" ${selecionados.has(r.id) ? "checked" : ""}/>
          ${r.nome}
        </label>`).join("")}
    </div>`;
}

function atualizarCabecalhoMapa({ contagens, focoLabel, filtroSerializado }) {
  const inst = instances.find((i) => i.type === "mapa");
  if (!inst) return;
  if (filtroSerializado) {
    inst.config.filtros = filtroSerializado;
    saveLayout();
  }
  ["subareas", "corredores", "categorias"].forEach((campo) => {
    const btn = document.querySelector(`.map-filtro-btn[data-campo="${campo}"]`);
    if (!btn) return;
    const c = contagens[campo];
    btn.innerHTML = `${campo === "subareas" ? "Subáreas" : campo === "corredores" ? "Corredores" : "Equipamentos"} ${contagemChip(c)}`;
    btn.classList.toggle("is-active", c.sel < c.total);
  });
  const bodyEl = document.querySelector(`#widgetBody-${inst.id}`);
  if (!bodyEl) return;
  let chip = bodyEl.querySelector(".map-foco-chip");
  if (focoLabel) {
    if (!chip) {
      chip = document.createElement("div");
      chip.className = "map-foco-chip";
      bodyEl.querySelector(`#mapaEl-${inst.id}`).appendChild(chip);
    }
    chip.innerHTML = `Filtrado por: <strong>${focoLabel}</strong><button type="button" data-action="map-foco-limpar" title="Voltar à visão geral">${ICONS.x}</button>`;
  } else if (chip) {
    chip.remove();
  }
}

/* ---------- modal de configuração ---------- */

function openConfigModal(id) {
  const inst = instances.find((i) => i.id === id);
  configDraft = { instanceId: id, config: JSON.parse(JSON.stringify(inst.config)) };
  // O modelo guarda subáreas e corredores num único array "regioes". No modal a
  // gente separa em dois campos (fSubareas / fCorredores) pra não misturar tudo
  // numa lista só; em saveConfigModal os dois voltam a virar "regioes".
  const f = configDraft.config.filtros;
  if (f && Array.isArray(f.regioes)) {
    const subIds = SUBAREAS.map((s) => s.id);
    const corIds = CORREDORES.map((c) => c.id);
    f.fSubareas = f.regioes.filter((r) => subIds.includes(r));
    f.fCorredores = f.regioes.filter((r) => corIds.includes(r));
  }
  $("#configModalTitle").textContent = `Configurar — ${WIDGET_META[inst.type].label}`;
  $("#configModalBody").innerHTML = configModalBodyMarkup(inst.type, configDraft.config);
  $("#configModalOverlay").classList.add("is-open");
}
function closeConfigModal() {
  $("#configModalOverlay").classList.remove("is-open");
  configDraft = null;
}
function saveConfigModal() {
  const inst = instances.find((i) => i.id === configDraft.instanceId);
  const f = configDraft.config.filtros;
  if (f && (f.fSubareas || f.fCorredores)) {
    f.regioes = [...(f.fSubareas || []), ...(f.fCorredores || [])];
    delete f.fSubareas;
    delete f.fCorredores;
  }
  inst.config = configDraft.config;
  saveLayout();
  renderWidgetTitleColor(inst.id);
  renderWidgetBody(inst.id);
  closeConfigModal();
  toast("Configuração salva.");
}
function renderWidgetTitleColor(id) {
  const inst = instances.find((i) => i.id === id);
  const card = document.querySelector(`.grid-stack-item[gs-id="${id}"] .widget-card`);
  if (!card) return;
  card.querySelector(".widget-title").textContent = inst.config.titulo || WIDGET_META[inst.type].label;
  const cor = corHex(inst.config.cor);
  card.style.setProperty("--accent", cor);
  card.style.setProperty("--accent-tint", cor + "1a");
}

function configModalBodyMarkup(type, cfg) {
  const nome = `
    <div class="field">
      <label>Nome do Card / Título</label>
      <input type="text" data-input="modal-titulo" placeholder="${WIDGET_META[type].label}" value="${cfg.titulo || ""}" />
    </div>`;
  const cor = `
    <div class="field">
      <label>Cor</label>
      <div class="cor-picker">
        ${CORES_CARD.map((c) => `<button type="button" class="cor-swatch ${cfg.cor === c.id ? "is-active" : ""}" style="background:${c.hex}" data-action="cor-swatch" data-cor="${c.id}" title="${c.label}"></button>`).join("")}
      </div>
    </div>`;

  if (type === "dispositivos") {
    return filtrosNota() + nome + cor + `
      <div class="field">
        <label>Status de Conexão</label>
        <select data-input="modal-select" data-field="statusConexao">
          ${["todos", "online", "offline"].map((v) => `<option value="${v}" ${cfg.filtros.statusConexao === v ? "selected" : ""}>${v === "todos" ? "Todos" : v === "online" ? "Online" : "Offline"}</option>`).join("")}
        </select>
      </div>
      ${checklistField("Tipos de Dispositivo", "tipos", CATEGORIAS_EQUIPAMENTO, cfg.filtros.tipos)}
      ${regioesFields(cfg)}
    `;
  }
  if (type === "alertas") {
    return filtrosNota() + nome + cor +
      checklistField("Tipos de Dispositivo", "tipos", CATEGORIAS_EQUIPAMENTO, cfg.filtros.tipos) +
      regioesFields(cfg) +
      checklistField("Severidade dos Alertas", "severidades", SEVERIDADES.map((s) => ({ id: s, label: s })), cfg.filtros.severidades);
  }
  if (type === "regioes") {
    return filtrosNota() + nome + cor + regioesFields(cfg);
  }
  return nome;
}

// Nota no topo do modal: deixa claro que o conteúdo do card obedece ao que for
// configurado aqui (status, tipos, subáreas, corredores, severidade).
function filtrosNota() {
  return `<p class="config-modal-nota">O card mostra apenas os dados que atendem às opções abaixo.</p>`;
}

// Dois campos separados no modal: um de Subáreas, outro de Corredores.
// Trabalham sobre cfg.filtros.fSubareas / fCorredores (preenchidos em openConfigModal).
function regioesFields(cfg) {
  return (
    checklistField("Subáreas", "fSubareas", SUBAREAS.map((s) => ({ id: s.id, label: s.nome })), cfg.filtros.fSubareas || []) +
    checklistField("Corredores", "fCorredores", CORREDORES.map((c) => ({ id: c.id, label: c.nome })), cfg.filtros.fCorredores || [])
  );
}

function regioesOpcoes() {
  return [...SUBAREAS.map((s) => ({ id: s.id, label: s.nome + " (subárea)" })), ...CORREDORES.map((c) => ({ id: c.id, label: c.nome + " (corredor)" }))];
}

function universoField(field) {
  if (field === "tipos") return CATEGORIAS_EQUIPAMENTO.map((c) => c.id);
  if (field === "severidades") return [...SEVERIDADES];
  if (field === "fSubareas") return SUBAREAS.map((s) => s.id);
  if (field === "fCorredores") return CORREDORES.map((c) => c.id);
  return regioesOpcoes().map((o) => o.id);
}

function msSummaryText(field, selecionados) {
  const total = universoField(field).length;
  const sel = selecionados.length;
  if (sel === 0) return "Nenhum selecionado";
  if (sel >= total) return `Todos (${total})`;
  return `${sel} de ${total}`;
}

// Campo multi-seleção recolhível do modal de configuração: fechado por padrão,
// abre um painel com busca (só quando a lista é longa) + Todas/Limpar + checkboxes.
// Mesmo padrão visual dos filtros do widget de Mapa.
function checklistField(label, field, opcoes, selecionados) {
  const comBusca = opcoes.length > 6;
  const estreitado = selecionados.length < universoField(field).length;
  return `
    <div class="field">
      <label>${label}</label>
      <div class="ms">
        <button type="button" class="ms-trigger ${estreitado ? "is-narrowed" : ""}" data-action="ms-toggle" data-field="${field}">
          <span class="ms-summary" data-ms-summary="${field}">${msSummaryText(field, selecionados)}</span>
          <span class="ms-caret">${ICONS.chevronDown}</span>
        </button>
        <div class="ms-panel" data-ms-panel="${field}" hidden>
          ${comBusca ? `<div class="ms-panel-search">${ICONS.search}<input type="text" data-input="ms-busca" data-field="${field}" placeholder="Buscar..." /></div>` : ""}
          <div class="field-bulk">
            <button type="button" data-action="modal-bulk" data-field="${field}" data-valor="true">Todas</button>
            <button type="button" data-action="modal-bulk" data-field="${field}" data-valor="false">Limpar</button>
          </div>
          <div class="ms-list" data-checklist="${field}">
            ${opcoes.map((o) => `
              <label class="checkbox-field" data-nome="${String(o.label).toLowerCase()}">
                <input type="checkbox" data-input="modal-check" data-field="${field}" data-valor="${o.id}" ${selecionados.includes(o.id) ? "checked" : ""}/>
                ${o.label}
              </label>`).join("")}
          </div>
        </div>
      </div>
    </div>`;
}

function refreshChecklist(field) {
  const el = document.querySelector(`[data-checklist="${field}"]`);
  if (!el) return;
  $all('input[type="checkbox"]', el).forEach((chk) => {
    chk.checked = configDraft.config.filtros[field].includes(chk.dataset.valor);
  });
}

function refreshMsSummary(field) {
  const sel = configDraft.config.filtros[field];
  const el = document.querySelector(`[data-ms-summary="${field}"]`);
  if (el) el.textContent = msSummaryText(field, sel);
  const trigger = document.querySelector(`.ms-trigger[data-action="ms-toggle"][data-field="${field}"]`);
  if (trigger) trigger.classList.toggle("is-narrowed", sel.length < universoField(field).length);
}

/* ---------- wiring global (delegação de eventos) ---------- */

document.addEventListener("click", (e) => {
  const t = e.target;

  const libToggle = t.closest('[data-action="toggle-library"]');
  if (libToggle) { atualizarBibliotecaMapa(); $("#widgetLibrary").classList.toggle("is-open"); return; }

  const addBtn = t.closest('[data-action="add-widget"]');
  if (addBtn) {
    if (!addBtn.hasAttribute("disabled")) addWidget(addBtn.dataset.type);
    $("#widgetLibrary").classList.remove("is-open");
    return;
  }

  const userToggle = t.closest('[data-action="toggle-user-menu"]');
  if (userToggle) { $("#userMenuDropdown").classList.toggle("is-open"); return; }

  if (t.closest('[data-action="clear-layout"]')) {
    limparCockpit();
    $("#userMenuDropdown").classList.remove("is-open");
    return;
  }

  const removeBtn = t.closest('[data-action="widget-remove"]');
  if (removeBtn) { removeWidget(removeBtn.dataset.id); return; }

  const cfgBtn = t.closest('[data-action="widget-config-open"]');
  if (cfgBtn) { openConfigModal(cfgBtn.dataset.id); return; }

  const modo = t.closest('[data-action="modo-toggle"]');
  if (modo) { toggleModo(modo.dataset.id); return; }

  const totais = t.closest('[data-action="totais-clicar"]');
  if (totais) {
    if (!CockpitBus.mapaAtivo()) { toast("Adicione um widget de Mapa nesta tela para ver a seleção no mapa."); return; }
    const inst = instances.find((i) => i.id === totais.dataset.id);
    if (inst.type === "dispositivos") CockpitBus.aplicarFiltroCard({ tipos: inst.config.filtros.tipos, statusConexao: inst.config.filtros.statusConexao, regioes: inst.config.filtros.regioes });
    if (inst.type === "alertas") CockpitBus.aplicarFiltroCard({ tipos: inst.config.filtros.tipos, regioes: inst.config.filtros.regioes, statusAlerta: "somente-ativos" });
    if (inst.type === "regioes") CockpitBus.aplicarFiltroCard({ regioes: inst.config.filtros.regioes, tipos: CATEGORIAS_EQUIPAMENTO.map((c) => c.id) });
    return;
  }

  const listaTab = t.closest('[data-action="lista-tab"]');
  if (listaTab) {
    const inst = instances.find((i) => i.id === listaTab.dataset.id);
    inst.config.listaTab = listaTab.dataset.tab;
    inst.config.listaPagina = 1;
    saveLayout();
    renderWidgetBody(inst.id);
    return;
  }

  const listaRow = t.closest('[data-action="lista-row"]');
  if (listaRow) {
    if (!CockpitBus.mapaAtivo()) { toast("Adicione um widget de Mapa nesta tela para localizar no mapa."); return; }
    const tipo = listaRow.dataset.tipo, alvo = listaRow.dataset.alvo;
    if (tipo === "equipamento") CockpitBus.focarEquipamento(alvo);
    else CockpitBus.focarRegiao(tipo, alvo);
    return;
  }

  const listaPg = t.closest('[data-action="lista-pg"]');
  if (listaPg && !listaPg.disabled) {
    const inst = instances.find((i) => i.id === listaPg.dataset.id);
    inst.config.listaPagina = (inst.config.listaPagina || 1) + (listaPg.dataset.dir === "next" ? 1 : -1);
    saveLayout();
    renderWidgetBody(inst.id);
    return;
  }

  if (t.closest('[data-action="ver-tudo-alertas"]')) { notImplemented("Tela detalhada de Alertas"); return; }

  const mapFiltroToggle = t.closest('[data-action="map-filtro-toggle"]');
  if (mapFiltroToggle) {
    const campo = mapFiltroToggle.dataset.campo;
    const painel = document.querySelector(`.filtros-panel[data-filtro-panel="${campo}"]`);
    const jaAberto = painel.classList.contains("is-open");
    $all(".filtros-panel").forEach((p) => p.classList.remove("is-open"));
    if (!jaAberto) { painel.innerHTML = dropdownConteudo(campo); painel.classList.add("is-open"); }
    return;
  }

  const mapBulk = t.closest('[data-action="map-bulk"]');
  if (mapBulk) {
    CockpitMap.setTodas(mapBulk.dataset.campo, mapBulk.dataset.valor === "true");
    const painel = document.querySelector(`.filtros-panel[data-filtro-panel="${mapBulk.dataset.campo}"]`);
    if (painel) painel.innerHTML = dropdownConteudo(mapBulk.dataset.campo);
    return;
  }

  if (t.closest('[data-action="map-foco-limpar"]')) { CockpitMap.limparFoco(); return; }

  const msToggle = t.closest('[data-action="ms-toggle"]');
  if (msToggle) {
    const field = msToggle.dataset.field;
    const panel = document.querySelector(`[data-ms-panel="${field}"]`);
    const abrir = panel.hidden;
    $all(".ms-panel").forEach((p) => (p.hidden = true));
    $all(".ms-trigger").forEach((b) => b.classList.remove("is-open"));
    if (abrir) {
      panel.hidden = false;
      msToggle.classList.add("is-open");
      const busca = panel.querySelector('[data-input="ms-busca"]');
      if (busca) busca.focus();
    }
    return;
  }

  const modalBulk = t.closest('[data-action="modal-bulk"]');
  if (modalBulk) {
    const field = modalBulk.dataset.field;
    const valor = modalBulk.dataset.valor === "true";
    configDraft.config.filtros[field] = valor ? universoField(field) : [];
    refreshChecklist(field);
    refreshMsSummary(field);
    return;
  }

  const corSwatch = t.closest('[data-action="cor-swatch"]');
  if (corSwatch) {
    configDraft.config.cor = corSwatch.dataset.cor;
    $all(".cor-swatch", corSwatch.parentElement).forEach((s) => s.classList.remove("is-active"));
    corSwatch.classList.add("is-active");
    return;
  }

  if (t.closest('[data-action="modal-close"], [data-action="modal-cancel"]')) { closeConfigModal(); return; }
  if (t.closest('[data-action="modal-save"]')) { saveConfigModal(); return; }

  // fecha popovers/dropdowns ao clicar fora
  if (!t.closest(".widget-library-wrap")) $("#widgetLibrary").classList.remove("is-open");
  if (!t.closest(".user-menu")) $("#userMenuDropdown").classList.remove("is-open");
  if (!t.closest(".map-filtro-btn-wrap")) $all(".filtros-panel").forEach((p) => p.classList.remove("is-open"));
  if (!t.closest(".ms")) {
    $all(".ms-panel").forEach((p) => (p.hidden = true));
    $all(".ms-trigger").forEach((b) => b.classList.remove("is-open"));
  }
});

document.addEventListener("input", (e) => {
  const t = e.target;

  if (t.matches('[data-input="lista-busca"]')) {
    const inst = instances.find((i) => i.id === t.dataset.id);
    inst.config.listaBusca = t.value;
    inst.config.listaPagina = 1;
    saveLayout();
    const scroll = t.closest(".widget-body").querySelector(".lista-scroll");
    // re-renderiza só a lista, preservando o foco do campo de busca
    const inner = inst.type === "dispositivos" ? listaDispositivosMarkup(inst) : inst.type === "alertas" ? listaAlertasMarkup(inst) : listaRegioesMarkup(inst);
    const body = t.closest(".widget-body");
    body.innerHTML = inner;
    body.querySelector('[data-input="lista-busca"]').focus();
    body.querySelector('[data-input="lista-busca"]').setSelectionRange(t.value.length, t.value.length);
    return;
  }

  if (t.matches('[data-input="map-busca"]')) return; // tratado no keydown (Enter)

  if (t.matches('[data-input="map-dropdown-busca"]')) {
    const campo = t.dataset.campo;
    const q = t.value.toLowerCase();
    const lista = document.querySelector(`[data-lista="${campo}"]`);
    $all("label", lista).forEach((label) => {
      label.style.display = label.dataset.nome.includes(q) ? "flex" : "none";
    });
    return;
  }

  if (t.matches('[data-input="modal-titulo"]')) { configDraft.config.titulo = t.value; return; }

  if (t.matches('[data-input="ms-busca"]')) {
    const q = t.value.toLowerCase();
    const lista = document.querySelector(`.ms-list[data-checklist="${t.dataset.field}"]`);
    if (lista) $all("label", lista).forEach((l) => { l.style.display = (l.dataset.nome || "").includes(q) ? "flex" : "none"; });
    return;
  }

  if (t.matches('[data-input="modal-check"]')) {
    const field = t.dataset.field, valor = t.dataset.valor;
    const arr = configDraft.config.filtros[field];
    const i = arr.indexOf(valor);
    if (t.checked && i === -1) arr.push(valor);
    if (!t.checked && i !== -1) arr.splice(i, 1);
    refreshMsSummary(field);
    return;
  }

  if (t.matches('[data-input="modal-radio"], [data-input="modal-select"]')) { configDraft.config.filtros[t.dataset.field] = t.value; return; }
});

document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.matches('[data-input="map-check"]')) {
    const campo = t.dataset.campo, alvo = t.dataset.alvo;
    if (campo === "categorias") CockpitMap.toggleCategoria(alvo);
    if (campo === "subareas") CockpitMap.toggleSubarea(alvo);
    if (campo === "corredores") CockpitMap.toggleCorredor(alvo);
  }
  if (t.matches('[data-input="map-status-alerta"]')) CockpitMap.setStatusAlerta(t.value);
  if (t.matches('[data-input="map-status-conexao"]')) CockpitMap.setStatusConexao(t.value);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.matches('[data-input="map-busca"]')) {
    const resultado = CockpitMap.buscar(e.target.value);
    if (!resultado) toast("Nada encontrado com esse termo.");
  }
});

/* ---------- boot ---------- */

document.addEventListener("DOMContentLoaded", () => {
  initGrid();
  LiveState.start(6000);
  // Card Totais reflete o "tempo real" sozinho (critério das 3 histórias). A Lista
  // Detalhada só atualiza quando o operador interage (busca/pagina/troca aba) pra
  // não roubar o foco do campo de busca a cada tick.
  LiveState.subscribe(() => {
    instances.forEach((inst) => {
      if (inst.type !== "mapa" && inst.config.modo === "totais") renderWidgetBody(inst.id);
    });
  });
});
