/* ==========================================================================
   Cockpit — grid de widgets: adicionar/mover/redimensionar/configurar/remover,
   persistência por "perfil" (localStorage, 1 tela por usuário — fora de escopo
   compartilhar entre usuários, ver 00 - epic - Cockpit.md) e a renderização de
   cada tipo de widget. O Mapa (map.js) só cuida do Leaflet; tudo que é chrome
   de card, dropdown de filtro e modal de configuração mora aqui.
   ========================================================================== */

// layout salvo separado por versão (versoes.js) e por cockpit (cockpits.js; o primeiro mantém a chave de sempre)
const STORAGE_KEY = Cockpits.chaveLayout(Versoes.chaveLayout("cockpitLayoutV1"));

/* Filtro geral da tela (EXPERIMENTO): tipos de dispositivo que valem para TODOS os widgets, por cima do que cada um
   escolhe na própria configuração (vale a interseção). Mapa, Dispositivos, Alertas e Resumo obedecem. */
const CHAVE_FILTRO_GERAL = "cockpitFiltroGeralV1";
let filtroGeral = { tipos: CATEGORIAS_EQUIPAMENTO.map((c) => c.id) };
try {
  const salvo = JSON.parse(localStorage.getItem(CHAVE_FILTRO_GERAL) || "null");
  if (salvo && Array.isArray(salvo.tipos)) filtroGeral.tipos = CATEGORIAS_EQUIPAMENTO.map((c) => c.id).filter((id) => salvo.tipos.includes(id));
} catch (e) { /* sem localStorage: fica com todos os tipos */ }
if (!Versoes.tem("filtro-geral")) filtroGeral.tipos = CATEGORIAS_EQUIPAMENTO.map((c) => c.id); // filtro salvo de outra versão não vale aqui
const tipoNoGeral = (id) => filtroGeral.tipos.includes(id);
const tiposComGeral = (lista) => lista.filter(tipoNoGeral);

const ICONS = {
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9.9 5.2A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7c1.7 0 3.2-.4 4.5-1M3 3l18 18"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
  chevronLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m15 18-6-6 6-6"/></svg>',
  chevronRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m9 18 6-6-6-6"/></svg>',
  chevronDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m6 9 6 6 6-6"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  mapPin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
  cpu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>',
  alertTriangle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></svg>',
  layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/></svg>',
  hash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
  externalLink: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/></svg>',
  dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  grip: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.6"/><circle cx="15" cy="5" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="19" r="1.6"/><circle cx="15" cy="19" r="1.6"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15a1 1 0 0 0 1.5.87l12-7.5a1 1 0 0 0 0-1.74l-12-7.5A1 1 0 0 0 7 4.5Z"/></svg>',
};

const WIDGET_META = {
  mapa: { label: "Mapa", desc: "Visualização geográfica e espacial interativa de dispositivos, subáreas e corredores.", icon: ICONS.mapPin, unico: true },
  dispositivos: { label: "Dispositivos", desc: "Monitoramento gerencial de quantitativo dos equipamentos.", icon: ICONS.cpu, unico: false },
  alertas: { label: "Alertas", desc: "Acompanhamento de falhas ativas.", icon: ICONS.alertTriangle, unico: false },
  regioes: { label: "Subáreas e Corredores", desc: "Exibição dos dispositivos agrupados em subáreas ou corredores.", icon: ICONS.layers, unico: false },
  resumo: { label: "Resumo", desc: "Totais da operação e legenda do mapa.", icon: ICONS.dashboard, unico: true },
  notificacoes: { label: "Notificações", desc: "Feed do que está acontecendo agora: alarmes, dispositivos offline, modo Operador.", icon: ICONS.bell, unico: false },
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
          soProblemas: false, // derivado de modoAlertas (map.js)
          modoAlertas: "todos", // seletor Todos / Todos + alertas / Só alertas (map.js, setModoAlertas)
        },
      };
    case "dispositivos":
      return {
        titulo: "",
        cor: "azul",
        modo: "totais",
        filtros: { statusConexao: "todos", agrupar: "tipo", tipos: CATEGORIAS_EQUIPAMENTO.map((c) => c.id), regioes: todasRegioesIds() },
        listaBusca: "",
        listaPagina: 1,
      };
    case "alertas":
      return {
        titulo: "",
        cor: "vermelho",
        modo: "totais",
        filtros: { agrupar: "alarme", tipos: CATEGORIAS_EQUIPAMENTO.map((c) => c.id), regioes: todasRegioesIds(), severidades: [...SEVERIDADES] },
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
    case "resumo":
      // sem filtros nem lista: só totais. modo "totais" fixo pra re-renderizar a cada tick do LiveState
      // filtros.tipos = tipos de dispositivo que o Resumo cobre (config do widget); só controladores por padrão.
      return { titulo: "", cor: "azul", modo: "totais", filtros: { tipos: ["semaforo"] } };
    case "notificacoes":
      // só lista (modo fixo "lista"); sem filtros nesta rodada de teste
      return { titulo: "", cor: "azul", modo: "lista", filtros: {} };
  }
}

function defaultSize(type) {
  switch (type) {
    case "mapa": return { w: 8, h: 7 };
    case "dispositivos": return { w: 3, h: 3 };
    case "alertas": return { w: 4, h: 4 };
    case "regioes": return { w: 4, h: 4 };
    case "resumo": return { w: 3, h: 5 };
    case "notificacoes": return { w: 3, h: 6 };
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

// Primeiro acesso = a chave do layout ainda não existe (layout vazio salvo NÃO conta).
function primeiroAcesso() {
  try {
    return localStorage.getItem(STORAGE_KEY) === null;
  } catch (e) {
    return false; // sem localStorage não dá para saber; mantém a tela vazia
  }
}

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
    CockpitMap.enquadrarVisiveis();
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
  // Clique numa linha da lista de Regiões: abre o painel lateral com os dados da região, filtra
  // o mapa só por ela e a enquadra. Cliques seguintes trocam a região do painel e do filtro.
  selecionarRegiao(tipo, id) {
    if (!this.mapaAtivo()) return;
    CockpitMap.focarRegiao(tipo, id, { enquadrar: false });
    CockpitMap.selecionarRegiao(tipo, id);
    CockpitMap.enquadrarSelecao();
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
  if (!el) return;
  // Só rola se o widget estiver fora da área visível. Com "nearest" puro, um widget um pouco mais alto que a tela (o Mapa da
  // tela padrão passa uns 45 px) rolava a página a cada clique no mapa, e a tela "puxava para cima".
  const area = (el.closest(".cockpit-canvas") || document.documentElement).getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const visivel = Math.min(r.bottom, area.bottom) - Math.max(r.top, area.top);
  if (visivel > Math.min(r.height, area.height) * 0.5) return;
  el.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/* ---------- filtragem de dados por config de widget ---------- */

function equipamentosFiltrados(filtros) {
  return LiveState.getEquipamentos().filter((eq) => {
    if (!filtros.tipos.includes(eq.tipo) || !tipoNoGeral(eq.tipo)) return false;
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
    if (!filtros.tipos.includes(eq.tipo) || !tipoNoGeral(eq.tipo)) return false;
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
    float: Versoes.atual >= 3, // v1/v2: widgets sobem sozinhos e não deixam buraco na tela (v3 mantém o posicionamento livre)
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
    if (inst && inst.type === "regioes") renderWidgetBody(id); // recalcula linhas por página
    aplicarTamanhoResponsivo(id);
  });

  const primeira = primeiroAcesso(); // antes de reconciliarRegioes(), que grava o layout (mesmo vazio)
  // widget de tipo que a versão não tem não monta (e sai do layout desta versão ao salvar)
  const saved = loadLayout().filter((i) => widgetNaVersao(i.type, i.config));
  instances = saved;
  reconciliarRegioes();
  if (primeira) {
    // nunca salvou nada neste navegador: abre a Tela inicial. Quem limpar a tela depois cai
    // na tela vazia normalmente (aí o layout salvo existe, só que vazio).
    showEmptyState(false);
    montarWidgetsDoPreset(PRESETS.find((p) => p.id === (Versoes.atual === 2 ? "inicial-v2" : "inicial")));
    saveLayout();
  } else if (saved.length === 0) {
    showEmptyState(true);
  } else {
    instances.forEach((inst) => mountWidget(inst, false));
    showEmptyState(false);
    if (!grid.float) grid.compact(); // layout salvo com buracos (feito com posicionamento livre) é recompactado
  }
}

/* ---------- regiões cadastradas x filtros já salvos ---------- */

// Filtros salvos no localStorage guardam ids de região. Região cadastrada depois (por
// mim em outro navegador, ou pelo ?admin) não está neles e ficaria "desmarcada" para
// sempre, escondida do mapa e sem como clicar nela. Cada widget guarda em `regioesVistas`
// os ids que já viu: id novo entra marcado; id que sumiu do banco é tirado; o que o
// usuário desmarcou de propósito continua desmarcado.
// `regioesVistas` mora DENTRO do widget (e não numa chave à parte do localStorage) para ser
// gravada na mesma escrita do filtro. Duas chaves separadas saíam de sincronia quando
// outra aba escrevia por cima do layout: o id ficava "visto" sem nunca ter entrado no filtro.
function reconciliarRegioes() {
  const atuais = new Set(todasRegioesIds());
  localStorage.removeItem("cockpitRegioesConhecidasV1"); // chave da versão anterior (ver acima)

  instances.forEach((inst) => {
    const f = inst.config && inst.config.filtros;
    if (!f) return;
    // widget salvo antes deste campo existir (ou criado por outra via): nada visto ainda,
    // então toda região que faltar no filtro entra. Corrige o filtro que ficou sem regiões.
    const vistas = new Set(inst.regioesVistas || []);
    const novas = [...atuais].filter((id) => !vistas.has(id));
    ["regioes", "subareas", "corredores"].forEach((campo) => {
      if (!Array.isArray(f[campo])) return;
      f[campo] = f[campo].filter((id) => atuais.has(id));
      novas.forEach((id) => {
        // pelo tipo real da região, não pelo prefixo do id (id oficial importado pode não ter "SA-")
        const cabe = campo === "regioes" || (campo === "subareas" ? SUBAREAS : CORREDORES).some((r) => r.id === id);
        if (cabe && !f[campo].includes(id)) f[campo].push(id);
      });
    });
    inst.regioesVistas = [...atuais];
  });

  saveLayout();
}

// Chamado pelo modo admin depois de cadastrar/renomear/excluir uma região.
function aoMudarRegioes() {
  reatribuirRegioes();
  reconciliarRegioes();
  const mapa = instances.find((i) => i.type === "mapa");
  if (mapa) {
    CockpitMap.setFiltroRegioes(mapa.config.filtros.subareas, mapa.config.filtros.corredores);
    ["subareas", "corredores"].forEach((campo) => {
      const painel = document.querySelector(`[data-filtro-panel="${campo}"]`);
      if (painel) painel.innerHTML = dropdownConteudo(campo);
    });
  }
  instances.forEach((inst) => {
    if (inst.type !== "mapa") renderWidgetBody(inst.id);
  });
}

/* ---------- modo admin (cadastro de corredor/área, escondido) ---------- */

// Abrir o Cockpit com ?admin liga (e o navegador lembra); ?admin=0 desliga. Sem isso
// nenhum controle de cadastro chega a ser carregado.
const ADMIN_KEY = "cockpitAdminV1";

function adminAtivo() {
  const params = new URLSearchParams(location.search);
  try {
    if (params.has("admin")) {
      if (params.get("admin") === "0") localStorage.removeItem(ADMIN_KEY);
      else localStorage.setItem(ADMIN_KEY, "1");
    }
    return localStorage.getItem(ADMIN_KEY) === "1";
  } catch (e) {
    return params.has("admin") && params.get("admin") !== "0";
  }
}

function carregarAdmin() {
  document.body.classList.add("modo-admin"); // já na abertura: o menu do avatar depende dela e o admin.js carrega depois
  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = "assets/admin.css";
  document.head.appendChild(css);
  const js = document.createElement("script");
  js.src = "assets/admin.js";
  document.body.appendChild(js);
}

function showEmptyState(show) {
  $("#cockpitEmpty").hidden = !show;
  $(".grid-stack").style.display = show ? "none" : "block";
}

// "mapa" é a base de todas as versões; os demais widgets entram conforme versoes.js
// `cfg` (opcional): o widget de Alertas agrupado por severidade só existe nas versões que têm esse agrupamento.
const widgetNaVersao = (type, cfg) =>
  (type === "mapa" || Versoes.tem("widget." + type)) &&
  !(type === "alertas" && cfg && cfg.filtros && cfg.filtros.agrupar === "severidade" && !Versoes.tem("alertas.agrupar-severidade"));

function addWidget(type) {
  const meta = WIDGET_META[type];
  if (!widgetNaVersao(type)) return;
  if (meta.unico && instances.some((i) => i.type === type)) {
    toast(`Já existe um widget de ${meta.label} nesta tela — instância única nesta fase.`);
    return;
  }
  const id = "w-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const size = defaultSize(type);
  const inst = { id, type, x: null, y: null, w: size.w, h: size.h, config: defaultConfig(type), regioesVistas: todasRegioesIds() };
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
  toast(`Cockpit limpo, ${n} widget${n === 1 ? "" : "s"} removido${n === 1 ? "" : "s"}.`, {
    label: "Desfazer",
    fn: () => restaurarWidgets(snapshot),
  });
}

/* ---------- Telas de exemplo ----------
   Prévia discreta do multi-tela (por enquanto ainda é 1 tela por usuário). Ficam
   no menu do avatar e servem de vitrine: cada uma usa recursos diferentes do
   Cockpit (integração com o Mapa, modo totais x lista, filtro por tipo/região/
   severidade, renomear e colorir card, e até uma tela sem Mapa). Carregar uma
   substitui o que estiver na tela. */
const PRESETS = [
  {
    // Tela do primeiro acesso da v2 (capturada com cockpitDump() em 2026-10-07): mapa à esquerda; à direita, dois totais e
    // três listas de alertas (por alarme, por dispositivo e a lista completa). Só aparece na v2 (soVersao).
    id: "inicial-v2",
    soVersao: 2,
    nome: "Tela inicial (v2)",
    descricao: "Mapa à esquerda; à direita, totais de alertas, alertas agrupados por alarme e por dispositivo e a lista completa. É a tela do primeiro acesso da v2.",
    widgets: [
      // Mapa estático (mostra tudo, sem seletor de alertas): o estado dos pinos só aparece ao clicar num card/grupo de Alertas.
      { type: "mapa", x: 0, y: 0, w: 6, h: 12, config: { filtros: { modoAlertas: "todos" } } },
      { type: "alertas", x: 6, y: 0, w: 2, h: 4, config: { modo: "totais", filtros: { agrupar: "alarme" } } },
      { type: "alertas", x: 6, y: 4, w: 2, h: 3, config: { modo: "totais", filtros: { agrupar: "alarme" } } },
      { type: "alertas", x: 8, y: 0, w: 2, h: 7, config: { modo: "lista", filtros: { agrupar: "alarme" } } },
      { type: "alertas", x: 10, y: 0, w: 2, h: 7, config: { modo: "lista", filtros: { agrupar: "dispositivo" } } },
      { type: "alertas", x: 6, y: 7, w: 6, h: 5, config: { modo: "lista", filtros: { agrupar: "nenhum" } } },
    ],
  },
  {
    id: "inicial",
    soVersao: 0, // as demais versões (v1, v3)
    nome: "Tela inicial",
    descricao: "Resumo e mapa em cima, com a lista de subáreas e corredores ao lado; embaixo, alertas agrupados (por alarme, severidade e dispositivo), a lista completa e os totais de dispositivos. É a tela do primeiro acesso.",
    // Layout montado à mão e capturado com cockpitDump(). Só entra o que difere do defaultConfig: as listas de
    // regiões/tipos/severidades ficam de fora de propósito (o padrão já é "todas" e acompanha regiões novas).
    // Atenção: alertas sem `agrupar` valem "alarme" no defaultConfig, então a lista simples pede "nenhum" explícito.
    widgets: [
      { type: "resumo", x: 0, y: 0, w: 2, h: 10 },
      { type: "mapa", x: 2, y: 0, w: 8, h: 10 },
      { type: "regioes", x: 10, y: 0, w: 2, h: 14, config: { modo: "lista", listaOrdem: { campo: "falhas" } } },
      { type: "alertas", x: 0, y: 10, w: 3, h: 13, config: { modo: "lista", filtros: { agrupar: "nenhum" } } },
      { type: "alertas", x: 3, y: 10, w: 2, h: 4, config: { modo: "lista", filtros: { agrupar: "severidade" } } },
      { type: "alertas", x: 5, y: 10, w: 3, h: 4, config: { modo: "lista", filtros: { agrupar: "alarme" } } },
      { type: "alertas", x: 8, y: 10, w: 2, h: 4, config: { modo: "lista", filtros: { agrupar: "dispositivo" } } },
      { type: "dispositivos", x: 3, y: 14, w: 3, h: 3 },
      { type: "dispositivos", x: 6, y: 14, w: 3, h: 3 },
      { type: "dispositivos", x: 3, y: 17, w: 3, h: 3 },
      { type: "dispositivos", x: 6, y: 17, w: 3, h: 3 },
      { type: "dispositivos", x: 3, y: 20, w: 3, h: 3 },
      { type: "dispositivos", x: 6, y: 20, w: 3, h: 3 },
      { type: "dispositivos", x: 9, y: 14, w: 3, h: 9 },
    ],
  },
  {
    id: "geral",
    nome: "Visão geral",
    descricao: "Faixa de totais em cima (alertas, dispositivos, regiões) e o mapa em largura total embaixo.",
    widgets: [
      { type: "alertas", x: 0, y: 0, w: 4, h: 3, config: { titulo: "Alertas ativos", cor: "vermelho" } },
      { type: "dispositivos", x: 4, y: 0, w: 4, h: 3, config: { titulo: "Dispositivos", cor: "azul" } },
      { type: "regioes", x: 8, y: 0, w: 4, h: 3, config: { cor: "roxo" } },
      { type: "mapa", x: 0, y: 3, w: 12, h: 7 },
    ],
  },
  {
    id: "alertas",
    nome: "Plantão de alertas",
    descricao: "Coluna à esquerda com equipamentos offline e a lista de alertas crítico/alto; o mapa, filtrado em offline, ocupa a direita.",
    widgets: [
      { type: "dispositivos", x: 0, y: 0, w: 5, h: 2, config: { titulo: "Equipamentos offline", cor: "amarelo", filtros: { statusConexao: "offline", agrupar: "nenhum" } } },
      { type: "alertas", x: 0, y: 2, w: 5, h: 7, config: { titulo: "Alertas crítico e alto", cor: "vermelho", modo: "lista", filtros: { severidades: ["Crítico", "Alto"] } } },
      { type: "mapa", x: 5, y: 0, w: 7, h: 9, config: { filtros: { statusConexao: "offline" } } },
    ],
  },
  {
    id: "regioes",
    nome: "Corredores e subáreas",
    descricao: "Coluna estreita à esquerda: totais de dispositivos e a lista de subáreas e corredores; mapa grande à direita.",
    widgets: [
      { type: "dispositivos", x: 0, y: 0, w: 3, h: 3, config: { titulo: "Dispositivos", cor: "verde" } },
      { type: "regioes", x: 0, y: 3, w: 3, h: 6, config: { titulo: "Subáreas e Corredores", cor: "roxo", modo: "lista" } },
      { type: "mapa", x: 3, y: 0, w: 9, h: 10 },
    ],
  },
  {
    id: "centro",
    nome: "Controladores e câmeras",
    descricao: "Tela sem mapa: totais de semáforos, lista de câmeras e alertas.",
    widgets: [
      { type: "dispositivos", x: 0, y: 0, w: 4, h: 4, config: { titulo: "Controladores", cor: "amarelo", filtros: { tipos: ["semaforo"] } } },
      { type: "dispositivos", x: 4, y: 0, w: 8, h: 8, config: { titulo: "Câmeras", cor: "azul", modo: "lista", filtros: { tipos: ["camera"], agrupar: "nenhum" } } },
      { type: "alertas", x: 0, y: 4, w: 4, h: 4, config: { titulo: "Alertas", cor: "vermelho" } },
    ],
  },
  {
    id: "mapa",
    nome: "Mapa em foco",
    descricao: "Mapa grande no centro, com listas de dispositivos, alertas e regiões em volta.",
    widgets: [
      { type: "mapa", x: 0, y: 0, w: 8, h: 7 },
      { type: "dispositivos", x: 8, y: 0, w: 4, h: 4, config: { titulo: "Dispositivos", cor: "azul", modo: "lista" } },
      { type: "alertas", x: 8, y: 4, w: 4, h: 3, config: { titulo: "Alertas ativos", cor: "vermelho", modo: "lista" } },
      { type: "regioes", x: 0, y: 7, w: 8, h: 3, config: { titulo: "Subáreas e Corredores", cor: "roxo", modo: "lista" } },
    ],
  },
  {
    id: "listas",
    nome: "Alertas em lista",
    descricao: "Sem mapa: equipamentos offline e todos os alertas, lado a lado em Lista Detalhada.",
    widgets: [
      { type: "dispositivos", x: 0, y: 0, w: 4, h: 9, config: { titulo: "Equipamentos offline", cor: "amarelo", modo: "lista", filtros: { statusConexao: "offline", agrupar: "nenhum" } } },
      { type: "alertas", x: 4, y: 0, w: 8, h: 9, config: { titulo: "Alertas", cor: "vermelho", modo: "lista" } },
    ],
  },
  {
    id: "alertas-mapa",
    nome: "Alertas com mapa",
    descricao: "Mapa e lista de dispositivos em cima; faixa de alertas ativos em Lista Detalhada ocupando a largura embaixo.",
    widgets: [
      { type: "mapa", x: 0, y: 0, w: 8, h: 8 },
      { type: "dispositivos", x: 8, y: 0, w: 4, h: 8, config: { titulo: "Dispositivos", cor: "azul", modo: "lista" } },
      { type: "alertas", x: 0, y: 8, w: 12, h: 5, config: { titulo: "Alertas ativos", cor: "vermelho", modo: "lista" } },
    ],
  },
];

function aplicarPreset(presetId) {
  const preset = PRESETS.find((p) => p.id === presetId);
  if (!preset) return;
  // troca de tela é ação explícita: limpa sem oferecer desfazer
  [...instances].forEach((i) => removeWidget(i.id, { comDesfazer: false }));
  showEmptyState(false);
  montarWidgetsDoPreset(preset);
  saveLayout();
  atualizarBibliotecaMapa();
  toast(`Tela de exemplo "${preset.nome}" carregada.`);
}

// Cria e monta os widgets de um preset. Filtros de região vêm do defaultConfig (todas as
// regiões cadastradas), então a tela acompanha regiões novas em vez de guardar ids.
function montarWidgetsDoPreset(preset) {
  let widgets = preset.widgets.filter((w) => widgetNaVersao(w.type, w.config));
  // só sobrou o mapa: ocupa a tela toda em vez de ficar no meio com vão dos lados
  if (widgets.length && widgets.every((w) => w.type === "mapa")) widgets = widgets.map((w) => ({ ...w, x: 0, w: 12 }));
  widgets.forEach((w, idx) => {
    const base = defaultConfig(w.type);
    const ov = w.config || {};
    const inst = {
      id: "w-" + Date.now().toString(36) + idx + Math.random().toString(36).slice(2, 6),
      type: w.type,
      x: w.x, y: w.y, w: w.w, h: w.h,
      config: { ...base, ...ov, filtros: { ...base.filtros, ...(ov.filtros || {}) } },
      regioesVistas: todasRegioesIds(),
    };
    instances.push(inst);
    mountWidget(inst, false);
  });
}

// Dev: monta a tela, ajusta na mão (arrasta / redimensiona / configura) e chama
// cockpitDump() no console. Ele imprime e copia pro clipboard o layout atual já
// no formato do array `widgets` de um PRESET, pronto pra colar aqui em cima.
window.cockpitDump = function () {
  const widgets = instances.map((i) => ({
    type: i.type, x: i.x, y: i.y, w: i.w, h: i.h, config: i.config,
  }));
  const txt = JSON.stringify(widgets, null, 2);
  try { navigator.clipboard.writeText(txt); } catch (e) {}
  console.log("%ccockpitDump — copiado pro clipboard:", "font-weight:bold");
  console.log(txt);
  return widgets;
};

// Adapta o widget a "compacto" quando fica pequeno demais pro layout padrão
// (critério de responsividade das histórias de card — ver data-size no CSS).
function observarTamanho(el, id) {
  const ro = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const card = entry.target.querySelector(".widget-card");
      if (!card) continue;
      card.setAttribute("data-size", entry.contentRect.width < 230 ? "sm" : "md");
    }
    // A lista de Regiões mede quantas linhas cabem no card. A 1ª medida, logo ao montar, pode sair antes
    // do grid dar o tamanho final ao card (e só a lista de 6 linhas padrão aparecia); o observer dispara
    // quando o tamanho se assenta e refaz a medida. Só redesenha se o nº de linhas mudou, então não entra em laço.
    const inst = instances.find((i) => i.id === id);
    const body = document.querySelector(`#widgetBody-${id}`);
    if (inst && body && inst.type === "regioes" && inst.config.modo !== "totais") ajustarLinhasPorPagina(inst, body);
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
        <div class="widget-title">${titulo}</div>
        <div class="widget-header-right">
          <div class="widget-header-actions">
            ${inst.type === "mapa" || inst.type === "notificacoes" ? "" : `<button type="button" class="widget-icon-btn" data-action="widget-config-open" data-id="${inst.id}" title="Configurar card">${ICONS.gear}</button>`}
            <button type="button" class="widget-icon-btn is-danger" data-action="widget-remove" data-id="${inst.id}" title="Remover widget">${ICONS.trash}</button>
          </div>
          ${inst.type !== "mapa" && inst.type !== "resumo" && inst.type !== "notificacoes" ? modoToggleMarkup(inst) : ""}
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
  if (inst.type === "resumo") {
    body.innerHTML = resumoMarkup(inst);
    return;
  }
  if (inst.type === "notificacoes") {
    fecharMenuNotificacao(); // o feed se redesenha a cada evento novo: um menu aberto ficaria apontando para a linha errada
    body.innerHTML = notificacoesMarkup();
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
    if (inst.config.modo !== "totais") {
      ajustarLarguraOrdem(body);
      ajustarLinhasPorPagina(inst, body);
    }
    return;
  }
}

/* ---------- widget Notificações (v3, teste inicial) ---------- */

const NOTIFICACAO_TIPOS = {
  alarme: { rotulo: "Alarme", cor: "#e0342b" },
  offline: { rotulo: "Offline", cor: "#b42318" },
  operador: { rotulo: "Modo Operador", cor: "#2563eb" },
  plano: { rotulo: "Plano", cor: "#0f766e" },
  tabela: { rotulo: "Tabela", cor: "#7c3aed" },
};

function notificacoesMarkup() {
  const eventos = LiveState.getEventos();
  if (!eventos.length) return `<div class="notif-vazio">Nenhuma notificação hoje. Os eventos do dia aparecem aqui assim que acontecem.</div>`;
  const cabecalho = `<li class="notif-cab" aria-hidden="true"><span></span><span>Evento</span><span class="notif-hora-cab">Data e hora</span><span></span></li>`;
  return `<ul class="notif-lista">${cabecalho}${eventos.map((e) => {
    const t = NOTIFICACAO_TIPOS[e.tipo] || NOTIFICACAO_TIPOS.alarme;
    const d = new Date(e.ts);
    const data = d.toLocaleDateString("pt-BR");
    const hora = d.toLocaleTimeString("pt-BR");
    // ações no fim da linha: localizar no mapa (cor do tipo do evento) e o menu "..." com mais opções
    return `<li class="notif-item" style="--tipo-cor:${t.cor}">
      <span class="notif-ponto" style="background:${t.cor}" title="${t.rotulo}" aria-hidden="true"></span>
      <div class="notif-corpo"><div class="notif-texto" title="${e.texto}">${e.texto}</div><div class="notif-onde" title="${e.nome}">${e.nome}</div></div>
      <time class="notif-hora" datetime="${d.toISOString()}"><span>${data}</span><span>${hora}</span></time>
      <div class="notif-acoes">
        <button type="button" class="notif-loc" data-action="notificacao-row" data-eq="${e.equipamentoId}" title="Ver no mapa" aria-label="Ver ${e.nome} no mapa">${ICONS.mapPin}</button>
      </div>
    </li>`;
  }).join("")}</ul>`;
}

// Menu "..." da linha. Fica no body (posição fixa) porque a lista do widget corta o que passa da borda.
// HIPÓTESE NÃO VALIDADA: quais ações entram no menu. "Ver histórico" abre o Dashboard de Alertas (outra aba do navegador).
// Local: o dashboard roda em outra porta (_serve.ps1 do dashboard-alertas-prototipo = 8748). Publicado: trocar pela URL real.
const URL_DASH_ALERTAS = location.hostname === "localhost" ? "http://localhost:8748/" : "../dashboard-alertas-prototipo/index.html";
let menuNotificacao = null;
function fecharMenuNotificacao() {
  if (menuNotificacao) menuNotificacao.remove();
  menuNotificacao = null;
}
function abrirMenuNotificacao(btn) {
  const eraDoMesmo = menuNotificacao && menuNotificacao.dataset.eq === btn.dataset.eq && menuNotificacao.dataset.hora === btn.closest(".notif-item").querySelector("time").getAttribute("datetime");
  fecharMenuNotificacao();
  if (eraDoMesmo) return;
  const r = btn.getBoundingClientRect();
  const el = document.createElement("div");
  el.className = "notif-menu";
  el.setAttribute("role", "menu");
  el.dataset.eq = btn.dataset.eq;
  el.dataset.hora = btn.closest(".notif-item").querySelector("time").getAttribute("datetime");
  el.innerHTML = `
    <button type="button" role="menuitem" data-action="notificacao-menu-item" data-acao="detalhes" data-eq="${btn.dataset.eq}">Abrir detalhes</button>
    <button type="button" role="menuitem" data-action="notificacao-menu-item" data-acao="historico" data-eq="${btn.dataset.eq}">Ver histórico (30 dias)</button>`;
  document.body.appendChild(el);
  const w = el.offsetWidth;
  el.style.top = `${Math.min(r.bottom + 4, innerHeight - el.offsetHeight - 8)}px`;
  el.style.left = `${Math.max(8, Math.min(r.right - w, innerWidth - w - 8))}px`;
  menuNotificacao = el;
}
document.addEventListener("click", (ev) => {
  if (menuNotificacao && !ev.target.closest(".notif-menu") && !ev.target.closest('[data-action="notificacao-mais"]')) fecharMenuNotificacao();
});
document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") fecharMenuNotificacao(); });

/* ---------- resumo do filtro ativo (legenda do Card Totais) ---------- */

function resumoFiltroCard(inst) {
  const f = inst.config.filtros;
  const partes = [];
  if (inst.type === "dispositivos" || inst.type === "alertas") {
    const tot = CATEGORIAS_EQUIPAMENTO.length;
    const tipos = tiposComGeral(f.tipos); // o filtro geral da tela entra por cima
    if (tipos.length >= tot) partes.push("Todos os tipos");
    else if (tipos.length === 0) partes.push("Nenhum tipo");
    else if (tipos.length <= 2) partes.push(tipos.map(categoriaLabel).join(", "));
    else partes.push(`${tipos.length} tipos`);
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
  else if (f.regioes.length <= 2) partes.push(f.regioes.map(regiaoLabel).join(", "));
  else partes.push(`${f.regioes.length} de ${totReg} regiões`);
  return partes.join(" · ");
}

// Nome curto de uma região pra legenda do card: subárea vem como está ("Centro"),
// corredor perde a parte descritiva depois do travessão ("Av. X — trecho Y" vira "Av. X").
function regiaoLabel(id) {
  const s = SUBAREAS.find((x) => x.id === id);
  if (s) return s.nome;
  const c = CORREDORES.find((x) => x.id === id);
  return c ? c.nome.split(" — ")[0].trim() : id;
}

// Texto completo pro title (hover) do resumo: nomes inteiros das regiões
// selecionadas quando o card está filtrado, já que a legenda encurta a lista.
function resumoFiltroTitle(inst) {
  const f = inst.config.filtros;
  const totReg = SUBAREAS.length + CORREDORES.length;
  if (!f.regioes || f.regioes.length === 0 || f.regioes.length >= totReg) return "";
  const nomes = f.regioes.map((id) => {
    const s = SUBAREAS.find((x) => x.id === id);
    if (s) return s.nome;
    const c = CORREDORES.find((x) => x.id === id);
    return c ? c.nome : id;
  });
  return "Regiões: " + nomes.join(", ");
}

/* ---------- Resumo (totais da operação + legenda do mapa) ---------- */

const MODOS_CONTROLE = [
  { id: "centro", label: "Centro" },
  { id: "operador", label: "Operador" }, // na bolinha do pino no mapa: azul
  { id: "local", label: "Local" },
];

// Cada linha é um filtro do Mapa (CockpitMap.setFiltroResumo): um valor por grupo ("modo", "estado"),
// clicar de novo limpa. Os dois grupos se combinam (ex.: Modo Operador + Offline).
// Só controladores (é o que o mapa mostra). Modo de controle é dado SIMULADO por ora
// (LiveState.modoDoControlador) — HIPÓTESE NÃO VALIDADA, o real vem da tabela de programação.
// Tipos que o Resumo cobre (config do widget). Layout salvo antes deste campo existir cai em "só controladores".
// A ordem é sempre a de CATEGORIAS_EQUIPAMENTO.
function tiposDoResumo(inst) {
  const marcados = (inst && inst.config.filtros && inst.config.filtros.tipos) || ["semaforo"];
  return CATEGORIAS_EQUIPAMENTO.map((c) => c.id).filter((id) => marcados.includes(id) && tipoNoGeral(id));
}

// O Resumo é: "Geral" (Estado e Região, somando todos os tipos marcados) no topo e, abaixo, uma seção por tipo SÓ
// com os estados PRÓPRIOS dele. Hoje só o controlador tem (Modo de controle e Status, ainda simulados); tipo sem
// estado próprio não ganha seção (já está contado no Geral). Para um tipo ganhar a dele, é só registrá-lo em
// `SECAO_PROPRIA_DO_TIPO` com a função que devolve as tabelas.
const SECAO_PROPRIA_DO_TIPO = {
  semaforo: ({ tabela, linha, equips }) => {
    const porModo = { centro: 0, operador: 0, local: 0 };
    const porStatus = { cores: 0, intermitente: 0, apagado: 0 };
    equips.forEach((e) => { porModo[LiveState.modoDoControlador(e.id)]++; porStatus[LiveState.statusDoControlador(e.id)]++; });
    return tabela("Modo de controle", MODOS_CONTROLE.map((m) => linha("modo", m.id, `<i class="resumo-swatch" data-modo="${m.id}"></i>`, m.label, porModo[m.id])).join(""))
      + tabela("Status", Object.entries(LiveState.ROTULOS_STATUS).map(([id, rotulo]) => linha("status", id, `<i class="resumo-swatch" data-status="${id}"></i>`, rotulo, porStatus[id])).join(""));
  },
};

function resumoMarkup(inst) {
  const tipos = tiposDoResumo(inst);
  const equips = LiveState.getEquipamentos().filter((e) => tipos.includes(e.tipo));
  const doTipo = (tipo) => equips.filter((e) => e.tipo === tipo);
  const contaEstado = (lista) => ({
    offline: lista.filter((e) => !e.online).length,
    alerta: lista.filter((e) => e.online && LiveState.alertasDoEquipamento(e.id).length > 0).length,
  });
  const geral = contaEstado(equips);
  const ativo = CockpitMap.getFiltroResumo();
  const ocultos = CockpitMap.getOcultosResumo();
  // o mapa só mostra controladores: com outros tipos marcados, o número do Geral pode ser maior que o que o clique mostra
  const notaMapa = tipos.some((t) => t !== "semaforo") ? " (o mapa mostra só controladores)" : "";

  const celula = (n) => `<span class="reg-total"><b>${n}</b></span>`;
  const linha = (grupo, valor, swatch, label, n) => {
    const oculto = ocultos[grupo].has(valor);
    return `
    <tr class="${ativo[grupo] === valor ? "is-selecionada" : ""} ${oculto ? "is-oculto" : ""}" data-action="resumo-filtro" data-grupo="${grupo}" data-valor="${valor}" title="Mostrar só este no mapa${notaMapa}">
      <td class="reg-nome"><div class="reg-nome-in">${swatch}<span class="reg-texto">${label}</span></div></td>
      <td class="reg-contagem"><span class="tipo-olho" data-action="resumo-olho" data-grupo="${grupo}" data-valor="${valor}" title="${oculto ? "Mostrar no mapa" : "Ocultar do mapa"}">${oculto ? ICONS.eyeOff : ICONS.eye}</span>${celula(n)}</td>
    </tr>`;
  };
  const tabela = (titulo, linhas) => `
      <table class="lista-tabela reg-lista resumo-lista">
        <thead><tr><th colspan="2">${titulo}</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>`;
  const secao = (titulo, n, corpo) => `
    <section class="resumo-secao">
      <div class="resumo-secao-head">${titulo}${n == null ? "" : ` <em>${n}</em>`}</div>
      ${corpo}
    </section>`;

  // Geral: estado de todos os tipos marcados + regiões com falha
  const corpoGeral =
    tabela("Estado",
      linha("estado", "offline", `<i class="resumo-swatch" data-cor="offline"></i>`, "Offline", geral.offline) +
      linha("estado", "alerta", `<i class="resumo-swatch" data-cor="alerta"></i>`, "Alarmes", geral.alerta)) +
    tabela("Região", ["subarea", "corredor"].map((tipo) => {
      const { ids, ativo: regiaoAtiva } = regioesComFalha(tipo);
      return `
          <tr class="${regiaoAtiva ? "is-selecionada" : ""}" data-action="resumo-regiao" data-tipo="${tipo}" title="Mostrar só ${tipo === "subarea" ? "as subáreas" : "os corredores"} com falha no mapa">
            <td class="reg-nome"><div class="reg-nome-in"><span class="reg-texto">${tipo === "subarea" ? "Subáreas" : "Corredores"} com falha</span></div></td>
            <td class="reg-contagem">${celula(ids.length)}</td>
          </tr>`;
    }).join(""));

  // só os tipos com estado próprio registrado ganham seção; os outros já estão no Geral
  const secoesTipos = tipos.filter((tipo) => SECAO_PROPRIA_DO_TIPO[tipo]).map((tipo) => {
    const cat = CATEGORIAS_EQUIPAMENTO.find((c) => c.id === tipo);
    return secao(cat.label, doTipo(tipo).length, SECAO_PROPRIA_DO_TIPO[tipo]({ tabela, linha, equips: doTipo(tipo) }));
  }).join("");

  const rodape = tipos.length === 1 ? `${equips.length} ${CATEGORIAS_EQUIPAMENTO.find((c) => c.id === tipos[0]).label.toLowerCase()}` : `${equips.length} dispositivos`;
  return `
    <div class="lista-scroll is-recuada">
      ${secao("Geral", null, corpoGeral)}
      ${secoesTipos}
    </div>
    <div class="lista-footer"><span class="lista-footer-label">${rodape}</span></div>`;
}

// Regiões (subáreas ou corredores) com pelo menos um controlador com falha (offline ou alerta ativo).
// "ativo" = o filtro do mapa já está mostrando exatamente essas regiões.
function regioesComFalha(tipo) {
  const lista = tipo === "subarea" ? SUBAREAS : CORREDORES;
  const ids = lista.filter((r) => numerosRegiao(tipo, r.id).falhas > 0).map((r) => r.id);
  if (!CockpitBus.mapaAtivo()) return { ids, ativo: false };
  const noMapa = tipo === "subarea" ? CockpitMap.getFiltro().subareas : CockpitMap.getFiltro().corredores;
  const ativo = ids.length > 0 && ids.length < lista.length && noMapa.size === ids.length && ids.every((id) => noMapa.has(id));
  return { ids, ativo };
}

// Re-renderiza todos os cards (menos o mapa, que se inscreve sozinho no LiveState). Usado quando os
// dados mudam de uma vez, como ao aplicar as falhas reais do modo admin; no tick normal só o modo
// "totais" atualiza, para não roubar o foco do campo de busca das listas.
function atualizarTodosWidgets() {
  instances.forEach((inst) => { if (inst.type !== "mapa") renderWidgetBody(inst.id); });
  atualizarContagensRegioes();
}

// Card de totais (Dispositivos / Alertas / Regiões) clicado = fica marcado enquanto o recorte dele estiver no mapa.
// Clicar de novo desativa. Se o recorte for limpo por outro caminho (tag "×"), a marca sai junto.
let cardAtivoId = null;
function totaisSel(inst) {
  return cardAtivoId === inst.id && typeof CockpitMap !== "undefined" && CockpitMap.getRecorte().recorteDeCard ? " is-selecionado" : "";
}
function atualizarTotaisSelecao() {
  instances.forEach((inst) => { if (inst.type !== "mapa" && inst.config.modo === "totais") renderWidgetBody(inst.id); });
}

function atualizarResumos() {
  instances.forEach((inst) => { if (inst.type === "resumo") renderWidgetBody(inst.id); });
}

/* ---------- Dispositivos ---------- */

function totaisDispositivosMarkup(inst) {
  const n = equipamentosFiltrados(inst.config.filtros).length;
  return `
    <div class="totais-body${totaisSel(inst)}" data-action="totais-clicar" data-id="${inst.id}" aria-pressed="${totaisSel(inst) ? "true" : "false"}">
      <div class="totais-numero">${n}</div>
      <div class="totais-label">Dispositivos</div>
      <div class="totais-filtro" title="${resumoFiltroTitle(inst)}">${resumoFiltroCard(inst)}</div>
    </div>`;
}

// Tela completa de Dispositivos do sistema. HOST DE DESENVOLVIMENTO: trocar quando houver o de produção.
// Abre em outra aba para o operador não perder o cockpit. Não leva os filtros do card (não sei se a
// tela aceita parâmetros).
const URL_TELA_DISPOSITIVOS = "https://antares-revolution-dev.dataprom.com/dashboard/dispositivos";
// "Ver tudo" dos Alertas: por enquanto leva ao dashboard geral (host de desenvolvimento, como acima).
const URL_TELA_ALERTAS = "https://antares-revolution-dev.dataprom.com/dashboard";
const verTudoAlertasMarkup = () =>
  `<a class="btn-text" href="${URL_TELA_ALERTAS}" target="_blank" rel="noopener" style="padding:0; width:auto; display:inline-block; text-decoration:none; font-size:11.5px;">Ver tudo</a>`;
const verDetalhesDispositivosMarkup = () =>
  `<a class="btn-text" href="${URL_TELA_DISPOSITIVOS}" target="_blank" rel="noopener" style="padding:0; width:auto; display:inline-block; text-decoration:none; font-size:11.5px;">Ver mais detalhes</a>`;

// Modo lista: o usuário escolhe na configuração do card se agrupa ("Agrupar por tipo", padrão) ou se
// quer a lista de dispositivos ("Sem agrupar"). Ex.: "Equipamentos offline" precisa dos nomes.
function listaDispositivosMarkup(inst) {
  return (inst.config.filtros.agrupar || "tipo") === "nenhum" ? listaDispositivosPlana(inst) : listaDispositivosAgrupada(inst);
}

function listaDispositivosPlana(inst) {
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
    ${paginacaoMarkup(inst.id, pagina, totalPaginas, filtrados.length, false, verDetalhesDispositivosMarkup())}
  `;
}

// Agrupada = resumo por tipo (mesmo conceito do widget Resumo): quantos dispositivos de cada
// tipo, respeitando os filtros do card. Funciona como legenda interativa do mapa: o olho de cada
// linha liga/desliga aquele tipo no mapa (é o mesmo filtro "Equipamentos" do próprio mapa).
function listaDispositivosAgrupada(inst) {
  const f = inst.config.filtros;
  const filtrados = equipamentosFiltrados(f);
  const noMapa = CockpitBus.mapaAtivo() ? CockpitMap.getFiltro().categorias : null; // sem mapa: tudo "ligado"
  const linhas = CATEGORIAS_EQUIPAMENTO.filter((c) => f.tipos.includes(c.id) && tipoNoGeral(c.id)).map((c) => {
    const doTipo = filtrados.filter((e) => e.tipo === c.id);
    const n = doTipo.length;
    const visivel = !noMapa || noMapa.has(c.id);
    return `
      <tr class="${visivel ? "" : "is-oculto"}" data-action="dispositivos-tipo" data-tipo="${c.id}" title="${visivel ? "Ocultar do mapa" : "Mostrar no mapa"}">
        <td class="reg-nome"><div class="reg-nome-in"><span class="tipo-icone">${ICONES_CATEGORIA[c.id] || ""}</span><span class="reg-texto">${c.label}</span></div></td>
        <td class="reg-contagem"><span class="tipo-olho">${visivel ? ICONS.eye : ICONS.eyeOff}</span><span class="reg-total ${n === 0 ? "is-zero" : ""}"><b>${n}</b></span></td>
      </tr>`;
  }).join("");

  return `
    <div class="lista-scroll is-recuada">
      ${linhas ? `
      <table class="lista-tabela reg-lista resumo-lista">
        <tbody>${linhas}</tbody>
      </table>` : `<div class="lista-vazio">Nenhum tipo selecionado.</div>`}
    </div>
    <div class="lista-footer" style="justify-content:flex-end;">${verDetalhesDispositivosMarkup()}</div>`;
}

/* ---------- Alertas ---------- */

function totaisAlertasMarkup(inst) {
  const lista = alertasFiltrados(inst.config.filtros);
  const porSeveridade = SEVERIDADES.map((sev) => ({ sev, n: lista.filter((a) => a.severidade === sev).length }));
  return `
    <div class="totais-body${totaisSel(inst)}" data-action="totais-clicar" data-id="${inst.id}" aria-pressed="${totaisSel(inst) ? "true" : "false"}">
      <div class="totais-numero">${lista.length}</div>
      <div class="totais-label">Alertas ativos</div>
      <div class="totais-breakdown">
        ${porSeveridade.map((s) => `<span class="totais-chip"><span class="totais-chip-dot" style="background:${SEVERIDADE_COR[s.sev]}"></span>${s.sev} ${s.n}</span>`).join("")}
      </div>
      <div class="totais-filtro" title="${resumoFiltroTitle(inst)}">${resumoFiltroCard(inst)}</div>
    </div>`;
}

// Agrupamentos da lista de Alertas (escolhido na configuração do card). Sem a chave salva (widgets
// antigos) vale "nenhum", para não mudar o que já estava na tela.
const AGRUPAR_ALERTAS = [
  { id: "nenhum", label: "Sem agrupar (lista de alertas)" },
  { id: "alarme", label: "Tipo de alarme" },
  { id: "dispositivo", label: "Tipo de dispositivo" },
  { id: "severidade", label: "Severidade" },
  { id: "subarea", label: "Subárea" },
];

const mesmoConjunto = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

// Alertas de data.js (fixos) não têm tipoAlarme: caem na descrição.
function grupoDoAlerta(a, agrupar) {
  if (agrupar === "severidade") return { chave: a.severidade, label: a.severidade, ordem: SEVERIDADES.indexOf(a.severidade), cor: SEVERIDADE_COR[a.severidade] };
  if (agrupar === "dispositivo") {
    const eq = LiveState.equipamentoPorId(a.equipamentoId);
    return { chave: eq.tipo, label: categoriaLabel(eq.tipo), icone: ICONES_CATEGORIA[eq.tipo] || "" };
  }
  if (agrupar === "subarea") {
    const eq = LiveState.equipamentoPorId(a.equipamentoId);
    const nome = eq && eq.subareaId ? nomeSubarea(eq.subareaId) : null;
    return { chave: nome ? eq.subareaId : "-", label: nome ? nomeSemCodigo(nome) : "Sem subárea", regiaoId: nome ? eq.subareaId : null };
  }
  const info = a.tipoAlarme && ALARMES_CATALOGO[a.tipoAlarme];
  const label = info ? info.nome : a.descricao;
  return { chave: label, label };
}

function listaAlertasAgrupada(inst, agrupar) {
  const lista = alertasFiltrados(inst.config.filtros);
  const grupos = new Map();
  lista.forEach((a) => {
    const g = grupoDoAlerta(a, agrupar);
    const atual = grupos.get(g.chave) || { ...g, n: 0, ids: new Set() };
    atual.n++;
    atual.ids.add(a.equipamentoId);
    grupos.set(g.chave, atual);
  });
  const linhas = [...grupos.values()].sort((x, y) => (agrupar === "severidade" ? x.ordem - y.ordem : y.n - x.n || x.label.localeCompare(y.label)));
  const titulo = AGRUPAR_ALERTAS.find((o) => o.id === agrupar).label;
  const idsAtivos = CockpitBus.mapaAtivo() ? CockpitMap.getFiltroIds() : null;
  return `
    <div class="lista-scroll is-recuada">
      ${linhas.length === 0 ? `<div class="lista-vazio">Nenhum alerta ativo com esse filtro.</div>` : `
      <table class="lista-tabela reg-lista resumo-lista">
        <thead><tr><th colspan="2">${titulo}</th></tr></thead>
        <tbody>
          ${linhas.map((g) => `
          <tr ${g.regiaoId ? `data-action="lista-row" data-id="${inst.id}" data-tipo="subarea" data-alvo="${g.regiaoId}"` : `class="${idsAtivos && mesmoConjunto(idsAtivos, g.ids) ? "is-selecionada" : ""}" data-action="alertas-grupo" data-id="${inst.id}" data-chave="${encodeURIComponent(g.chave)}" title="Mostrar só estes no mapa"`}>
            <td class="reg-nome"><div class="reg-nome-in">${g.icone ? `<span class="tipo-icone">${g.icone}</span>` : ""}${g.cor ? `<i class="reg-cor" style="background:${g.cor}; border-radius:50%"></i>` : ""}<span class="reg-texto" title="${g.label}">${g.label}</span></div></td>
            <td class="reg-contagem"><span class="reg-total"><b>${g.n}</b></span></td>
          </tr>`).join("")}
        </tbody>
      </table>`}
    </div>
    <div class="lista-footer"><span class="lista-footer-label">${lista.length} alerta${lista.length === 1 ? "" : "s"}</span>${verTudoAlertasMarkup()}</div>`;
}

function listaAlertasMarkup(inst) {
  const agrupar = inst.config.filtros.agrupar || "nenhum";
  if (agrupar !== "nenhum") return listaAlertasAgrupada(inst, agrupar);
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
    <div class="totais-body${totaisSel(inst)}" data-action="totais-clicar" data-id="${inst.id}" aria-pressed="${totaisSel(inst) ? "true" : "false"}">
      <div class="totais-numero">${nSub + nCor}</div>
      <div class="totais-label">Regiões cadastradas</div>
      <div class="totais-breakdown">
        <span class="totais-chip"><span class="totais-chip-dot" style="background:var(--blue)"></span>Subáreas ${nSub}</span>
        <span class="totais-chip"><span class="totais-chip-dot" style="background:var(--purple)"></span>Corredores ${nCor}</span>
      </div>
      <div class="totais-filtro" title="${resumoFiltroTitle(inst)}">${resumoFiltroCard(inst)}</div>
    </div>`;
}

function linhaSelecionada(tipo, id) {
  const sel = CockpitMap.getSelecao();
  return !!sel && sel.tipo === tipo && sel.id === id;
}

// Nome oficial vem como "SA06 - CABRAL": na lista fica só o nome (o código completo aparece no title).
const nomeSemCodigo = (nome) => nome.replace(/^SA\s?\d+\s*-\s*/i, "");

// Números de uma região para a lista: controladores (só controladores, igual ao mapa) e falhas
// (controladores offline ou com alerta ativo).
function numerosRegiao(tipo, id) {
  const campo = tipo === "subarea" ? "subareaId" : "corredorId";
  const ctrls = LiveState.getEquipamentos().filter((e) => e.tipo === "semaforo" && e[campo] === id);
  const falhas = ctrls.filter((e) => !e.online || LiveState.alertasDoEquipamento(e.id).length > 0).length;
  return { ctrls: ctrls.length, falhas };
}

// Coluna da direita reservada só para erros: bolinha vermelha + quantidade de controladores com
// falha (offline ou alerta ativo). Sem falha, a célula fica vazia. O número tem largura fixa para
// a bolinha ficar na mesma coluna com 1, 2 ou 3 dígitos.
const celulaFalhas = (n, sujeito = "controlador") =>
  n ? `<span class="reg-total is-erro" title="${n} ${sujeito}${n === 1 ? "" : "es"} com falha" aria-label="${n} com falha"><i class="reg-falha-dot"></i><b>${n}</b></span>` : "";

// Ordenação escolhida num select ao lado da busca; cada opção já vem no sentido útil
// (nome A→Z; números do maior para o menor — quem ordena por falha quer o pior no topo).
const ORDENS_REGIOES = [
  { id: "nome", label: "Nome (A–Z)" },
  { id: "falhas", label: "Mais falhas" },
];
function ordenarRegioes(lista, tipo, campo) {
  const nums = new Map(lista.map((r) => [r.id, numerosRegiao(tipo, r.id)]));
  const porNome = (a, b) => nomeSemCodigo(a.nome).localeCompare(nomeSemCodigo(b.nome), "pt-BR");
  return [...lista].sort((a, b) => (campo === "nome" ? 0 : nums.get(b.id)[campo] - nums.get(a.id)[campo]) || porNome(a, b));
}

// Fallback de `field-sizing: content` (Safari/Firefox): mede o texto da opção escolhida e dá ao
// select essa largura + a seta nativa.
function ajustarLarguraOrdem(body) {
  if (CSS.supports("field-sizing", "content")) return;
  const sel = body.querySelector('[data-input="reg-ordem"]');
  if (!sel) return;
  const medida = document.createElement("span");
  medida.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:${getComputedStyle(sel).font}`;
  medida.textContent = sel.options[sel.selectedIndex].text;
  document.body.appendChild(medida);
  sel.style.width = `${medida.offsetWidth + 22}px`;
  medida.remove();
}

function ordemRegioesMarkup(inst, campo) {
  return `<label class="reg-ordem" title="Ordenar lista">
    <span>Ordenar</span>
    <select data-input="reg-ordem" data-id="${inst.id}">${ORDENS_REGIOES.map(
      (o) => `<option value="${o.id}"${o.id === campo ? " selected" : ""}>${o.label}</option>`
    ).join("")}</select>
  </label>`;
}

// Paginação da lista de Regiões do tamanho do card: depois de desenhar, mede quantas linhas
// cabem na área da lista e redesenha se o número mudou (roda de novo no resize do widget).
function ajustarLinhasPorPagina(inst, body) {
  const scroll = body.querySelector(".lista-scroll");
  const linha = body.querySelector(".reg-lista tbody tr");
  if (!scroll || !linha || !linha.offsetHeight) return;
  const livre = scroll.clientHeight - 18; // 18 = margem da tabela + padding de baixo
  const n = Math.max(3, Math.floor(livre / linha.offsetHeight));
  if (n !== inst.linhasPorPagina) {
    inst.linhasPorPagina = n;
    renderWidgetBody(inst.id);
  }
}

// O tempo real não refaz a lista (voltaria a rolagem ao topo, tiraria o foco da busca e
// reordenaria as linhas debaixo do mouse): só troca os números de cada linha.
function atualizarContagensRegioes() {
  document.querySelectorAll(".reg-lista tr[data-alvo]").forEach((tr) => {
    const { falhas } = numerosRegiao(tr.dataset.tipo, tr.dataset.alvo);
    const tdFalha = tr.querySelector(".reg-contagem");
    if (tdFalha) tdFalha.innerHTML = celulaFalhas(falhas);
  });
}

function listaRegioesMarkup(inst) {
  const ids = inst.config.filtros.regioes;
  const tab = inst.config.listaTab || "subareas";
  const fonte = tab === "subareas" ? SUBAREAS.filter((s) => ids.includes(s.id)) : CORREDORES.filter((c) => ids.includes(c.id));
  const busca = (inst.config.listaBusca || "").toLowerCase();
  const filtrados = busca ? fonte.filter((r) => r.nome.toLowerCase().includes(busca)) : fonte;
  const tipoAlvo = tab === "subareas" ? "subarea" : "corredor";
  const salva = inst.config.listaOrdem && inst.config.listaOrdem.campo;
  const ordem = ORDENS_REGIOES.some((o) => o.id === salva) ? salva : "nome";
  const ordenados = ordenarRegioes(filtrados, tipoAlvo, ordem);
  const { pagina, totalPaginas, itens } = paginar(ordenados, inst.config.listaPagina, inst.linhasPorPagina);

  return `
    <div class="lista-toolbar is-empilhada">
      ${buscaMarkup(inst.id)}
      <div class="lista-tabs">
        <button type="button" class="lista-tab ${tab === "subareas" ? "is-active" : ""}" data-action="lista-tab" data-id="${inst.id}" data-tab="subareas">Subáreas</button>
        <button type="button" class="lista-tab ${tab === "corredores" ? "is-active" : ""}" data-action="lista-tab" data-id="${inst.id}" data-tab="corredores">Corredores</button>
      </div>
    </div>
    <div class="reg-ordem-linha">${ordemRegioesMarkup(inst, ordem)}</div>
    <div class="lista-scroll is-recuada">
      ${filtrados.length === 0 ? `<div class="lista-vazio">Nenhuma região encontrada.</div>` : `
      <table class="lista-tabela reg-lista">
        <tbody>
          ${itens.map((r) => {
            const { falhas } = numerosRegiao(tipoAlvo, r.id);
            const cor = CockpitMap.corPorErros(falhas); // a mesma escala do mapa: mais escuro = mais falhas
            return `
            <tr class="${linhaSelecionada(tipoAlvo, r.id) ? "is-selecionada" : ""}" data-action="lista-row" data-id="${inst.id}" data-tipo="${tipoAlvo}" data-alvo="${r.id}">
              <td class="reg-nome" title="${r.nome}"><div class="reg-nome-in"><i class="reg-cor" style="background:${cor}"></i><span class="reg-texto">${nomeSemCodigo(r.nome)}</span></div></td>
              <td class="reg-contagem">${celulaFalhas(falhas)}</td>
            </tr>`;
          }).join("")}
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

function paginar(lista, pagina, tamanho = PAGE_SIZE) {
  const totalPaginas = Math.max(1, Math.ceil(lista.length / tamanho));
  const p = Math.min(Math.max(1, pagina || 1), totalPaginas);
  const itens = lista.slice((p - 1) * tamanho, p * tamanho);
  return { pagina: p, totalPaginas, itens };
}

function paginacaoMarkup(id, pagina, totalPaginas, total, comVerTudo, extra = "") {
  return `
    <div class="lista-footer">
      <span class="lista-footer-label">${total} item${total === 1 ? "" : "s"}${comVerTudo ? "" : ""}</span>
      <div style="display:flex; align-items:center; gap:10px;">
        ${comVerTudo ? verTudoAlertasMarkup() : ""}
        ${extra}
        <div class="lista-pg-btns">
          <button type="button" data-action="lista-pg" data-id="${id}" data-dir="prev" ${pagina <= 1 ? "disabled" : ""}>${ICONS.chevronLeft}</button>
          <span class="lista-footer-label">${pagina}/${totalPaginas}</span>
          <button type="button" data-action="lista-pg" data-id="${id}" data-dir="next" ${pagina >= totalPaginas ? "disabled" : ""}>${ICONS.chevronRight}</button>
        </div>
      </div>
    </div>`;
}

/* ---------- Mapa: markup do header (dropdowns + busca) ---------- */

// Camadas do mapa: o que aparece (subáreas, corredores, controladores). Botão "Legendas" (era "Camadas") que abre
// uma lista de caixas de marcar, cada uma com uma amostra de como a camada aparece no mapa (serve
// de legenda). Substituem os filtros "Subáreas N / Corredores N" (quais regiões), que com as 46
// subáreas oficiais eram lista longa para uma pergunta que o operador não fazia.
const CAMADA_SUBAREAS = { id: "subareas", label: "Subáreas", amostra: '<i class="camada-amostra is-area"></i>', total: () => SUBAREAS.length };
const CAMADAS_MAPA = [
  // "Filtros" com as três camadas, igual em todas as versões (v2 e v3 herdam da v1). "Dispositivos" liga/desliga todos os pinos
  // (hoje só controladores; quando entrarem outros tipos, vira grupo com um item por tipo — o id da camada no mapa segue "controladores").
  { id: "controladores", label: "Dispositivos", amostra: `<i class="camada-amostra is-icone">${ICONES_CATEGORIA.semaforo}</i>`, total: () => LiveState.getEquipamentos().filter((e) => e.tipo === "semaforo" || e.origem === "sim").length },
  CAMADA_SUBAREAS,
  { id: "corredores", label: "Corredores", amostra: '<i class="camada-amostra is-linha" style="background:#1f2937;opacity:1;height:4px"></i>', total: () => CORREDORES.length },
];

const camadasLigadas = (camadas = {}) => CAMADAS_MAPA.filter((c) => camadas[c.id] !== false).length;

function camadasBtnInner(camadas) {
  const n = camadasLigadas(camadas);
  return `${ICONS.layers} Filtros${n < CAMADAS_MAPA.length ? ` <span>· ${n}/${CAMADAS_MAPA.length}</span>` : ""}`;
}

function camadasMarkup(camadas = {}) {
  return `
    <div class="map-filtro-btn-wrap" data-filtro-wrap="camadas">
      <button type="button" class="map-filtro-btn${camadasLigadas(camadas) < CAMADAS_MAPA.length ? " is-active" : ""}" data-action="map-filtro-toggle" data-campo="camadas" data-map-camadas-btn>${camadasBtnInner(camadas)}</button>
      <div class="filtros-panel" data-filtro-panel="camadas">${dropdownConteudo("camadas")}</div>
    </div>`;
}

// v1: com mais de um tipo de dispositivo no mapa, "Dispositivos" vira grupo: a linha-mãe liga/desliga todos os pinos e
// abaixo vem uma linha por tipo (só o desenho do ícone, sem contorno), cada uma com o seu total. Com um tipo só, não há grupo.
function tiposDeDispositivoNoMapa() {
  const noMapaAgora = LiveState.getEquipamentos().filter((e) => e.tipo === "semaforo" || e.origem === "sim");
  return CATEGORIAS_EQUIPAMENTO.map((c) => ({ ...c, total: noMapaAgora.filter((e) => e.tipo === c.id).length })).filter((c) => c.total > 0);
}

function camadaLinhaMarkup(c, camadas) {
  return `
        <label class="camada-linha">
          <input type="checkbox" data-input="map-camada" data-camada="${c.id}" ${camadas[c.id] !== false ? "checked" : ""}/>
          ${c.amostra}
          <span class="camada-nome">${c.label}</span>
          <span class="camada-total">${c.total()}</span>
        </label>`;
}

function camadasPainelMarkup() {
  const f = CockpitMap.getFiltro();
  const camadas = f.camadas || {};
  const tipos = tiposDeDispositivoNoMapa();
  return `
    <div class="filtros-panel-title">Mostrar no mapa</div>
    <div class="camadas-lista">
      ${CAMADAS_MAPA.map((c) => {
        const mae = camadaLinhaMarkup(c, camadas);
        if (c.id !== "controladores" || tipos.length < 2) return mae;
        const filhas = tipos
          .map(
            (t) => `
        <label class="camada-linha is-filha">
          <input type="checkbox" data-input="map-check" data-campo="categorias" data-alvo="${t.id}" ${f.categorias.has(t.id) ? "checked" : ""}/>
          <i class="camada-amostra is-icone">${ICONES_CATEGORIA[t.id] || ""}</i>
          <span class="camada-nome">${t.label}</span>
          <span class="camada-total">${t.total}</span>
        </label>`
          )
          .join("");
        return mae + filhas;
      }).join("")}
    </div>`;
}

// Tag sobre o mapa (topo, centralizada): só aparece quando há algo filtrando; lista o que recorta e tem "×" para limpar tudo.
// Na visão padrão (sem filtro) fica escondida.
function atualizarTagFiltro() {
  const el = document.querySelector("[data-map-tag]");
  if (!el) return;
  const r = CockpitMap.getRecorte();
  const partes = [];
  if (r.resumo.modo) partes.push(`Modo ${(MODOS_CONTROLE.find((m) => m.id === r.resumo.modo) || {}).label || r.resumo.modo}`);
  if (r.resumo.status) partes.push(`Status ${LiveState.ROTULOS_STATUS[r.resumo.status] || r.resumo.status}`);
  if (r.resumo.estado) partes.push(r.resumo.estado === "offline" ? "Offline" : "Alarmes");
  if (r.ids) partes.push(`${r.ids} dispositivo${r.ids === 1 ? "" : "s"} do grupo escolhido`);
  if (r.recorteDeCard) partes.push("Recorte de um card");
  if (r.statusConexao !== "todos") partes.push(r.statusConexao === "offline" ? "Offline" : "Online");
  if (r.statusAlerta !== "todos") partes.push("Só com alarme ativo");
  if (r.subareas[0] < r.subareas[1] || r.corredores[0] < r.corredores[1]) partes.push(r.regiaoSoFalha ? "Só com falha nas regiões escolhidas" : "Regiões escolhidas");
  if (!partes.length) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<span>Filtrando: <b>${[...new Set(partes)].join(" · ")}</b></span><button type="button" data-action="map-tag-limpar" title="Limpar os filtros do mapa" aria-label="Limpar os filtros do mapa">${ICONS.x}</button>`;
}

// Seletor de alertas do mapa. HIPÓTESE NÃO VALIDADA: o que conta como "alerta" aqui (hoje: alarme ativo, offline e modo operador).
const MODOS_ALERTAS = [
  { id: "todos", label: "Todos", titulo: "Todos os dispositivos, sem estado: só a posição" },
  { id: "todos-alertas", label: "Todos + alertas", titulo: "Todos os dispositivos, com os alertas em destaque e as subáreas coloridas pelas falhas" },
  { id: "so-alertas", label: "Só alertas", titulo: "Só os dispositivos com alarme ativo ou em modo operador" },
];

function mapaBodyMarkup(inst) {
  const c = CockpitMap.getContagens();
  // busca + filtros ficam sobre o mapa, como controles flutuantes (não uma
  // segunda barra acima dele). O #mapaEl ocupa toda a área do widget.
  return `
    <div id="mapaEl-${inst.id}" style="flex:1; min-height:0; position:relative;"></div>
    <div class="map-floating-controls">
      ${Versoes.tem("mapa.busca") ? `<div class="map-search-mini">
        ${ICONS.search}
        <input type="text" data-input="map-busca" placeholder="Buscar dispositivo, corredor ou subárea..." />
      </div>` : ""}
      ${Versoes.tem("mapa.legendas") ? camadasMarkup(inst.config.filtros.camadas) : ""}
      ${false ? `<div class="map-modo" role="radiogroup" aria-label="Alertas no mapa" data-map-modo>
        ${MODOS_ALERTAS.map((m) => `<button type="button" role="radio" aria-checked="${m.id === (inst.config.filtros.modoAlertas || "todos")}" class="${m.id === (inst.config.filtros.modoAlertas || "todos") ? "is-on" : ""}" data-action="map-modo" data-modo="${m.id}" title="${m.titulo}">${m.label}</button>`).join("")}
      </div>` : ""}
    </div>
    <div class="map-filtro-tag" data-map-tag hidden></div>
    <div class="map-vazio" hidden>Nenhum dispositivo com alarme ativo ou em modo operador agora. Escolha outro modo para ver os demais.</div>
    <aside class="map-selecao" hidden></aside>
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
  if (campo === "camadas") return camadasPainelMarkup();
  if (campo === "subareas") {
    return dropdownChecklist("subareas", SUBAREAS, CockpitMap.getFiltro().subareas);
  }
  if (campo === "corredores") {
    return dropdownChecklist("corredores", CORREDORES, CockpitMap.getFiltro().corredores);
  }
  const f = CockpitMap.getFiltro();
  // categorias: só os tipos de equipamento. Conexão / "só com alerta ativo" saíram
  // daqui e viraram config do widget (ícone de engrenagem), pra deixar a barra
  // flutuante só com filtro de "coisa" (subárea, corredor, tipo de equipamento).
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
  atualizarResumos(); // olhos e contagens do Resumo acompanham o mapa
  instances.forEach((i) => { if (i.type === "alertas" && i.config.modo !== "totais" && (i.config.filtros.agrupar || "nenhum") !== "nenhum") renderWidgetBody(i.id); });
  // os olhos da lista de Dispositivos espelham o filtro de tipos do mapa
  instances.forEach((i) => { if (i.type === "dispositivos" && i.config.modo !== "totais") renderWidgetBody(i.id); });
  atualizarTagFiltro();
  if (filtroSerializado) {
    document.querySelectorAll('[data-action="map-modo"]').forEach((b) => {
      const ligado = b.dataset.modo === (filtroSerializado.modoAlertas || "todos");
      b.setAttribute("aria-checked", String(ligado));
      b.classList.toggle("is-on", ligado);
    });
  }
  const btnCamadas = document.querySelector("[data-map-camadas-btn]");
  if (btnCamadas && filtroSerializado && filtroSerializado.camadas) {
    btnCamadas.innerHTML = camadasBtnInner(filtroSerializado.camadas);
    btnCamadas.classList.toggle("is-active", camadasLigadas(filtroSerializado.camadas) < CAMADAS_MAPA.length);
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

/* ---------- filtro geral da tela (barra de ferramentas) ---------- */

function htmlFiltroGeral() {
  const total = CATEGORIAS_EQUIPAMENTO.length;
  const n = filtroGeral.tipos.length;
  const checks = CATEGORIAS_EQUIPAMENTO.map((c) => `
      <label class="fg-check">
        <input type="checkbox" data-input="fg-tipo" data-valor="${c.id}" ${tipoNoGeral(c.id) ? "checked" : ""}/>
        <span class="fg-ico">${ICONES_CATEGORIA[c.id] || ""}</span>
        <span>${c.label}</span>
      </label>`).join("");
  return `
    <div class="fg-head"><strong>Filtros da tela</strong>${n < total ? `<button type="button" class="fg-link" data-action="fg-limpar">Restaurar</button>` : ""}</div>
    <div class="fg-grupo">Tipo de dispositivo</div>
    <div class="fg-lista">${checks}</div>
    <p class="fg-nota">Vale para todos os widgets da tela. Cada widget ainda pode restringir mais na própria configuração. O mapa só mostra controladores por enquanto.</p>`;
}

function atualizarFiltroGeralUI() {
  const total = CATEGORIAS_EQUIPAMENTO.length;
  const restritos = filtroGeral.tipos.length < total ? 1 : 0;
  const badge = $("#filtroGeralBadge");
  if (badge) { badge.hidden = !restritos; badge.textContent = restritos; }
  const pop = $("#filtroGeralPop");
  if (pop && pop.classList.contains("is-open")) pop.innerHTML = htmlFiltroGeral();
}

// aplica a mudança em todos os widgets e no mapa
function aplicarFiltroGeral() {
  try { localStorage.setItem(CHAVE_FILTRO_GERAL, JSON.stringify(filtroGeral)); } catch (e) { /* segue sem salvar */ }
  CockpitMap.setTiposGlobais(filtroGeral.tipos);
  atualizarTodosWidgets();
  atualizarResumos();
  atualizarFiltroGeralUI();
}

/* ---------- modal de configuração ---------- */

function openConfigModal(id) {
  const inst = instances.find((i) => i.id === id);
  configDraft = { instanceId: id, config: JSON.parse(JSON.stringify(inst.config)) };
  // Resumo salvo antes do campo "tipos" existir: abre com o padrão (só controladores)
  if (inst.type === "resumo" && !(configDraft.config.filtros && configDraft.config.filtros.tipos)) configDraft.config.filtros = { tipos: ["semaforo"] };
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
  $("#configModalTitle").textContent = `Configurar ${WIDGET_META[inst.type].label}`;
  $("#configModalBody").innerHTML = configModalBodyMarkup(inst.type, configDraft.config);
  $("#configModalNota").hidden = !TIPOS_COM_NOTA_FILTROS.includes(inst.type);
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
  if (inst.type === "mapa") {
    // não re-renderiza o body (destruiria o Leaflet); aplica direto no mapa
    CockpitMap.setStatusConexao(inst.config.filtros.statusConexao || "todos");
    CockpitMap.setStatusAlerta(inst.config.filtros.statusAlerta || "todos");
  } else {
    renderWidgetTitleColor(inst.id);
    renderWidgetBody(inst.id);
  }
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

  if (type === "dispositivos") {
    return nome + `
      <div class="field">
        <label>Agrupar a lista por</label>
        <select data-input="modal-select" data-field="agrupar">
          ${[["tipo", "Tipo de dispositivo"], ["nenhum", "Sem agrupar (lista de dispositivos)"]].map(([v, txt]) => `<option value="${v}" ${(cfg.filtros.agrupar || "tipo") === v ? "selected" : ""}>${txt}</option>`).join("")}
        </select>
      </div>
      ${checklistField("Tipos de Dispositivo", "tipos", CATEGORIAS_EQUIPAMENTO, cfg.filtros.tipos)}
    `;
  }
  if (type === "alertas") {
    return nome +
      `<div class="field">
        <label>Agrupar a lista por</label>
        <select data-input="modal-select" data-field="agrupar">
          ${AGRUPAR_ALERTAS.filter((o) => o.id !== "severidade" || Versoes.tem("alertas.agrupar-severidade")).map((o) => `<option value="${o.id}" ${(cfg.filtros.agrupar || "nenhum") === o.id ? "selected" : ""}>${o.label}</option>`).join("")}
        </select>
      </div>` +
      checklistField("Tipos de Dispositivo", "tipos", CATEGORIAS_EQUIPAMENTO, cfg.filtros.tipos);
  }
  if (type === "resumo") {
    // quais tipos entram no Geral e ganham seção própria; hoje só o controlador tem estados próprios
    return nome + checklistField("Tipos no Resumo", "tipos", CATEGORIAS_EQUIPAMENTO, cfg.filtros.tipos);
  }
  // O Mapa não tem configuração: ele é único e obedece aos outros widgets (olhos do Dispositivos, cliques nos cards, Resumo).
  return nome;
}

// Nota no rodapé do modal (acima de Cancelar/Salvar): deixa claro que o conteúdo do card obedece ao
// que for configurado aqui (tipos de dispositivo). Só nos widgets com filtro.
const TIPOS_COM_NOTA_FILTROS = ["dispositivos", "alertas"];

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

  if (t.closest('[data-action="toggle-filtro-geral"]')) {
    const pop = $("#filtroGeralPop");
    const abrir = !pop.classList.contains("is-open");
    pop.classList.toggle("is-open", abrir);
    if (abrir) pop.innerHTML = htmlFiltroGeral();
    $("#widgetLibrary").classList.remove("is-open");
    return;
  }
  if (t.closest('[data-action="fg-limpar"]')) {
    filtroGeral.tipos = CATEGORIAS_EQUIPAMENTO.map((c) => c.id);
    aplicarFiltroGeral();
    return;
  }

  const libToggle = t.closest('[data-action="toggle-library"]');
  if (libToggle) { atualizarBibliotecaMapa(); $("#widgetLibrary").classList.toggle("is-open"); return; }

  const addBtn = t.closest('[data-action="add-widget"]');
  if (addBtn) {
    if (!addBtn.hasAttribute("disabled")) addWidget(addBtn.dataset.type);
    $("#widgetLibrary").classList.remove("is-open");
    return;
  }

  // Menu do avatar: interruptor do modo admin no topo; telas de exemplo e Limpar Cockpit só
  // aparecem com ele ligado (fora dele a tela é sempre a mesma — pedido do Guery, 24/09).
  const userToggle = t.closest('[data-action="toggle-user-menu"]');
  if (userToggle) {
    $('[data-action="toggle-admin"]').setAttribute("aria-pressed", String(document.body.classList.contains("modo-admin")));
    $("#userMenuDropdown").classList.toggle("is-open");
    return;
  }

  // Liga/desliga o modo admin e recarrega: o admin.js só é carregado na abertura da página, e
  // o ?admin da URL sai para não religar sozinho.
  if (t.closest('[data-action="toggle-admin"]')) {
    const ligar = !document.body.classList.contains("modo-admin");
    try {
      if (ligar) localStorage.setItem(ADMIN_KEY, "1");
      else localStorage.removeItem(ADMIN_KEY);
    } catch (e) {}
    const url = new URL(location.href);
    url.searchParams.delete("admin");
    if (ligar) url.searchParams.set("admin", "1"); // garante mesmo sem localStorage
    location.replace(url.toString());
    return;
  }

  const presetBtn = t.closest('[data-action="load-preset"]');
  if (presetBtn) {
    aplicarPreset(presetBtn.dataset.preset);
    $("#userMenuDropdown").classList.remove("is-open");
    return;
  }

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
    if (totaisSel(inst)) { // já está selecionado: clicar de novo desativa
      CockpitMap.limparRecortes();
      cardAtivoId = null;
      atualizarTotaisSelecao();
      atualizarResumos();
      return;
    }
    cardAtivoId = inst.id;
    if (inst.type === "dispositivos") CockpitBus.aplicarFiltroCard({ tipos: tiposComGeral(inst.config.filtros.tipos), statusConexao: inst.config.filtros.statusConexao, regioes: inst.config.filtros.regioes });
    if (inst.type === "alertas") CockpitBus.aplicarFiltroCard({ tipos: tiposComGeral(inst.config.filtros.tipos), regioes: inst.config.filtros.regioes, statusAlerta: "somente-ativos" });
    if (inst.type === "regioes") CockpitBus.aplicarFiltroCard({ regioes: inst.config.filtros.regioes, tipos: [...filtroGeral.tipos] });
    atualizarTotaisSelecao();
    return;
  }

  const notifRow = t.closest('[data-action="notificacao-row"]');
  if (notifRow) {
    if (!CockpitBus.mapaAtivo()) { toast("Adicione um widget de Mapa nesta tela para ver o dispositivo."); return; }
    // só leva o mapa até o dispositivo; o painel de detalhes abre pelo menu "..."
    const eq = LiveState.equipamentoPorId(notifRow.dataset.eq);
    const mapa = CockpitMap.getMap();
    if (eq && mapa) mapa.setView([eq.lat, eq.lng], Math.max(mapa.getZoom(), 17), { animate: true });
    return;
  }

  const notifMais = t.closest('[data-action="notificacao-mais"]');
  if (notifMais) { abrirMenuNotificacao(notifMais); return; }

  const notifItem = t.closest('[data-action="notificacao-menu-item"]');
  if (notifItem) {
    const eqId = notifItem.dataset.eq;
    fecharMenuNotificacao();
    if (notifItem.dataset.acao === "detalhes") {
      if (!CockpitBus.mapaAtivo()) { toast("Adicione um widget de Mapa nesta tela para abrir os detalhes."); return; }
      CockpitMap.selecionarEquipamento(eqId, { centralizar: true });
    } else {
      // Dashboard de Alertas na aba Dispositivo, só esse dispositivo, últimos 30 dias (o dashboard lê ?dispositivo=)
      window.open(`${URL_DASH_ALERTAS}?dispositivo=${encodeURIComponent(eqId)}`, "_blank", "noopener");
    }
    return;
  }

  const alertasGrupo = t.closest('[data-action="alertas-grupo"]');
  if (alertasGrupo) {
    if (!CockpitBus.mapaAtivo()) { toast("Adicione um widget de Mapa nesta tela para filtrar o mapa."); return; }
    const inst = instances.find((i) => i.id === alertasGrupo.dataset.id);
    const agrupar = inst.config.filtros.agrupar;
    const chave = decodeURIComponent(alertasGrupo.dataset.chave);
    const ids = new Set(alertasFiltrados(inst.config.filtros).filter((al) => grupoDoAlerta(al, agrupar).chave === chave).map((al) => al.equipamentoId));
    const atual = CockpitMap.getFiltroIds();
    CockpitMap.setFiltroIds(atual && mesmoConjunto(atual, ids) ? null : [...ids]); // clicar de novo limpa
    CockpitMap.enquadrarVisiveis();
    return;
  }

  const resumoRegiao = t.closest('[data-action="resumo-regiao"]');
  if (resumoRegiao) {
    if (!CockpitBus.mapaAtivo()) { toast("Adicione um widget de Mapa nesta tela para filtrar o mapa."); return; }
    const tipo = resumoRegiao.dataset.tipo;
    const { ids, ativo } = regioesComFalha(tipo);
    if (!ativo && ids.length === 0) { toast(tipo === "subarea" ? "Nenhuma subárea com falha." : "Nenhum corredor com falha."); return; }
    const f = CockpitMap.getFiltro();
    const todas = (lista) => lista.map((r) => r.id);
    // Mostra só o tipo clicado: "Corredores com falha" tira as subáreas do mapa (e vice-versa).
    // Clicar de novo volta tudo (subáreas e corredores).
    const subareas = ativo ? todas(SUBAREAS) : tipo === "subarea" ? ids : [];
    const corredores = ativo ? todas(CORREDORES) : tipo === "corredor" ? ids : [];
    CockpitMap.setFiltroRegioes(subareas, corredores, { soComFalha: !ativo });
    CockpitMap.enquadrarVisiveis();
    return;
  }

  const resumoOlho = t.closest('[data-action="resumo-olho"]');
  if (resumoOlho) {
    if (!CockpitBus.mapaAtivo()) { toast("Adicione um widget de Mapa nesta tela para filtrar o mapa."); return; }
    CockpitMap.toggleOcultoResumo(resumoOlho.dataset.grupo, resumoOlho.dataset.valor);
    CockpitMap.enquadrarVisiveis();
    return;
  }

  const resumoFiltro = t.closest('[data-action="resumo-filtro"]');
  if (resumoFiltro) {
    if (!CockpitBus.mapaAtivo()) { toast("Adicione um widget de Mapa nesta tela para filtrar o mapa."); return; }
    const { grupo, valor } = resumoFiltro.dataset;
    CockpitMap.setFiltroResumo({ [grupo]: CockpitMap.getFiltroResumo()[grupo] === valor ? null : valor }); // clicar de novo limpa
    CockpitMap.enquadrarVisiveis();
    atualizarResumos();
    return;
  }

  const dispTipo = t.closest('[data-action="dispositivos-tipo"]');
  if (dispTipo) {
    if (!CockpitBus.mapaAtivo()) { toast("Adicione um widget de Mapa nesta tela para filtrar o mapa."); return; }
    CockpitMap.toggleCategoria(dispTipo.dataset.tipo); // o render do mapa reemite o filtro e a lista se redesenha
    CockpitMap.enquadrarVisiveis();
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
    else CockpitBus.selecionarRegiao(tipo, alvo);
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

  const mapFiltroToggle = t.closest('[data-action="map-filtro-toggle"]');
  if (mapFiltroToggle) {
    const campo = mapFiltroToggle.dataset.campo;
    const painel = document.querySelector(`.filtros-panel[data-filtro-panel="${campo}"]`);
    const jaAberto = painel.classList.contains("is-open");
    $all(".filtros-panel").forEach((p) => p.classList.remove("is-open"));
    if (!jaAberto) { painel.innerHTML = dropdownConteudo(campo); painel.classList.add("is-open"); }
    return;
  }

  const modoBtn = t.closest('[data-action="map-modo"]');
  if (modoBtn) {
    CockpitMap.setModoAlertas(modoBtn.dataset.modo);
    atualizarResumos();
    return;
  }

  if (t.closest('[data-action="map-tag-limpar"]')) {
    CockpitMap.limparRecortes();
    cardAtivoId = null;
    atualizarTotaisSelecao();
    atualizarResumos();
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

  if (t.closest('[data-action="modal-close"], [data-action="modal-cancel"]')) { closeConfigModal(); return; }
  if (t.closest('[data-action="modal-save"]')) { saveConfigModal(); return; }

  // fecha popovers/dropdowns ao clicar fora
  if (!t.closest(".widget-library-wrap")) $("#widgetLibrary").classList.remove("is-open");
  if (!t.closest(".filtro-geral-wrap")) { const pop = $("#filtroGeralPop"); if (pop) pop.classList.remove("is-open"); }
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

  if (t.matches('[data-input="fg-tipo"]')) {
    const id = t.dataset.valor;
    const marcados = new Set(filtroGeral.tipos);
    if (t.checked) marcados.add(id); else marcados.delete(id);
    filtroGeral.tipos = CATEGORIAS_EQUIPAMENTO.map((c) => c.id).filter((x) => marcados.has(x));
    aplicarFiltroGeral();
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

  if (t.matches('[data-input="modal-check-bool"]')) {
    configDraft.config.filtros[t.dataset.field] = t.checked ? t.dataset.on : t.dataset.off;
    return;
  }
});

document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.matches('[data-input="reg-ordem"]')) {
    const inst = instances.find((i) => i.id === t.dataset.id);
    inst.config.listaOrdem = { campo: t.value };
    inst.config.listaPagina = 1;
    saveLayout();
    renderWidgetBody(inst.id);
    return;
  }
  if (t.matches('[data-input="map-camada"]')) CockpitMap.setCamada(t.dataset.camada, t.checked);
  if (t.matches('[data-input="map-check"]')) {
    const campo = t.dataset.campo, alvo = t.dataset.alvo;
    if (campo === "categorias") CockpitMap.toggleCategoria(alvo);
    if (campo === "subareas") CockpitMap.toggleSubarea(alvo);
    if (campo === "corredores") CockpitMap.toggleCorredor(alvo);
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.matches('[data-input="map-busca"]')) {
    const resultado = CockpitMap.buscar(e.target.value);
    if (!resultado) toast("Nada encontrado com esse termo.");
  }
});

/* ---------- boot ---------- */

/* Vindo do Dashboard de Alertas (?dispositivo=ID): abre o mapa já com esse equipamento selecionado.
   PROTÓTIPO: os ids do dashboard são de exemplo e podem não existir aqui; nesse caso cai no primeiro
   semáforo só para demonstrar o fluxo (e avisa). */
function abrirDispositivoDaUrl() {
  const pedido = new URLSearchParams(location.search).get("dispositivo");
  if (!pedido) return;
  let tentativas = 0;
  const tentar = () => {
    if (!CockpitMap.getMap()) { if (tentativas++ < 40) setTimeout(tentar, 150); return; }
    let eq = LiveState.equipamentoPorId(pedido);
    if (!eq) {
      eq = LiveState.getEquipamentos().find((e) => e.tipo === "semaforo");
      if (!eq) return;
      toast(`"${pedido}" não existe no Cockpit (dados de exemplo). Mostrando ${eq.id}.`);
    }
    CockpitMap.selecionarEquipamento(eq.id, { centralizar: true });
  };
  tentar();
}

document.addEventListener("DOMContentLoaded", async () => {
  // Os widgets nascem já com os semáforos reais e as regiões cadastradas do Supabase.
  // Cada leitura falha sozinha: sem controladores mostra os de exemplo de data.js, sem
  // regiões cadastradas mostra só as de exemplo, e avisa.
  const [regioes, controladores] = await Promise.allSettled([buscarRegioesCadastradas(), buscarControladores()]);
  const avisos = [];
  if (regioes.status === "fulfilled") aplicarRegioesCadastradas(regioes.value);
  else {
    console.warn("[Cockpit] regiões cadastradas indisponíveis:", regioes.reason);
    avisos.push("as regiões cadastradas");
  }
  if (controladores.status === "fulfilled") {
    LiveState.substituirEquipamentosDoTipo("semaforo", montarSemaforos(controladores.value));
  } else {
    console.warn("[Cockpit] controladores do Supabase indisponíveis:", controladores.reason);
    avisos.push("os controladores");
  }
  reatribuirRegioes();
  initGrid();
  CockpitMap.setTiposGlobais(filtroGeral.tipos);
  atualizarFiltroGeralUI();
  if (avisos.length) toast(`Não foi possível ler ${avisos.join(" e ")} do banco. Mostrando só os dados de exemplo.`);
  if (adminAtivo()) carregarAdmin();
  abrirDispositivoDaUrl();
  LiveState.start(6000);
  // Card Totais reflete o "tempo real" sozinho (critério das 3 histórias). A Lista
  // Detalhada só atualiza quando o operador interage (busca/pagina/troca aba) pra
  // não roubar o foco do campo de busca a cada tick.
  LiveState.subscribe(() => {
    instances.forEach((inst) => {
      if (inst.type !== "mapa" && (inst.config.modo === "totais" || inst.type === "notificacoes")) renderWidgetBody(inst.id);
    });
    atualizarContagensRegioes();
  });
});
