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
  let layerEquipamentos = null; // L.markerClusterGroup: com ~1000 semáforos reais o mapa precisa agrupar
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
      return typeof adminAtivo === "function" && adminAtivo() && localStorage.getItem(CHAVE_MAPA_BASE) === "osm" ? "osm" : "esri";
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
    soProblemas: false, // só offline OU com alerta ativo (o OR que os dois filtros acima não fazem)
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
        soProblemas: !!filtroSalvo.soProblemas,
        camadas: { subareas: true, corredores: true, controladores: true, ...(filtroSalvo.camadas || {}) },
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
      // OpenStreetMap padrão: colorido, mas em zoom alto mostra setas de mão única, número e
      // detalhes das vias. Só para teste no modo admin (ver mapaBaseAtual).
      osm: L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
        maxZoom: 19,
      }),
    };
    bases[mapaBaseAtual()].addTo(map);
    L.control.zoom({ position: "bottomleft" }).addTo(map); // à esquerda: o painel de seleção ocupa a direita

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
    layerEquipamentos = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 50,
      disableClusteringAtZoom: 17,
      iconCreateFunction: iconeCluster,
    }).addTo(map);
    // mouse em cima do número do agrupamento: lista alguns controladores de dentro, sem precisar dar zoom
    layerEquipamentos.on("clustermouseover", (e) => {
      const filhos = e.layer.getAllChildMarkers();
      const mostrar = filhos.length <= LISTA_CLUSTER_COMPLETA_ATE ? filhos.length : MAX_LISTA_CLUSTER;
      const itens = filhos
        .slice(0, mostrar)
        .map((m) => `<li><strong>${m.eqId}</strong><span>${m.eqNome}</span></li>`)
        .join("");
      const resto = filhos.length - mostrar;
      e.layer
        .bindTooltip(
          `<b>${filhos.length} controladores</b><ul>${itens}</ul>${resto > 0 ? `<small>+ ${resto} outros · clique para aproximar</small>` : ""}`,
          { direction: "top", offset: [0, -16], className: "map-eq-tooltip map-cluster-tooltip" }
        )
        .openTooltip();
    });
    layerEquipamentos.on("clustermouseout", (e) => e.layer.unbindTooltip());
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
  const noMapa = (eq) => eq.tipo === "semaforo";

  function equipamentoVisivel(eq) {
    if (!noMapa(eq)) return false;
    if (eq.tipo === "semaforo" && !filtro.camadas.controladores) return false;
    if (!filtro.categorias.has(eq.tipo)) return false;
    if (filtro.soProblemas && !temProblema(eq)) return false;
    if (filtro.statusConexao === "online" && !eq.online) return false;
    if (filtro.statusConexao === "offline" && eq.online) return false;
    if (filtro.statusAlerta === "somente-ativos" && LiveState.alertasDoEquipamento(eq.id).length === 0) return false;
    // gate por região: só se aplica se o equipamento pertence a alguma; solto sempre passa
    if (eq.subareaId || eq.corredorId) {
      const passaSubarea = eq.subareaId && filtro.subareas.has(eq.subareaId);
      const passaCorredor = eq.corredorId && filtro.corredores.has(eq.corredorId);
      if (!passaSubarea && !passaCorredor) return false;
    }
    return true;
  }

  // Problema = offline ou com alerta ativo. É o que o operador precisa achar no meio de ~1000.
  const temProblema = (eq) => !eq.online || LiveState.alertasDoEquipamento(eq.id).length > 0;

  // Controlador: sempre o pino próprio; o estado vai numa bolinha no canto (vermelho = offline,
  // âmbar = alerta, sem bolinha = ok), pra problema não sumir no meio de ~1000 pinos iguais.
  // Demais categorias (fora do mapa por ora): ponto discreto se ok, pin com ícone se problema.
  function pinEquipamento(eq) {
    const alertaAtivo = LiveState.alertasDoEquipamento(eq.id).length > 0;
    const sel = !!selecao && selecao.tipo === "equipamento" && selecao.id === eq.id;
    if (eq.tipo === "semaforo") {
      const estado = !eq.online ? "offline" : alertaAtivo ? "alerta" : "ok";
      return L.divIcon({
        html: `<div class="map-ctrl-pin${sel ? " is-selecionado" : ""}" data-estado="${estado}">${ICONE_PIN_CONTROLADOR}</div>`,
        className: "",
        iconSize: [24, 28],
        iconAnchor: [12, 27],
      });
    }
    if (eq.online && !alertaAtivo) {
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

  // Agrupamento só de controladores saudáveis (os com problema ficam fora, em layerProblemas):
  // sempre neutro. Se ele ficasse vermelho por ter 1 offline entre 40, o mapa pareceria bem
  // pior do que está.
  function iconeCluster(cluster) {
    const n = cluster.getChildCount();
    return L.divIcon({
      html: `<div class="map-cluster" style="width:32px;height:32px"><span>${n}</span></div>`,
      className: "",
      iconSize: [32, 32],
    });
  }

  function sincronizarMarcadores(lista) {
    const idsVisiveis = new Set(lista.map((eq) => eq.id));
    const remover = [];
    marcadores.forEach((m, id) => {
      if (!idsVisiveis.has(id)) {
        if (m.problema) layerProblemas.removeLayer(m.marker);
        else remover.push(m.marker);
        marcadores.delete(id);
      }
    });
    if (remover.length) layerEquipamentos.removeLayers(remover);

    const adicionar = [];
    let mudouEstado = false;
    lista.forEach((eq) => {
      const alertaAtivo = LiveState.alertasDoEquipamento(eq.id).length > 0;
      const ehSelecionado = !!selecao && selecao.tipo === "equipamento" && selecao.id === eq.id;
      const chave = `${eq.online}|${alertaAtivo}|${ehSelecionado}`;
      // selecionado por cima de tudo, depois os com problema, por último os saudáveis
      const zIndexOffset = ehSelecionado ? 2000 : !eq.online || alertaAtivo ? 1000 : 0;
      const problema = !eq.online || alertaAtivo; // com problema: fora do agrupamento
      const existente = marcadores.get(eq.id);
      if (!existente) {
        const marker = L.marker([eq.lat, eq.lng], { icon: pinEquipamento(eq), zIndexOffset });
        marker.on("click", () => selecionarEquipamento(eq.id, { centralizar: true }));
        marker.on("contextmenu", (ev) =>
          abrirMenuContexto(ev, [
            { label: "Modo de operação", opcoes: MODOS_OPERACAO },
            { label: "Enviar comando", opcoes: opcoesComando(eq.id) },
            { label: "Editar tabela horária" },
            { label: "Abrir detalhes", acao: () => selecionarEquipamento(eq.id, { centralizar: true }) },
          ])
        );
        marker.eqId = eq.id; // para a lista do balão do agrupamento
        marker.eqNome = eq.nome;
        // passar o mouse já mostra código e cruzamento, sem abrir o painel (nome já vem escapado)
        marker.bindTooltip(`<strong>${eq.id}</strong><span>${eq.nome}</span>`, {
          direction: "top",
          offset: [0, -14],
          className: "map-eq-tooltip",
        });
        marcadores.set(eq.id, { marker, chave, problema });
        if (problema) layerProblemas.addLayer(marker);
        else adicionar.push(marker);
      } else if (existente.chave !== chave) {
        existente.marker.setIcon(pinEquipamento(eq));
        existente.marker.setZIndexOffset(zIndexOffset);
        existente.chave = chave;
        if (existente.problema !== problema) {
          // mudou de lado: sai do agrupamento e fica solto, ou volta para o agrupamento
          if (problema) {
            layerEquipamentos.removeLayer(existente.marker);
            layerProblemas.addLayer(existente.marker);
          } else {
            layerProblemas.removeLayer(existente.marker);
            adicionar.push(existente.marker);
          }
          existente.problema = problema;
          mudouEstado = true;
        }
      }
    });
    if (adicionar.length) layerEquipamentos.addLayers(adicionar);
    if (mudouEstado) layerEquipamentos.refreshClusters();
  }

  function assinaturaDasRegioes() {
    return [
      JSON.stringify(filtro.camadas),
      [...filtro.subareas].join(","),
      [...filtro.corredores].join(","),
      foco ? `${foco.tipo}:${foco.regiaoTipo || ""}:${foco.id}` : "",
      selecao ? `${selecao.tipo}:${selecao.id}` : "",
      SUBAREAS.map((s) => s.id + s.nome + s.poligono.length).join("|"),
      CORREDORES.map((c) => c.id + c.nome + c.linha.length).join("|"),
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
      const destacada = focoRegiaoId === s.id || (!!selecao && selecao.tipo === "subarea" && selecao.id === s.id);
      // preenchimento leve da cor da área; hover e seleção só reforçam a mesma cor
      const cor = corDaArea(s);
      const poligono = L.polygon(s.poligono, {
        color: cor,
        weight: destacada ? 3 : 1.5,
        opacity: destacada ? 1 : 0.8,
        fillColor: cor,
        fillOpacity: destacada ? 0.26 : 0.12,
      });
      poligono
        .bindTooltip(s.nome, { permanent: false, direction: "center", className: "map-region-tooltip" })
        .on("mouseover", () => !destacada && poligono.setStyle({ weight: 2.5, fillOpacity: 0.2 }))
        .on("mouseout", () => !destacada && poligono.setStyle({ weight: 1.5, fillOpacity: 0.12 }))
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
      const destacado = focoRegiaoId === c.id || (!!selecao && selecao.tipo === "corredor" && selecao.id === c.id);
      const aoClicar = (ev) => {
        L.DomEvent.stopPropagation(ev);
        selecionarRegiao("corredor", c.id);
        enquadrarRegiao("corredor", c.id);
      };
      const linha = L.polyline(c.linha, {
        color: destacado ? "var(--red)" : "#2f6fed",
        weight: destacado ? 5 : 2.5,
        opacity: destacado ? 0.9 : 0.55,
      })
        .bindTooltip(c.nome, { permanent: false, className: "map-region-tooltip" })
        .addTo(layerRegioes);
      // 2,5px é difícil de acertar com o mouse: uma linha invisível e larga por cima faz a área de
      // clique e de hover (o destaque é aplicado na linha visível)
      L.polyline(c.linha, { weight: 18, opacity: 0 })
        .on("mouseover", () => !destacado && linha.setStyle({ weight: 4.5, opacity: 0.9 }))
        .on("mouseout", () => !destacado && linha.setStyle({ weight: 2.5, opacity: 0.55 }))
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
    const { clientX: x, clientY: y } = ev.originalEvent;
    const r = el.getBoundingClientRect();
    el.style.left = `${Math.min(x, innerWidth - r.width - 8)}px`;
    el.style.top = `${Math.min(y, innerHeight - r.height - 8)}px`;
    // sem espaço à direita para o submenu: ele abre para a esquerda
    if (el.getBoundingClientRect().right + 240 > innerWidth) el.classList.add("is-sub-esquerda");
    menuContexto = el;
    document.addEventListener("mousedown", aoClicarFora, true);
    document.addEventListener("keydown", aoTeclarMenu, true);
    map.on("movestart zoomstart", fecharMenuContexto);
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
    if (selecao && !selecaoExiste()) {
      selecao = null;
      aoSelecionar(null);
    }
    const assinatura = assinaturaDasRegioes();
    if (assinatura !== assinaturaRegioes) {
      assinaturaRegioes = assinatura;
      desenharRegioes();
    }

    const lista = LiveState.getEquipamentos().filter((eq) => {
      if (foco && foco.tipo === "equipamento") return eq.id === foco.id;
      if (foco && foco.tipo === "regiao") {
        return foco.regiaoTipo === "subarea" ? eq.subareaId === foco.id : eq.corredorId === foco.id;
      }
      return equipamentoVisivel(eq);
    });

    sincronizarMarcadores(lista);

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
  function setFiltroRegioes(subareasIds, corredoresIds) {
    filtro.subareas = new Set(subareasIds);
    filtro.corredores = new Set(corredoresIds);
    if (foco && foco.tipo === "regiao") {
      const lista = foco.regiaoTipo === "subarea" ? SUBAREAS : CORREDORES;
      if (!lista.some((r) => r.id === foco.id)) foco = null;
    }
    render();
  }

  function toggleSubarea(id) {
    filtro.subareas.has(id) ? filtro.subareas.delete(id) : filtro.subareas.add(id);
    render();
  }
  function toggleCorredor(id) {
    filtro.corredores.has(id) ? filtro.corredores.delete(id) : filtro.corredores.add(id);
    render();
  }
  function toggleCategoria(id) {
    filtro.categorias.has(id) ? filtro.categorias.delete(id) : filtro.categorias.add(id);
    render();
  }
  function setTodas(campo, valor) {
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
  function setSoProblemas(valor) {
    filtro.soProblemas = !!valor;
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
    if (payload.tipos) filtro.categorias = new Set(payload.tipos);
    if (payload.regioes) {
      filtro.subareas = new Set(payload.regioes.filter((id) => SUBAREAS.some((s) => s.id === id)));
      filtro.corredores = new Set(payload.regioes.filter((id) => CORREDORES.some((c) => c.id === id)));
    }
    filtro.statusConexao = payload.statusConexao || "todos";
    filtro.statusAlerta = payload.statusAlerta || "todos";
    filtro.soProblemas = false;
    render();
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
    getSelecao,
    setFiltroRegioes,
    getContagens,
    toggleSubarea,
    toggleCorredor,
    toggleCategoria,
    setTodas,
    setStatusAlerta,
    setStatusConexao,
    setSoProblemas,
    setCamada,
    setMapaBase,
    mapaBaseAtual,
    setFiltroCompleto,
    focarEquipamento,
    focarRegiao,
    limparFoco,
    buscar,
    corDaArea,
  };
})();
