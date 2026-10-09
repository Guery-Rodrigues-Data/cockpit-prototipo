/* ==========================================================================
   Cockpit — Widget de Mapa: só a camada Leaflet (desenho de polígonos, linhas
   e marcadores + zoom/destaque/foco). Cabeçalho, dropdowns de filtro e busca
   são markup do widget em app.js, que chama esta API — mantém a parte de mapa
   isolada como no editor.js do croqui-prototipo.
   Só existe 1 instância na tela (regra de negócio da história #125167), então
   isto é um único objeto, não uma classe instanciável.
   ========================================================================== */

const CockpitMap = (() => {
  let map = null;
  let layerRegioes = null; // polígonos de subárea + linhas de corredor
  // Agrupamento: UM L.markerClusterGroup por subárea (chave = id da subárea; "_sem" = sem subárea cadastrada). Cada
  // grupo só junta pinos da própria subárea, então um número nunca mistura subáreas ("10 erros" que eram 1 numa e 9
  // noutra). Quem não tem subárea agrupa por proximidade, entre si. Com ~1000 semáforos reais o mapa precisa agrupar.
  const gruposCluster = new Map();
  let layerProblemas = null; // offline/com alerta: fora do agrupamento, sempre visíveis um a um
  let bases = null; // mapas de fundo: { esri, osm }

  // Mapa de fundo: Esri cinza para todos; o do OpenStreetMap só vale com o modo admin ligado
  // (botão "Mapa OSM" no dock do admin), para testar como ficam sentido das vias e detalhes.
  const CHAVE_MAPA_BASE = "cockpitMapaBaseV1";
  // balão do agrupamento: lista todos até 8; acima disso mostra 5 e o resto vira "+ N outros"
  const MAX_LISTA_CLUSTER = 5;
  const LISTA_CLUSTER_COMPLETA_ATE = 8;
  function mapaBaseAtual() {
    try {
      const salvo = localStorage.getItem(CHAVE_MAPA_BASE);
      if (salvo === "satelite") return "satelite";
      return typeof adminAtivo === "function" && adminAtivo() && salvo === "osm" ? "osm" : "esri";
    } catch (e) {
      return "esri";
    }
  }
  function setMapaBase(nome) {
    try {
      localStorage.setItem(CHAVE_MAPA_BASE, nome);
    } catch (e) {}
    if (!map || !bases) return;
    Object.values(bases).forEach((b) => map.removeLayer(b));
    bases[mapaBaseAtual()].addTo(map);
    atualizarSeletorBase();
  }
  // botões "Mapa | Satélite" (canto inferior esquerdo): marca o fundo em uso
  function atualizarSeletorBase() {
    const atual = mapaBaseAtual();
    document.querySelectorAll("[data-mapa-base]").forEach((b) => b.classList.toggle("is-active", b.dataset.mapaBase === atual));
  }
  let layerDestaque = null; // anel pulsante da busca livre (não filtra, só aponta)
  // id do equipamento -> { marker, chave }. O tick de tempo real chama render() a cada
  // ~6s; em vez de recriar todos os pins, só troca o ícone dos que mudaram de estado.
  const marcadores = new Map();
  let onFiltroChange = () => {};
  let observadorTamanho = null; // ResizeObserver do container: mantém o Leaflet com o tamanho real
  // Seleção (clique num dispositivo ou numa região) é distinta do foco: só destaca e abre o
  // painel lateral (app.js), não filtra o resto do mapa.
  let selecao = null; // {tipo:'equipamento', id} | {tipo:'subarea'|'corredor', id}
  let aoSelecionar = () => {};
  // Largura do painel lateral (à direita do widget), para o mapa se afastar dele e não cobrir a
  // seleção. Mesma conta do CSS de .map-selecao: 30% do mapa, entre 340 e 420px.
  const larguraPainel = () => {
    const w = map ? map.getSize().x : 1000;
    return Math.min(Math.max(340, w * 0.3), 420, w - 20);
  };

  let filtro = {
    subareas: new Set(SUBAREAS.map((s) => s.id)),
    corredores: new Set(CORREDORES.map((c) => c.id)),
    categorias: new Set(CATEGORIAS_EQUIPAMENTO.map((c) => c.id)),
    statusAlerta: "todos", // 'todos' | 'somente-ativos'
    statusConexao: "todos", // 'todos' | 'online' | 'offline'
    // Seletor de alertas no topo do mapa: "todos" (só posição) | "todos-alertas" (todos, alertas em destaque) | "so-alertas"
    // (só com alarme ativo ou em modo operador, visaoPadrao). soProblemas é derivado dele (aplicarModoAlertas).
    modoAlertas: "todos",
    soProblemas: false,
    // Camadas: O QUE aparece no mapa (liga/desliga no topo do mapa). Independentes entre si.
    camadas: { subareas: true, corredores: true, controladores: true },
  };
  // assinatura do que está desenhado na camada de regiões: o tick de tempo real chama render() a
  // cada ~6s, e refazer os polígonos à toa apagaria o destaque de "mouse em cima" no meio do uso
  let assinaturaRegioes = "";
  let foco = null; // {tipo:'equipamento', id} | {tipo:'regiao', regiaoTipo:'subarea'|'corredor', id}

  function init(container, callbackFiltroChange, filtroSalvo) {
    onFiltroChange = callbackFiltroChange || (() => {});
    selecao = null;
    // Regra de negócio da #125167: filtros do Mapa persistem por perfil — restaura o
    // que foi salvo na sessão anterior em vez de sempre abrir com tudo selecionado.
    if (filtroSalvo) {
      filtro = {
        // Quais subáreas/corredores: sem controle na tela desde as camadas (24/09), então sempre
        // todas — um filtro antigo salvo com regiões desmarcadas as esconderia sem ter como voltar.
        subareas: new Set(SUBAREAS.map((s) => s.id)),
        corredores: new Set(CORREDORES.map((c) => c.id)),
        categorias: new Set(filtroSalvo.categorias || CATEGORIAS_EQUIPAMENTO.map((c) => c.id)),
        statusAlerta: filtroSalvo.statusAlerta || "todos",
        statusConexao: filtroSalvo.statusConexao || "todos",
        // o modo escolhido persiste (no sistema real, no perfil do usuário; aqui, no layout salvo)
        modoAlertas: ["todos", "todos-alertas", "so-alertas"].includes(filtroSalvo.modoAlertas) ? filtroSalvo.modoAlertas : "todos",
        soProblemas: false,
        // só "subareas" tem opção na legenda; corredores e controladores ficam sempre ligados (um valor salvo "desligado"
        // de antes esconderia o que a legenda já não deixa religar)
        camadas: { subareas: true, ...(filtroSalvo.camadas || {}), corredores: true, controladores: true },
      };
    }
    assinaturaRegioes = ""; // camada nova, vazia
    map = L.map(container, { zoomControl: false }).setView(CENTRO_CURITIBA, 13);
    // Mapa base: Esri Light Gray (sem chave). A CARTO passou a exigir chave de API e sem ela
    // desenha "API KEY REQUIRED" em cada pedaço do mapa (24/09). Fundo cinza-claro + nomes de rua
    // numa camada separada, acima das áreas coloridas e abaixo dos pinos. Acima do zoom 16 a Esri
    // não tem imagem própria: o Leaflet amplia a do 16.
    const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas";
    map.createPane("rotulos");
    map.getPane("rotulos").style.zIndex = 450; // entre as áreas (400) e os pinos (600)
    map.getPane("rotulos").style.pointerEvents = "none";
    bases = {
      esri: L.layerGroup([
        L.tileLayer(`${ESRI}/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`, {
          attribution: "Mapa &copy; Esri",
          maxNativeZoom: 16,
          maxZoom: 19,
        }),
        L.tileLayer(`${ESRI}/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, {
          pane: "rotulos",
          maxNativeZoom: 16,
          maxZoom: 19,
        }),
      ]),
      // Imagem de satélite da Esri (sem chave) + nomes de ruas/bairros por cima, na mesma camada
      // de rótulos do mapa cinza (acima das áreas, abaixo dos pinos).
      satelite: L.layerGroup([
        L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
          attribution: "Imagens &copy; Esri, Maxar, Earthstar Geographics",
          maxNativeZoom: 19,
          maxZoom: 19,
        }),
        L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}", {
          pane: "rotulos",
          maxNativeZoom: 19,
          maxZoom: 19,
        }),
      ]),
      // OpenStreetMap padrão: colorido, mas em zoom alto mostra setas de mão única, número e
      // detalhes das vias. Só para teste no modo admin (ver mapaBaseAtual).
      osm: L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
        maxZoom: 19,
      }),
    };
    bases[mapaBaseAtual()].addTo(map);
    // O Leaflet chama container.focus() a cada clique no mapa e o navegador rola o canvas do cockpit para mostrar o mapa inteiro
    // (o Mapa da tela padrão passa uns 45 px da borda): a tela "puxava para cima" em todo clique. O foco continua, sem rolar.
    const contMapa = map.getContainer();
    contMapa.focus = (opcoes) => HTMLElement.prototype.focus.call(contMapa, { ...opcoes, preventScroll: true });
    // Canto inferior direito: zoom +/− e, abaixo, "Centralizar" (enquadra tudo o que está visível).
    // Leaflet empilha no canto de baixo o último adicionado por cima, então o centralizar entra antes.
    const btnCentralizar = L.control({ position: "bottomright" });
    btnCentralizar.onAdd = () => {
      const el = L.DomUtil.create("div", "leaflet-bar mapa-ctrl-centralizar");
      el.innerHTML = `<a href="#" role="button" title="Centralizar: enquadrar tudo na tela" aria-label="Centralizar o mapa"><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4"/><circle cx="8" cy="8" r="1.6" fill="currentColor" stroke="none"/></svg></a>`;
      L.DomEvent.disableClickPropagation(el);
      L.DomEvent.on(el.firstChild, "click", (e) => { L.DomEvent.preventDefault(e); enquadrarVisiveis(); });
      return el;
    };
    btnCentralizar.addTo(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);

    // Canto inferior esquerdo: troca do fundo do mapa (onde ficava o zoom).
    const seletorBase = L.control({ position: "bottomleft" });
    seletorBase.onAdd = () => {
      const el = L.DomUtil.create("div", "mapa-ctrl-base");
      el.innerHTML = `<button type="button" data-mapa-base="esri">Mapa</button><button type="button" data-mapa-base="satelite">Satélite</button>`;
      L.DomEvent.disableClickPropagation(el);
      el.querySelectorAll("button").forEach((b) => L.DomEvent.on(b, "click", () => setMapaBase(b.dataset.mapaBase)));
      return el;
    };
    seletorBase.addTo(map);
    atualizarSeletorBase();

    // O Leaflet só mede o container quando mandam. O grid-stack aplica a altura do widget
    // depois de montar, e a janela ou o widget podem mudar depois; sem observar, o mapa ficava
    // com o tamanho de antes (cortando a parte de baixo ou deixando uma faixa cinza).
    let quadro = null;
    observadorTamanho = new ResizeObserver(() => {
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(() => map && map.invalidateSize());
    });
    observadorTamanho.observe(container);

    layerRegioes = L.layerGroup().addTo(map);
    gruposCluster.clear(); // os grupos nascem sob demanda, um por subárea (ver grupoCluster)
    layerProblemas = L.layerGroup().addTo(map);
    layerDestaque = L.layerGroup().addTo(map);

    LiveState.subscribe(render);
    render();
    // o grid-stack só dá o tamanho certo ao container depois de montado —
    // sem isto o Leaflet nasce com metade do tile carregado.
    setTimeout(() => map && map.invalidateSize(), 60);
    return map;
  }

  function destroy() {
    fecharMenuContexto();
    if (observadorTamanho) observadorTamanho.disconnect();
    observadorTamanho = null;
    if (map) map.remove();
    map = null;
    selecao = null;
    marcadores.clear();
  }

  function invalidateSize() {
    if (map) setTimeout(() => map.invalidateSize(), 60);
  }

  // Por enquanto o mapa mostra só controladores (pedido do Guery, 24/09). As outras categorias
  // continuam nos dados e nos widgets; para voltar, basta tirar esta checagem e reexibir o filtro
  // "Equipamentos" em app.js.
  // "sim" = dispositivo simulado no modo admin (Quantidade): entra no mapa de qualquer tipo, para testar volume
  const noMapa = (eq) => eq.tipo === "semaforo" || eq.origem === "sim";

  function equipamentoVisivel(eq) {
    if (!noMapa(eq)) return false;
    if (!filtro.camadas.controladores) return false; // camada "Dispositivos"
    if (!filtro.categorias.has(eq.tipo)) return false;
    if (tiposGlobais && !tiposGlobais.has(eq.tipo)) return false;
    if (filtro.soProblemas && !visaoPadrao(eq)) return false; // toggle "Somente alertas": vale junto com qualquer outro recorte
    if (filtroIds && !filtroIds.has(eq.id)) return false;
    if (filtroResumo.modo && LiveState.modoDoControlador(eq.id) !== filtroResumo.modo) return false;
    if (filtroResumo.status && LiveState.statusDoControlador(eq.id) !== filtroResumo.status) return false;
    if (filtroResumo.estado === "offline" && eq.online) return false;
    if (filtroResumo.estado === "alerta" && (!eq.online || LiveState.alertasDoEquipamento(eq.id).length === 0)) return false;
    // "olho" do Resumo: o que o operador escondeu linha a linha (independe do filtro "só este" acima)
    if (ocultosResumo.modo.has(LiveState.modoDoControlador(eq.id))) return false;
    if (ocultosResumo.status.has(LiveState.statusDoControlador(eq.id))) return false;
    if (ocultosResumo.estado.has("offline") && !eq.online) return false;
    if (ocultosResumo.estado.has("alerta") && eq.online && LiveState.alertasDoEquipamento(eq.id).length > 0) return false;
    if (filtro.statusConexao === "online" && !eq.online) return false;
    if (filtro.statusConexao === "offline" && eq.online) return false;
    if (filtro.statusAlerta === "somente-ativos" && LiveState.alertasDoEquipamento(eq.id).length === 0) return false;
    // gate por região: com todas as regiões escolhidas, quem não pertence a nenhuma passa (solto). Com recorte de
    // regiões ("Corredores com falha", por exemplo), só aparece quem está numa região escolhida: o resto some.
    if (eq.subareaId || eq.corredorId) {
      const passaSubarea = eq.subareaId && filtro.subareas.has(eq.subareaId);
      const passaCorredor = eq.corredorId && filtro.corredores.has(eq.corredorId);
      if (!passaSubarea && !passaCorredor) return false;
    } else if (!todasRegioes()) {
      return false;
    }
    if (regiaoSoFalha && !temProblema(eq)) return false;
    return true;
  }

  // Problema = offline ou com alerta ativo. É o que o operador precisa achar no meio de ~1000.
  const temProblema = (eq) => !eq.online || LiveState.alertasDoEquipamento(eq.id).length > 0;

  // "Somente alertas" (antes era a visão padrão, TESTE pedido da operação): só quem tem alerta ativo ou está em modo operador.
  // HIPÓTESE NÃO VALIDADA: dispositivo offline SEM alerta fica de fora; e "modo operador" ainda é dado simulado.
  const visaoPadrao = (eq) => LiveState.alertasDoEquipamento(eq.id).length > 0 || LiveState.modoDoControlador(eq.id) === "operador";
  // A visão padrão cede a qualquer recorte explícito (card clicado, Resumo, grupo de Alertas, status de conexão/alerta,
  // regiões escolhidas): sem isso, "Offline" ou "Corredores com falha" mostraria só a interseção com a visão padrão e
  // esconderia os controladores da região (os offline sem alarme, por exemplo).
  const todasRegioes = () => filtro.subareas.size >= SUBAREAS.length && filtro.corredores.size >= CORREDORES.length;
  const baseAtiva = () =>
    filtro.soProblemas && !recorteDeCard && !filtroIds && !filtroResumo.modo && !filtroResumo.status && !filtroResumo.estado &&
    filtro.statusConexao === "todos" && filtro.statusAlerta === "todos" && todasRegioes();

  // true = os controladores saudáveis do mapa estão esmaecidos pra o problema saltar (ver render())
  let saudaveisEsmaecidos = false;
  // Filtro vindo do widget Resumo: modo de controle ("centro"|"operador"|"local") e/ou estado
  // ("offline"|"alerta"). null = sem filtro naquele grupo. Esconde do mapa quem não bate (ver equipamentoVisivel).
  let filtroResumo = { modo: null, status: null, estado: null };
  // "Subáreas/Corredores com falha" (Resumo): além de só as regiões escolhidas, só os controladores COM falha dentro delas.
  // Qualquer outra mudança de região (filtros do mapa, card, ×) desliga isto.
  let regiaoSoFalha = false;
  // Um card clicado define sozinho o que o mapa mostra (ex.: "Dispositivos: 1000" mostra os 1000): a visão padrão não vale por cima.
  let recorteDeCard = false;
  // Filtro geral da tela (app.js): tipos de dispositivo permitidos em todos os widgets; por cima do filtro de categorias do mapa
  let tiposGlobais = null;
  let filtroIds = null; // Set de ids de equipamento: quando definido, só eles aparecem (ex.: grupo clicado em Alertas)
  let ocultosResumo = { modo: new Set(), status: new Set(), estado: new Set() }; // valores escondidos pelo olho
  const LIMITE_SOLTAR_FILTRADO = 40; // até quantos pinos filtrados ficam soltos, sem agrupar
  const resumoAtivo = () => !!(filtroResumo.modo || filtroResumo.status || filtroResumo.estado);
  // semEstado: o mapa só mostra POSIÇÃO — pino neutro, sem offline/alerta/modo, sem esmaecer. Vale na v1 (versoes.js) e,
  // nas outras versões, no modo "Todos" do seletor de alertas (filtro.modoAlertas); atualizado em aplicarModoAlertas().
  let semEstado = true;
  function aplicarModoAlertas() {
    // Regra de conceito (v2 e v3): o mapa mostra TUDO e fica estático (só posição). Não há seletor Todos / Todos + alertas / Só alertas;
    // o estado dos pinos só aparece quando um grupo do widget Alertas é clicado (filtroIds). Layouts antigos salvos com outro modo são ignorados.
    filtro.modoAlertas = "todos";
    filtro.soProblemas = filtro.modoAlertas === "so-alertas"; // o resto do mapa segue lendo soProblemas
    // grupo clicado no widget de Alertas = recorte de dispositivos com alerta: ali o estado aparece mesmo no modo "Todos"
    // idem quando o recorte vem do card Alertas ("somente com alerta ativo") ou de status de conexão: o estado aparece em cima do pino
    const recorteDeEstado = Versoes.tem("mapa.estado") && (filtro.statusAlerta === "somente-ativos" || filtro.statusConexao !== "todos");
    semEstado = filtro.modoAlertas === "todos" && !filtroIds && !recorteDeEstado;
  }
  const esmaece = (eq) => !semEstado && saudaveisEsmaecidos && !temProblema(eq);

  // Controlador: sempre o pino próprio; o estado vai numa bolinha no canto (vermelho = offline,
  // âmbar = alerta, sem bolinha = ok), pra problema não sumir no meio de ~1000 pinos iguais.
  // Demais categorias (fora do mapa por ora): ponto discreto se ok, pin com ícone se problema.
  function pinEquipamento(eq) {
    const alertaAtivo = !semEstado && LiveState.alertasDoEquipamento(eq.id).length > 0;
    const online = semEstado || eq.online;
    const sel = !!selecao && selecao.tipo === "equipamento" && selecao.id === eq.id;
    if (eq.tipo === "semaforo" || semEstado) { // v1: todos os tipos usam o mesmo pino (são todos iguais nesta versão)
      // duas bolinhas independentes: estado (offline/alerta) no canto direito, modo (Operador, azul) no esquerdo
      const modo = semEstado ? "centro" : LiveState.modoDoControlador(eq.id);
      const estado = !online ? "offline" : alertaAtivo ? "alerta" : "ok";
      return L.divIcon({
        html: `<div class="map-ctrl-pin${sel ? " is-selecionado" : ""}${esmaece(eq) ? " is-esmaecido" : ""}" data-estado="${estado}" data-modo="${modo}">${ICONE_PIN_CONTROLADOR}</div>`,
        className: "",
        iconSize: [24, 28],
        iconAnchor: [12, 27],
      });
    }
    if (online && !alertaAtivo) {
      return L.divIcon({
        html: `<div class="map-dot${sel ? " is-selecionado" : ""}"></div>`,
        className: "",
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
    }
    const cor = eq.online ? "var(--amber)" : "var(--red)";
    const icone = ICONES_CATEGORIA[eq.tipo] || "";
    return L.divIcon({
      html: `<div class="map-eq-pin${sel ? " is-selecionado" : ""}" style="--pin-cor:${cor}">${icone}</div>`,
      className: "",
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });
  }

  // Agrupamento. Na vista MISTA só tem saudável (os com problema ficam soltos, em layerProblemas) e ele é sempre neutro:
  // vermelho por 1 offline entre 40 faria o mapa parecer pior do que está. Na vista SÓ DE PROBLEMAS (visão padrão ou
  // "só com falha"), tudo é agrupado por proximidade e o agrupamento leva a cor do pior estado de dentro:
  // vermelho se há offline, âmbar se há alarme.
  function iconeCluster(cluster) {
    const n = cluster.getChildCount();
    const pior = Math.max(0, ...cluster.getAllChildMarkers().map((mk) => mk.eqEstado || 0)); // 2 offline, 1 alarme
    const estado = pior === 2 ? " is-offline" : pior === 1 ? " is-alerta" : "";
    return L.divIcon({
      html: `<div class="map-cluster${estado}" style="width:32px;height:32px"><span>${n}</span></div>`,
      className: "",
      iconSize: [32, 32],
    });
  }

  // Regra de conceito (v2 e v3): os dispositivos se agrupam em UM ícone por subárea e por tipo (nunca mistura subáreas nem tipos).
  // De longe cada subárea+tipo vira um número só; chegando perto (ou clicando no número) abre nos dispositivos.
  const ZOOM_DESAGRUPA = 15; // a partir daqui o agrupamento por subárea começa a se desfazer (ver maxClusterRadius)
  const chaveCluster = (eq) => `${eq.subareaId || "_sem"}|${eq.tipo || "_"}`;
  const subareaDaChave = (chave) => chave.split("|")[0];

  // Regra geral (todas as versões): quanto mais dispositivos no mapa, mais o mapa se defende da poluição — agrupa com
  // raio maior e mantém os pinos pequenos por mais zoom. O volume esperado é de 1000 a 2000 (Guery, 2026-10-07).
  // Contínuo (não em degraus): 1000 → ×1,5, 2000 → ×2, 4000 → ×2,75 (teto). Antes o fator era 1 até 1000 e só subia
  // depois, e o Guery viu o mapa com ~1000 mais bagunçado que com 2000 — o degrau de baixo era o mais fraco de todos.
  // Arredondado de 0,25 em 0,25 para não recriar os agrupamentos a cada dispositivo a mais.
  // HIPÓTESE NÃO VALIDADA: a curva (1,4 × (n/1000)^0,45) é chute; calibrar vendo o mapa e o zoom do admin.
  const fatorDensidade = () => {
    const n = LiveState.getEquipamentos().filter(noMapa).length;
    const bruto = 1.4 * Math.pow(Math.max(n, 1) / 1000, 0.45);
    return Math.round(Math.min(2.75, Math.max(0.75, bruto)) * 4) / 4;
  };

  // Tamanho do pino por zoom: de longe é só uma marca pequena; de perto, o pino inteiro. A escala vai numa variável CSS
  // do container (--pin-escala), então trocar de zoom não recria nenhum pino. Passando do zoom 15 o pino CRESCE além do
  // tamanho base (o Guery achou pequeno no zoom 16): 15 = base, 16 = 1,3x, 17+ = 1,5x. Com muito dispositivo
  // (~1000 ou mais) os zooms até 15 ficam um pouco menores (x0,85), para a poluição de longe, sem encolher os de perto.
  // HIPÓTESE NÃO VALIDADA: os tamanhos são chute; calibrar com o zoom mostrado no admin.
  function aplicarEscalaPino() {
    if (!map) return;
    const z = map.getZoom();
    let escala = z <= 12 ? 0.55 : z <= 14 ? 0.75 : z < 16 ? 1 : z < 17 ? 1.3 : 1.5;
    if (z <= 15 && fatorDensidade() >= 1.5) escala *= 0.85;
    map.getContainer().style.setProperty("--pin-escala", String(Math.round(escala * 100) / 100));
  }

  function grupoCluster(chave) {
    let g = gruposCluster.get(chave);
    if (g) return g;
    g = L.markerClusterGroup({
      showCoverageOnHover: false,
      // raio menor quanto mais perto: de longe junta mais, de perto só o que realmente se sobrepõe
      // raio enorme até o zoom 14 (a partir do 15 já vai desagrupando): a subárea inteira vira UM ícone (o agrupamento já é por subárea+tipo); de perto, só o que se sobrepõe
      maxClusterRadius: (zoom) => (zoom <= 14 ? 4000 : Math.round(30 * fatorDensidade())),
      disableClusteringAtZoom: 17,
      zoomToBoundsOnClick: false, // o enquadramento é feito abaixo (clusterclick), para focar só no que está dentro do clicado
      iconCreateFunction: iconeCluster,
    }).addTo(map);
    // clique no número do agrupamento: enquadra os dispositivos de dentro, mas nunca abaixo do zoom 15 (onde o agrupamento já
    // começa a se desfazer). Sem esse piso, uma subárea grande "cabe" no zoom 12 e o clique só movia o mapa, sem abrir nada.
    // Máximo 17, onde os pinos já ficam soltos.
    g.on("clusterclick", (e) => {
      e.layer.unbindTooltip();
      const b = e.layer.getBounds();
      const caber = map.getBoundsZoom(b, false, L.point(80, 104));
      const zoom = Math.min(17, Math.max(caber, ZOOM_DESAGRUPA));
      map.setView(b.getCenter(), zoom, { animate: true });
    });
    // mouse em cima do número do agrupamento: lista alguns controladores de dentro, sem precisar dar zoom
    g.on("clustermouseover", (e) => {
      const filhos = e.layer.getAllChildMarkers();
      const mostrar = filhos.length <= LISTA_CLUSTER_COMPLETA_ATE ? filhos.length : MAX_LISTA_CLUSTER;
      const itens = filhos
        .slice(0, mostrar)
        .map((mk) => `<li><strong>${mk.eqId}</strong><span>${mk.eqNome}</span></li>`)
        .join("");
      const resto = filhos.length - mostrar;
      const sa = subareaDaChave(chave);
      const onde = sa === "_sem" ? "" : ` · ${nomeSubarea(sa)}`;
      e.layer
        .bindTooltip(
          `<b>${filhos.length} controladores${onde}</b><ul>${itens}</ul>${resto > 0 ? `<small>+ ${resto} outros · clique para aproximar</small>` : ""}`,
          { direction: "top", offset: [0, -16], className: "map-eq-tooltip map-cluster-tooltip" }
        )
        .openTooltip();
    });
    g.on("clustermouseout", (e) => e.layer.unbindTooltip());
    gruposCluster.set(chave, g);
    return g;
  }

  // O raio de agrupamento é fixado quando o grupo nasce. Se o total de dispositivos muda de faixa (ex.: simulação do
  // admin, "Quantidade"), os grupos são descartados e recriados com o fator novo; os pinos voltam no fluxo normal abaixo.
  let fatorAplicado = null;
  function recriarGruposSeDensidadeMudou() {
    const f = fatorDensidade();
    if (fatorAplicado === null) { fatorAplicado = f; return; }
    if (f === fatorAplicado) return;
    fatorAplicado = f;
    gruposCluster.forEach((g) => map.removeLayer(g));
    gruposCluster.clear();
    marcadores.clear();
    layerProblemas.clearLayers();
    aplicarEscalaPino();
  }

  function sincronizarMarcadores(lista) {
    recriarGruposSeDensidadeMudou();
    const idsVisiveis = new Set(lista.map((eq) => eq.id));
    const remover = new Map(); // chave do grupo -> marcadores a tirar dele
    marcadores.forEach((m, id) => {
      if (!idsVisiveis.has(id)) {
        if (m.problema) layerProblemas.removeLayer(m.marker);
        else { if (!remover.has(m.grupo)) remover.set(m.grupo, []); remover.get(m.grupo).push(m.marker); }
        marcadores.delete(id);
      }
    });
    remover.forEach((lista2, g) => grupoCluster(g).removeLayers(lista2));

    const adicionar = new Map(); // chave do grupo -> marcadores a pôr nele
    const poeNoGrupo = (g, mk) => { if (!adicionar.has(g)) adicionar.set(g, []); adicionar.get(g).push(mk); };
    let mudouEstado = false;
    // Vista só de problemas: tudo entra no agrupamento (perto vira um número) em vez de ficar solto, um a um.
    // Modo "Todos" (semEstado) não tem estado: tudo agrupado e neutro, como na v1. "Todos + alertas": com alerta solto, o resto agrupado.
    const agruparTudo = baseAtiva() || regiaoSoFalha || !semEstado; // recorte com estado (card Alertas etc.) também agrupa por subárea+tipo
    // ...mas se já sobrou pouca coisa (é só erro e o recorte é pequeno), não precisa agrupar: ficam todos soltos.
    const soltarPoucos = agruparTudo && lista.length <= LIMITE_SOLTAR_FILTRADO;
    // Filtro do Resumo com poucos resultados: agrupar 2–4 pinos só atrapalha, então ficam todos soltos.
    const soltarTodos = (!!filtroIds || !!filtroResumo.modo || !!filtroResumo.status || !!filtroResumo.estado) && lista.length <= LIMITE_SOLTAR_FILTRADO;
    lista.forEach((eq) => {
      const alertaAtivo = !semEstado && LiveState.alertasDoEquipamento(eq.id).length > 0;
      const online = semEstado || eq.online;
      const ehSelecionado = !!selecao && selecao.tipo === "equipamento" && selecao.id === eq.id;
      const chave = `${online}|${alertaAtivo}|${ehSelecionado}|${esmaece(eq)}|${LiveState.modoDoControlador(eq.id)}|${soltarTodos}|${agruparTudo}|${soltarPoucos}|${chaveCluster(eq)}`;
      const estadoNum = !online ? 2 : alertaAtivo ? 1 : 0;
      // selecionado por cima de tudo, depois os com problema (ou em destaque), por último os saudáveis
      // fora do agrupamento: com problema na vista mista, filtro pequeno do Resumo, ou vista só de erros com poucos itens
      const problema = soltarPoucos || (!agruparTudo && (!online || alertaAtivo || soltarTodos));
      const zIndexOffset = ehSelecionado ? 2000 : problema ? 1000 : 0;
      const existente = marcadores.get(eq.id);
      if (!existente) {
        const marker = L.marker([eq.lat, eq.lng], { icon: pinEquipamento(eq), zIndexOffset });
        marker.on("click", () => selecionarEquipamento(eq.id, { centralizar: true }));
        marker.on("contextmenu", (ev) =>
          abrirMenuContexto(ev, [
            { label: "Modo de operação", opcoes: MODOS_OPERACAO },
            { label: "Enviar comando", opcoes: opcoesComando(eq.id) },
            { label: "Ajustar tempos (plano registrado)", acao: () => PainelControlador.abrirAjuste(eq.id) },
            { label: "Editar tabela horária" },
            { label: "Abrir detalhes", acao: () => selecionarEquipamento(eq.id, { centralizar: true }) },
          ])
        );
        marker.eqEstado = estadoNum; // cor do agrupamento (pior estado de dentro)
        marker.eqId = eq.id; // para a lista do balão do agrupamento
        marker.eqNome = eq.nome;
        // passar o mouse já mostra código e cruzamento, sem abrir o painel (nome já vem escapado)
        marker.bindTooltip(`<strong>${eq.id}</strong><span>${eq.nome}</span>`, {
          direction: "top",
          offset: [0, -14],
          className: "map-eq-tooltip",
        });
        marcadores.set(eq.id, { marker, chave, problema, grupo: chaveCluster(eq) });
        if (problema) layerProblemas.addLayer(marker);
        else poeNoGrupo(chaveCluster(eq), marker);
      } else if (existente.chave !== chave) {
        existente.marker.eqEstado = estadoNum;
        if (!existente.problema) mudouEstado = true; // está no agrupamento: refaz o ícone dele
        existente.marker.setIcon(pinEquipamento(eq));
        existente.marker.setZIndexOffset(zIndexOffset);
        existente.chave = chave;
        const grupo = chaveCluster(eq);
        if (existente.grupo !== grupo) {
          // mudou de subárea (cadastro/admin): sai do agrupamento antigo e entra no da subárea nova
          if (!existente.problema) grupoCluster(existente.grupo).removeLayer(existente.marker);
          if (!existente.problema && !problema) poeNoGrupo(grupo, existente.marker); // se virou "solto", o bloco abaixo cuida
          existente.grupo = grupo;
          mudouEstado = true;
        }
        if (existente.problema !== problema) {
          // mudou de lado: sai do agrupamento e fica solto, ou volta para o agrupamento
          if (problema) {
            grupoCluster(existente.grupo).removeLayer(existente.marker);
            layerProblemas.addLayer(existente.marker);
          } else {
            layerProblemas.removeLayer(existente.marker);
            poeNoGrupo(existente.grupo, existente.marker);
          }
          existente.problema = problema;
          mudouEstado = true;
        }
      }
    });
    adicionar.forEach((lista2, g) => grupoCluster(g).addLayers(lista2));
    if (mudouEstado) gruposCluster.forEach((g) => g.refreshClusters());
  }

  // Escala única, do mais claro ao mais escuro conforme a quantidade de controladores com falha (offline ou alarme).
  // Faixas absolutas (não relativas ao pior caso), para a cor significar o mesmo em qualquer tela e na lista de Regiões.
  const FAIXAS_ERROS = [
    { ate: 0, cor: "#c9ced6" }, // sem falha: cinza neutro
    { ate: 1, cor: "#f6c4bf" },
    { ate: 3, cor: "#ee8f86" },
    { ate: 6, cor: "#dc4f44" },
    { ate: 10, cor: "#b32a20" },
    { ate: Infinity, cor: "#7d1912" },
  ];
  const corPorErros = (n) => FAIXAS_ERROS.find((f) => n <= f.ate).cor;

  // por região: com controlador à vista (lista) e quantos têm falha (todos os controladores da região, sem filtro)
  let regioesComPino = { subarea: new Set(), corredor: new Set() };
  let errosPorRegiao = { subarea: new Map(), corredor: new Map() };
  // v1: total de dispositivos por região (todos os que estão no mapa), mostrado no hover da subárea
  let totalPorRegiao = { subarea: new Map(), corredor: new Map() };
  function atualizarEstatisticasRegioes(lista) {
    regioesComPino = { subarea: new Set(), corredor: new Set() };
    errosPorRegiao = { subarea: new Map(), corredor: new Map() };
    lista.forEach((eq) => {
      if (eq.subareaId) regioesComPino.subarea.add(eq.subareaId);
      if (eq.corredorId) regioesComPino.corredor.add(eq.corredorId);
    });
    totalPorRegiao = { subarea: new Map(), corredor: new Map() };
    LiveState.getEquipamentos().forEach((eq) => {
      if (noMapa(eq)) {
        if (eq.subareaId) totalPorRegiao.subarea.set(eq.subareaId, (totalPorRegiao.subarea.get(eq.subareaId) || 0) + 1);
        if (eq.corredorId) totalPorRegiao.corredor.set(eq.corredorId, (totalPorRegiao.corredor.get(eq.corredorId) || 0) + 1);
      }
      if (!noMapa(eq) || !temProblema(eq)) return;
      if (eq.subareaId) errosPorRegiao.subarea.set(eq.subareaId, (errosPorRegiao.subarea.get(eq.subareaId) || 0) + 1);
      if (eq.corredorId) errosPorRegiao.corredor.set(eq.corredorId, (errosPorRegiao.corredor.get(eq.corredorId) || 0) + 1);
    });
  }
  const errosDaRegiao = (tipo, id) => errosPorRegiao[tipo].get(id) || 0;

  function assinaturaDasRegioes() {
    return [
      JSON.stringify(filtro.camadas),
      filtro.modoAlertas + (semEstado ? "-sem-estado" : ""), // muda a cor das subáreas (cadastrada x escala de falhas)
      [...filtro.subareas].join(","),
      [...filtro.corredores].join(","),
      foco ? `${foco.tipo}:${foco.regiaoTipo || ""}:${foco.id}` : "",
      selecao ? `${selecao.tipo}:${selecao.id}` : "",
      SUBAREAS.map((s) => s.id + s.nome + s.poligono.length).join("|"),
      CORREDORES.map((c) => c.id + c.nome + c.linha.length).join("|"),
      // o que cada região mostra: tem pino à vista? e quantas falhas (cor e tooltip)
      SUBAREAS.map((s) => `${s.id}:${regioesComPino.subarea.has(s.id) ? 1 : 0}:${errosDaRegiao("subarea", s.id)}:${totalPorRegiao.subarea.get(s.id) || 0}`).join("|"),
      CORREDORES.map((c) => `${c.id}:${regioesComPino.corredor.has(c.id) ? 1 : 0}:${errosDaRegiao("corredor", c.id)}`).join("|"),
    ].join("#");
  }

  // Cada área com a sua cor, fixa pelo id (não muda ao recarregar nem quando outra área é
  // cadastrada/excluída). Fora da paleta de propósito: vermelho e âmbar (offline/alerta nos pinos),
  // verde (lê como "ok") e o azul dos corredores.
  const CORES_AREA = ["#7c4fd6", "#0e9384", "#d6458f", "#4f5bd5", "#0891b2", "#8a6d3b", "#9b59b6", "#5f7d1f"];
  // Recebe a área (não só o id): a cor oficial do cadastro, quando houver, vence a automática.
  // Exportada para a lista de Subáreas usar a mesma cor do mapa.
  function corDaArea(area) {
    if (area.cor) return area.cor;
    let h = 0;
    for (const ch of area.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return CORES_AREA[h % CORES_AREA.length];
  }

  function desenharRegioes() {
    layerRegioes.clearLayers();
    const focoRegiaoId = foco && foco.tipo === "regiao" ? foco.id : null;

    // camada desligada não desenha, exceto a região em foco (clicada na lista de Regiões)
    const emFoco = (tipo, id) => !!foco && foco.tipo === "regiao" && foco.regiaoTipo === tipo && foco.id === id;
    SUBAREAS.forEach((s) => {
      if (!filtro.camadas.subareas && !emFoco("subarea", s.id)) return;
      if (!filtro.subareas.has(s.id)) return;
      if (foco && foco.tipo === "regiao" && !(foco.regiaoTipo === "subarea" && foco.id === s.id)) return;
      // sem controlador à vista, a área não aparece (na vista só de erros, área sem erro é ruído)
      // v1: a área só some se não tem dispositivo nenhum; desligar "Dispositivos" no filtro não pode apagar as áreas
      const temPino = semEstado ? totalPorRegiao.subarea.has(s.id) : regioesComPino.subarea.has(s.id);
      if (!temPino && !emFoco("subarea", s.id)) return;
      const destacada = focoRegiaoId === s.id || (!!selecao && selecao.tipo === "subarea" && selecao.id === s.id);
      // a cor diz quantas falhas há na área: do mais claro ao mais escuro (FAIXAS_ERROS), em vez de uma cor por área
      // v1 (sem estado): todas as subáreas com o mesmo peso visual, na cor cadastrada (corDaArea), sem escala de falhas
      const erros = semEstado ? 0 : errosDaRegiao("subarea", s.id);
      // modo "Todos": cor cadastrada. Nos modos com alertas a cor é só a escala de falhas; área sem falha fica cinza,
      // para a cor cadastrada não competir com a escala
      const cor = semEstado ? corDaArea(s) : erros ? corPorErros(erros) : "#9ca3af";
      const preenche = erros ? 0.4 : 0.18;
      const poligono = L.polygon(s.poligono, {
        color: cor,
        weight: destacada ? 3 : 1.5,
        opacity: destacada ? 1 : 0.9,
        fillColor: cor,
        fillOpacity: destacada ? preenche + 0.12 : preenche,
      });
      poligono
        .bindTooltip(
          `<strong>${s.nome}</strong><br>${totalPorRegiao.subarea.get(s.id) || 0} ${totalPorRegiao.subarea.get(s.id) === 1 ? "dispositivo" : "dispositivos"}` + // resumo de quantidade (v1, mantido nas demais)
            (erros ? ` · ${erros} com falha` : ""),
          { permanent: false, direction: "center", className: "map-region-tooltip" })
        .on("mouseover", () => !destacada && poligono.setStyle({ weight: 2.5, fillOpacity: preenche + 0.1 }))
        .on("mouseout", () => !destacada && poligono.setStyle({ weight: 1.5, fillOpacity: preenche }))
        .on("click", (ev) => {
          L.DomEvent.stopPropagation(ev);
          selecionarRegiao("subarea", s.id);
          enquadrarRegiao("subarea", s.id); // zoom e centraliza na área, fora da faixa do painel
        })
        .on("contextmenu", (ev) =>
          abrirMenuContexto(ev, [
            { label: "Modo de operação", opcoes: MODOS_OPERACAO },
            { label: "Enviar comando para a subárea", opcoes: opcoesComando(null) },
            { label: "Editar tabela horária da subárea" },
            {
              label: "Abrir detalhes",
              acao: () => {
                selecionarRegiao("subarea", s.id);
                enquadrarRegiao("subarea", s.id);
              },
            },
          ])
        )
        .addTo(layerRegioes);
    });

    CORREDORES.forEach((c) => {
      if (!filtro.camadas.corredores && !emFoco("corredor", c.id)) return;
      if (!filtro.corredores.has(c.id)) return;
      if (foco && foco.tipo === "regiao" && !(foco.regiaoTipo === "corredor" && foco.id === c.id)) return;
      const temPinoCor = semEstado ? totalPorRegiao.corredor.has(c.id) : regioesComPino.corredor.has(c.id); // v1: ver acima
      if (!temPinoCor && !emFoco("corredor", c.id)) return; // sem controlador à vista, não aparece
      const destacado = focoRegiaoId === c.id || (!!selecao && selecao.tipo === "corredor" && selecao.id === c.id);
      const errosCor = semEstado ? 0 : errosDaRegiao("corredor", c.id);
      const aoClicar = (ev) => {
        L.DomEvent.stopPropagation(ev);
        selecionarRegiao("corredor", c.id);
        enquadrarRegiao("corredor", c.id);
      };
      // v1: corredor em grafite, opaco e mais grosso, com contorno branco por baixo para se destacar tanto no mapa claro
      // quanto no satélite (o azul fino anterior se perdia). Fora das cores de estado (vermelho/âmbar) e das subáreas.
      // v2/v3 herdam o visual da v1; o corredor só muda de cor quando tem falha
      const pesoBase = 4;
      const opBase = 1;
      L.polyline(c.linha, { color: "#fff", weight: destacado ? 8 : 7, opacity: 0.95, interactive: false }).addTo(layerRegioes);
      const linha = L.polyline(c.linha, {
        color: destacado ? "var(--red)" : errosCor ? corPorErros(errosCor) : "#1f2937",
        weight: destacado ? 5 : pesoBase,
        opacity: destacado ? 0.9 : opBase,
      })
        .bindTooltip(errosCor ? `${c.nome} · ${errosCor} com falha` : c.nome, { permanent: false, className: "map-region-tooltip" })
        .addTo(layerRegioes);
      // 2,5px é difícil de acertar com o mouse: uma linha invisível e larga por cima faz a área de
      // clique e de hover (o destaque é aplicado na linha visível)
      L.polyline(c.linha, { weight: 18, opacity: 0 })
        .on("mouseover", () => !destacado && linha.setStyle({ weight: 6, opacity: 1 }))
        .on("mouseout", () => !destacado && linha.setStyle({ weight: pesoBase, opacity: opBase }))
        .on("click", aoClicar)
        .addTo(layerRegioes);
    });
  }

  /* ---------- menu do botão direito (atalhos) ----------
     Atalhos sobre controlador/subárea. Ainda não levantados: só "Abrir detalhes" funciona; os
     demais só avisam (toast) que ainda não existem. HIPÓTESE NÃO VALIDADA: quais atalhos entram, e se "Enviar
     comando" pode sair direto daqui ou precisa de confirmação/permissão. */
  let menuContexto = null;
  // HIPÓTESE NÃO VALIDADA: só os dois primeiros aparecem nos planos de exemplo; os outros são
  // modos comuns em controlador, a confirmar com a lista real do DP40.
  const MODOS_OPERACAO = ["Tempo fixo com sincronismo", "Sequência lógica com sincronismo", "Amarelo intermitente", "Apagado"];

  // Comandos de hoje (os mesmos da aba Comandos), com uma linha entre Consultar e Executar.
  // No controlador: abre o painel na aba Comandos e dispara o botão de lá, então o resultado
  // aparece no mesmo lugar e Reset/Limpar alarmes continuam pedindo "Confirmar?".
  // Na subárea (eqId null): envio em massa ainda não existe, só avisa.
  function opcoesComando(eqId) {
    const todos = typeof PainelControlador !== "undefined" ? PainelControlador.listaComandos() : [];
    // na lista original os grupos vêm misturados: Consultar primeiro, depois Executar
    const lista = [...todos.filter((c) => c.grupo === "consultar"), ...todos.filter((c) => c.grupo !== "consultar")];
    const opcoes = [];
    lista.forEach((c, i) => {
      if (i > 0 && c.grupo !== lista[i - 1].grupo) opcoes.push("-");
      opcoes.push({ label: c.nome, acao: eqId ? () => comandoPeloMenu(eqId, c.id) : null });
    });
    return opcoes;
  }
  function comandoPeloMenu(eqId, cmdId) {
    selecionarEquipamento(eqId, { centralizar: true });
    setTimeout(() => {
      document.querySelector('.sel-aba[data-aba="comandos"]')?.click();
      setTimeout(() => document.querySelector(`[data-sel-cmd="${cmdId}"][data-eq="${eqId}"]`)?.click(), 0);
    }, 0);
  }

  function abrirSubmenu(menu, linha) {
    menu.querySelectorAll(".map-ctx-tem-sub.is-aberto").forEach((l) => l !== linha && l.classList.remove("is-aberto"));
    if (!linha || linha.classList.contains("is-aberto")) return;
    linha.classList.add("is-aberto");
    // perto do rodapé da tela o submenu sobe até caber
    const sub = linha.querySelector(".map-ctx-sub");
    sub.style.top = "";
    const r = sub.getBoundingClientRect();
    if (r.bottom > innerHeight - 8) sub.style.top = `${-5 - (r.bottom - innerHeight + 8)}px`;
  }

  function fecharMenuContexto() {
    if (!menuContexto) return;
    menuContexto.remove();
    menuContexto = null;
    document.removeEventListener("mousedown", aoClicarFora, true);
    document.removeEventListener("keydown", aoTeclarMenu, true);
    if (map) map.off("movestart zoomstart", fecharMenuContexto);
  }
  function aoClicarFora(e) {
    if (menuContexto && !menuContexto.contains(e.target)) fecharMenuContexto();
  }
  function aoTeclarMenu(e) {
    if (e.key !== "Escape") return;
    e.stopImmediatePropagation(); // Esc fecha só o menu, não o painel
    fecharMenuContexto();
  }

  function abrirMenuContexto(ev, itens) {
    L.DomEvent.preventDefault(ev.originalEvent); // sem o menu do navegador
    L.DomEvent.stopPropagation(ev); // controlador em cima de subárea: abre só o do controlador
    if (!Versoes.tem("mapa.menu-contexto")) return; // v1/v2: tudo no menu é escrita no controlador
    fecharMenuContexto();
    const el = document.createElement("div");
    el.className = "map-ctx-menu";
    el.setAttribute("role", "menu");
    itens.forEach((item) => {
      if (item.opcoes) {
        // submenu no estilo do Windows: passa o mouse (ou foca) e a lista abre ao lado
        const linha = document.createElement("div");
        linha.className = "map-ctx-item map-ctx-tem-sub";
        linha.tabIndex = 0;
        linha.setAttribute("role", "menuitem");
        linha.setAttribute("aria-haspopup", "menu");
        linha.innerHTML = `<span>${item.label}</span><span class="map-ctx-seta" aria-hidden="true">›</span>`;
        const sub = document.createElement("div");
        sub.className = "map-ctx-menu map-ctx-sub";
        sub.setAttribute("role", "menu");
        item.opcoes.forEach((o) => {
          if (o === "-") {
            sub.insertAdjacentHTML("beforeend", '<div class="map-ctx-sep" role="separator"></div>');
            return;
          }
          const op = typeof o === "string" ? { label: o } : o;
          const b = document.createElement("button");
          b.type = "button";
          b.setAttribute("role", "menuitem");
          b.className = "map-ctx-item";
          b.textContent = op.label;
          b.addEventListener("click", () => {
            fecharMenuContexto();
            if (op.acao) op.acao();
            else if (typeof toast === "function") toast(`"${op.label}" ainda não é enviado ao controlador no protótipo`);
          });
          sub.appendChild(b);
        });
        linha.appendChild(sub);
        el.appendChild(linha);
        return;
      }
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "menuitem");
      b.className = "map-ctx-item";
      b.textContent = item.label;
      b.addEventListener("click", () => {
        fecharMenuContexto();
        if (item.acao) item.acao();
        else if (typeof toast === "function") toast(`"${item.label}" ainda não disponível no protótipo`);
      });
      el.appendChild(b);
    });
    document.body.appendChild(el);
    // abre no ponto do clique, sem sair da tela
    // Posição pelo ponto do Leaflet (containerPoint + canto do mapa na tela), que sempre vem;
    // clientX/Y do evento pode faltar e aí o menu caía no topo da página.
    const oe = ev.originalEvent || {};
    const caixa = map.getContainer().getBoundingClientRect();
    const x = Number.isFinite(oe.clientX) ? oe.clientX : caixa.left + ev.containerPoint.x;
    const y = Number.isFinite(oe.clientY) ? oe.clientY : caixa.top + ev.containerPoint.y;
    const r = el.getBoundingClientRect();
    el.style.left = `${Math.max(8, Math.min(x, innerWidth - r.width - 8))}px`;
    el.style.top = `${Math.max(8, Math.min(y, innerHeight - r.height - 8))}px`;
    // sem espaço à direita para o submenu: ele abre para a esquerda
    if (el.getBoundingClientRect().right + 240 > innerWidth) el.classList.add("is-sub-esquerda");
    menuContexto = el;
    document.addEventListener("mousedown", aoClicarFora, true);
    document.addEventListener("keydown", aoTeclarMenu, true);
    map.on("movestart zoomstart", fecharMenuContexto);
    map.on("zoomend", aplicarEscalaPino);
    aplicarEscalaPino();
    // Submenu controlado aqui, não por :hover/:focus-within no CSS: com CSS, o item focado
    // deixava um submenu aberto e o do mouse abria outro por cima. Só um aberto por vez.
    el.addEventListener("mouseover", (e) => {
      const linha = e.target.closest(".map-ctx-item");
      if (!linha || linha.parentElement !== el) return; // mouse dentro de um submenu: mantém
      abrirSubmenu(el, linha.classList.contains("map-ctx-tem-sub") ? linha : null);
    });
    el.querySelectorAll(".map-ctx-tem-sub").forEach((linha) => {
      linha.addEventListener("click", (e) => {
        if (e.target === linha || e.target.parentElement === linha) abrirSubmenu(el, linha);
      });
      linha.addEventListener("keydown", (e) => {
        if (e.target !== linha || (e.key !== "Enter" && e.key !== "ArrowRight")) return;
        e.preventDefault();
        abrirSubmenu(el, linha);
        linha.querySelector(".map-ctx-sub .map-ctx-item")?.focus();
      });
    });
  }

  function render() {
    if (!map) return;
    aplicarModoAlertas();
    if (selecao && !selecaoExiste()) {
      selecao = null;
      aoSelecionar(null);
    }

    const lista = LiveState.getEquipamentos().filter((eq) => {
      if (foco && foco.tipo === "equipamento") return eq.id === foco.id;
      if (foco && foco.tipo === "regiao") {
        // região escolhida em um widget (lista de Regiões etc.): zoom nela e só o que tem problema (offline ou alarme)
        const naRegiao = foco.regiaoTipo === "subarea" ? eq.subareaId === foco.id : eq.corredorId === foco.id;
        return naRegiao && temProblema(eq);
      }
      return equipamentoVisivel(eq);
    });

    // Regiões: só desenha a que tem controlador à vista, e a cor vem de quantos controladores têm falha nela
    // (ver corPorErros). Recalculado a cada render; só redesenha se algo disso mudou (assinatura).
    atualizarEstatisticasRegioes(lista);
    const assinatura = assinaturaDasRegioes();
    if (assinatura !== assinaturaRegioes) {
      assinaturaRegioes = assinatura;
      desenharRegioes();
    }

    // Tela inicial de resolução: com ao menos um problema no que está visível, os saudáveis esmaecem
    // (continuam no mapa, dão contexto) e os problemas saltam. Sem problema nenhum, nada esmaece
    // (não haveria o que destacar, e o mapa não pode parecer vazio).
    // Na visão padrão só aparece o que já chama atenção: não há saudável para esmaecer.
    // Com recorte do Resumo só aparece o que foi escolhido: nada esmaece (o escolhido não pode ficar apagado).
    saudaveisEsmaecidos = !semEstado && !baseAtiva() && !resumoAtivo() && !regiaoSoFalha && lista.some(temProblema);

    // Agrupamentos só contêm controladores saudáveis (os com problema ficam soltos), então esmaecem junto
    map.getContainer().classList.toggle("map-esmaece-saudaveis", saudaveisEsmaecidos);
    // equipamento selecionado: ele cresce e todos os outros pinos esmaecem (CSS .map-tem-selecao)
    map.getContainer().classList.toggle("map-tem-selecao", !!selecao && selecao.tipo === "equipamento");

    sincronizarMarcadores(lista);
    // Visão padrão sem nenhum dispositivo: avisa, para o mapa vazio não parecer defeito (é uma boa notícia)
    const vazio = map.getContainer().parentElement && map.getContainer().parentElement.querySelector(".map-vazio");
    if (vazio) vazio.hidden = !(filtro.soProblemas && lista.length === 0);

    onFiltroChange({
      contagens: getContagens(),
      focoLabel: focoLabel(),
      filtroSerializado: {
        subareas: [...filtro.subareas],
        corredores: [...filtro.corredores],
        categorias: [...filtro.categorias],
        statusAlerta: filtro.statusAlerta,
        statusConexao: filtro.statusConexao,
        soProblemas: filtro.soProblemas,
        modoAlertas: filtro.modoAlertas,
        camadas: { ...filtro.camadas },
      },
    });
  }

  /* ---------- seleção (painel lateral) ---------- */

  function selecaoExiste() {
    if (selecao.tipo === "equipamento") return !!LiveState.equipamentoPorId(selecao.id);
    return (selecao.tipo === "subarea" ? SUBAREAS : CORREDORES).some((r) => r.id === selecao.id);
  }

  function emitirSelecao() {
    aoSelecionar(selecao ? { ...selecao } : null);
  }

  // Empurra o mapa para a esquerda se o ponto ficaria escondido atrás do painel (à direita).
  function afastarDoPainel(latlng) {
    const limite = map.getSize().x - (larguraPainel() + 50);
    const x = map.latLngToContainerPoint(latlng).x;
    if (x > limite) map.panBy([x - limite, 0]);
  }

  function selecionarEquipamento(id, { centralizar = false } = {}) {
    const eq = LiveState.equipamentoPorId(id);
    if (!eq || !map) return;
    if (!Versoes.tem("mapa.selecao")) return; // v1: clicar no pino não abre painel nem esmaece os outros
    selecao = { tipo: "equipamento", id };
    if (centralizar) {
      // centro do mapa fica à direita do pin: o pin cai no meio da parte livre, à esquerda do painel
      const zoom = Math.max(map.getZoom(), 17);
      const alvo = map.project([eq.lat, eq.lng], zoom).add([larguraPainel() / 2, 0]);
      map.setView(map.unproject(alvo, zoom), zoom, { animate: true });
    } else {
      afastarDoPainel([eq.lat, eq.lng]);
    }
    render();
    emitirSelecao();
  }

  function selecionarRegiao(regiaoTipo, id) {
    if (!map) return;
    if (!Versoes.tem("mapa.selecao")) return; // v1: clicar na subárea/corredor também não abre painel
    // escolhida pela lista, a região precisa estar desenhada: se o filtro a escondia, liga
    (regiaoTipo === "subarea" ? filtro.subareas : filtro.corredores).add(id);
    selecao = { tipo: regiaoTipo, id };
    render();
    emitirSelecao();
  }

  function limparSelecao() {
    if (!selecao) return;
    selecao = null;
    if (map) render();
    emitirSelecao();
  }

  // Para quem alterou algo da região selecionada (ex.: renomeou) e precisa redesenhar o painel.
  function reemitirSelecao() {
    if (selecao) emitirSelecao();
  }

  // Ajusta o zoom para mostrar a região inteira, deixando livre a faixa do painel lateral.
  function enquadrarRegiao(regiaoTipo, id) {
    if (!map) return;
    const reg = (regiaoTipo === "subarea" ? SUBAREAS : CORREDORES).find((r) => r.id === id);
    if (!reg) return;
    const bounds = regiaoTipo === "subarea" ? L.polygon(reg.poligono).getBounds() : L.polyline(reg.linha).getBounds();
    map.fitBounds(bounds, { paddingTopLeft: [40, 60], paddingBottomRight: [larguraPainel() + 40, 40] });
  }

  // Depois de filtrar pelos widgets: ajusta o zoom e centraliza para caber o que ficou visível.
  // Inclui as regiões quando o filtro de regiões é só um subconjunto. Com painel lateral aberto,
  // deixa a folga dele à direita. Não chamar a cada tick de tempo real (mexeria no mapa à toa).
  function enquadrarVisiveis() {
    if (!map) return;
    if (semEstado) return centralizarV1();
    const pts = semDistantes(LiveState.getEquipamentos().filter(equipamentoVisivel).map((e) => [e.lat, e.lng])); // ignora ponto muito distante, como na v1
    if (filtro.subareas.size < SUBAREAS.length) SUBAREAS.filter((s) => filtro.subareas.has(s.id)).forEach((s) => pts.push(...s.poligono));
    if (filtro.corredores.size < CORREDORES.length) CORREDORES.filter((c) => filtro.corredores.has(c.id)).forEach((c) => pts.push(...c.linha));
    if (!pts.length) return;
    const direita = selecao ? larguraPainel() + 40 : 40;
    if (pts.length === 1) { map.setView(pts[0], 17, { animate: true }); return; }
    map.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [40, 60], paddingBottomRight: [direita, 40], maxZoom: 17, animate: true });
  }

  // Tira da conta do enquadramento os pontos MUITO longe do resto (um controlador a 26 km abria o zoom para o estado
  // inteiro). Regra: distância até o centro (mediana) maior que Q3 + 3×(Q3−Q1) das distâncias. Com o banco atual
  // (~1090 controladores) isso corta só o 293108 (Rodovia do Café, 26 km) e mantém o grupo do sul a ~16 km. O ponto
  // continua no mapa; só não "puxa" o Centralizar. Com menos de 10 pontos não corta nada.
  function semDistantes(pts) {
    if (pts.length < 10) return pts;
    const mediana = (v) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
    const centro = L.latLng(mediana(pts.map((p) => p[0])), mediana(pts.map((p) => p[1])));
    const dist = pts.map((p) => centro.distanceTo(L.latLng(p)));
    const ord = [...dist].sort((a, b) => a - b);
    const q1 = ord[Math.floor(ord.length * 0.25)];
    const q3 = ord[Math.floor(ord.length * 0.75)];
    const limite = q3 + 3 * (q3 - q1);
    return pts.filter((_, i) => dist[i] <= limite);
  }

  // v1: "Centralizar" enquadra tudo o que está LIGADO no filtro (dispositivos, subáreas, corredores), com folga igual
  // dos quatro lados (a de cima é maior só para a busca e o botão Filtros, que ficam sobre o mapa). Recalcula o tamanho
  // do mapa antes, para o cálculo valer depois de redimensionar o card. Nada ligado = volta à visão inicial de Curitiba.
  function centralizarV1() {
    map.invalidateSize();
    const pts = [];
    if (filtro.camadas.controladores) pts.push(...semDistantes(LiveState.getEquipamentos().filter(equipamentoVisivel).map((e) => [e.lat, e.lng])));
    if (filtro.camadas.subareas) SUBAREAS.filter((s) => totalPorRegiao.subarea.has(s.id)).forEach((s) => pts.push(...s.poligono));
    if (filtro.camadas.corredores) CORREDORES.filter((c) => totalPorRegiao.corredor.has(c.id)).forEach((c) => pts.push(...c.linha));
    if (!pts.length) { map.setView(CENTRO_CURITIBA, 13, { animate: true }); return; }
    if (pts.length === 1) { map.setView(pts[0], 17, { animate: true }); return; }
    map.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [40, 64], paddingBottomRight: [40, 40], maxZoom: 17, animate: true });
  }

  function enquadrarSelecao() {
    if (selecao && selecao.tipo !== "equipamento") enquadrarRegiao(selecao.tipo, selecao.id);
  }

  function definirAoSelecionar(fn) {
    aoSelecionar = fn || (() => {});
  }

  function getSelecao() {
    return selecao ? { ...selecao } : null;
  }

  function focoLabel() {
    if (!foco) return null;
    if (foco.tipo === "equipamento") {
      const eq = LiveState.equipamentoPorId(foco.id);
      return eq ? eq.nome : null;
    }
    return foco.regiaoTipo === "subarea" ? nomeSubarea(foco.id) : nomeCorredor(foco.id);
  }

  function getContagens() {
    return {
      subareas: { sel: filtro.subareas.size, total: SUBAREAS.length },
      corredores: { sel: filtro.corredores.size, total: CORREDORES.length },
      categorias: { sel: filtro.categorias.size, total: CATEGORIAS_EQUIPAMENTO.length },
      problemas: LiveState.getEquipamentos().filter((eq) => noMapa(eq) && temProblema(eq)).length,
    };
  }

  function getFiltro() {
    return filtro;
  }

  // Instância Leaflet, para o modo de cadastro (admin.js) desenhar em cima. Null se o
  // widget de Mapa não está na tela.
  function getMap() {
    return map;
  }

  // Chamado quando regiões são cadastradas/excluídas: aplica a lista já reconciliada
  // (app.js) sem mexer nos demais filtros, e larga o foco se a região dele sumiu.
  function setFiltroRegioes(subareasIds, corredoresIds, opcoes) {
    regiaoSoFalha = !!(opcoes && opcoes.soComFalha);
    filtro.subareas = new Set(subareasIds);
    filtro.corredores = new Set(corredoresIds);
    if (foco && foco.tipo === "regiao") {
      const lista = foco.regiaoTipo === "subarea" ? SUBAREAS : CORREDORES;
      if (!lista.some((r) => r.id === foco.id)) foco = null;
    }
    render();
  }

  function toggleSubarea(id) {
    regiaoSoFalha = false;
    filtro.subareas.has(id) ? filtro.subareas.delete(id) : filtro.subareas.add(id);
    render();
  }
  function toggleCorredor(id) {
    regiaoSoFalha = false;
    filtro.corredores.has(id) ? filtro.corredores.delete(id) : filtro.corredores.add(id);
    render();
  }
  function toggleCategoria(id) {
    filtro.categorias.has(id) ? filtro.categorias.delete(id) : filtro.categorias.add(id);
    render();
  }
  function setTodas(campo, valor) {
    regiaoSoFalha = false;
    const ids =
      campo === "subareas"
        ? SUBAREAS.map((s) => s.id)
        : campo === "corredores"
        ? CORREDORES.map((c) => c.id)
        : CATEGORIAS_EQUIPAMENTO.map((c) => c.id);
    filtro[campo] = valor ? new Set(ids) : new Set();
    render();
  }
  function setStatusAlerta(valor) {
    filtro.statusAlerta = valor;
    render();
  }
  function setCamada(nome, ligada) {
    filtro.camadas[nome] = !!ligada;
    render();
  }
  function setModoAlertas(modo) {
    if (!["todos", "todos-alertas", "so-alertas"].includes(modo)) return;
    filtro.modoAlertas = modo;
    render();
  }
  const setSoProblemas = (valor) => setModoAlertas(valor ? "so-alertas" : "todos"); // compatibilidade
  function setTiposGlobais(ids) {
    tiposGlobais = new Set(ids);
    render();
  }
  function setStatusConexao(valor) {
    filtro.statusConexao = valor;
    render();
  }

  // ---------- integração com outros widgets / busca livre ----------

  // Chamado quando o operador clica no número/lista de outro widget: substitui o
  // filtro do Mapa pelo recorte daquele card (critério de "Integração com o Widget
  // de Mapa" das histórias #125168/#125169/#128628).
  function setFiltroCompleto(payload) {
    foco = null;
    regiaoSoFalha = false;
    if (payload.tipos) filtro.categorias = new Set(payload.tipos);
    if (payload.regioes) {
      filtro.subareas = new Set(payload.regioes.filter((id) => SUBAREAS.some((s) => s.id === id)));
      filtro.corredores = new Set(payload.regioes.filter((id) => CORREDORES.some((c) => c.id === id)));
    }
    filtro.statusConexao = payload.statusConexao || "todos";
    filtro.statusAlerta = payload.statusAlerta || "todos";
    recorteDeCard = true; // o card manda: o recorte dele (tipos/regiões/status) é o que se vê, sem a visão padrão por cima
    render();
  }

  // Widget Resumo: filtra o mapa por modo de controle e/ou estado (parcial: só o que vier no objeto
  // muda; null limpa aquele grupo). Ver LiveState.modoDoControlador (dado simulado por ora).
  function setFiltroResumo(parcial) {
    filtroResumo = { ...filtroResumo, ...parcial };
    render();
  }
  // Filtra o mapa por uma lista de equipamentos (null limpa). Usado pelos grupos clicados em Alertas.
  function setFiltroIds(ids) {
    filtroIds = ids && ids.length ? new Set(ids) : null;
    render();
  }
  function getFiltroIds() {
    return filtroIds ? new Set(filtroIds) : null;
  }
  // O que está recortando o mapa agora (alimenta a tag "Filtrando: ..."). visaoPadrao = só alarme ou modo operador.
  function getRecorte() {
    return {
      visaoPadrao: baseAtiva(),
      recorteDeCard,
      resumo: { ...filtroResumo },
      ids: filtroIds ? filtroIds.size : 0,
      statusConexao: filtro.statusConexao,
      statusAlerta: filtro.statusAlerta,
      regiaoSoFalha,
      subareas: [filtro.subareas.size, SUBAREAS.length],
      corredores: [filtro.corredores.size, CORREDORES.length],
    };
  }
  // "×" da tag: tira todos os recortes (o toggle "Somente alertas" continua como o operador deixou)
  function limparRecortes() {
    regiaoSoFalha = false;
    recorteDeCard = false;
    filtroResumo = { modo: null, status: null, estado: null };
    filtroIds = null;
    filtro.statusConexao = "todos";
    filtro.statusAlerta = "todos";
    filtro.subareas = new Set(SUBAREAS.map((s) => s.id));
    filtro.corredores = new Set(CORREDORES.map((c) => c.id));
    filtro.categorias = new Set(CATEGORIAS_EQUIPAMENTO.map((c) => c.id));
    render();
  }
  function getFiltroResumo() {
    return { ...filtroResumo };
  }
  // Olho do Resumo: esconde/mostra no mapa quem tem aquele valor (grupo: "modo" | "status" | "estado").
  function toggleOcultoResumo(grupo, valor) {
    const set = ocultosResumo[grupo];
    set.has(valor) ? set.delete(valor) : set.add(valor);
    render();
  }
  function getOcultosResumo() {
    return { modo: new Set(ocultosResumo.modo), status: new Set(ocultosResumo.status), estado: new Set(ocultosResumo.estado) };
  }

  function limparFoco() {
    foco = null;
    render();
  }

  function focarEquipamento(id) {
    foco = { tipo: "equipamento", id };
    render();
    const eq = LiveState.equipamentoPorId(id);
    if (eq && map) map.setView([eq.lat, eq.lng], 16, { animate: true });
  }

  // Filtra o mapa só por essa região e a enquadra. Quem já cuida do enquadramento (a lista de
  // Regiões, que também abre o painel) passa { enquadrar: false }.
  function focarRegiao(regiaoTipo, id, { enquadrar = true } = {}) {
    foco = { tipo: "regiao", regiaoTipo, id };
    render();
    if (enquadrar) enquadrarRegiao(regiaoTipo, id);
  }

  // Busca livre: só destaca + centraliza, não filtra o resto (critério da #125167
  // é distinto da integração de clique dos outros widgets, que filtra de verdade).
  function buscar(termo) {
    layerDestaque.clearLayers();
    const q = termo.trim().toLowerCase();
    if (!q) return null;

    const eq = LiveState.getEquipamentos().find((e) => e.nome.toLowerCase().includes(q) || e.id.toLowerCase() === q);
    if (eq) {
      // 17 = zoom em que o cluster se desfaz (disableClusteringAtZoom); em 16 o pin
      // achado poderia continuar escondido dentro de um agrupamento.
      map.setView([eq.lat, eq.lng], 17, { animate: true });
      L.circleMarker([eq.lat, eq.lng], { radius: 16, className: "map-destaque-ring" }).addTo(layerDestaque);
      return { tipo: "equipamento", label: eq.nome };
    }
    const sub = SUBAREAS.find((s) => s.nome.toLowerCase().includes(q));
    if (sub) {
      map.fitBounds(L.polygon(sub.poligono).getBounds(), { padding: [40, 40] });
      return { tipo: "subarea", label: sub.nome };
    }
    const cor = CORREDORES.find((c) => c.nome.toLowerCase().includes(q));
    if (cor) {
      map.fitBounds(L.polyline(cor.linha).getBounds(), { padding: [40, 40] });
      return { tipo: "corredor", label: cor.nome };
    }
    return null;
  }

  return {
    init,
    destroy,
    invalidateSize,
    getFiltro,
    getMap,
    definirAoSelecionar,
    selecionarEquipamento,
    selecionarRegiao,
    limparSelecao,
    reemitirSelecao,
    enquadrarSelecao,
    enquadrarVisiveis,
    getSelecao,
    setFiltroRegioes,
    getContagens,
    toggleSubarea,
    toggleCorredor,
    toggleCategoria,
    setTodas,
    setStatusAlerta,
    setFiltroResumo,
    getFiltroResumo,
    setFiltroIds,
    getFiltroIds,
    getRecorte,
    limparRecortes,
    toggleOcultoResumo,
    getOcultosResumo,
    setStatusConexao,
    setTiposGlobais,
    setSoProblemas,
    setModoAlertas,
    setCamada,
    setMapaBase,
    mapaBaseAtual,
    setFiltroCompleto,
    focarEquipamento,
    focarRegiao,
    limparFoco,
    buscar,
    corDaArea,
    corPorErros,
  };
})();
