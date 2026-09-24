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
  const LARGURA_PAINEL = 340; // painel lateral (à direita do widget); o mapa se afasta dele para não cobrir a seleção

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
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: "&copy; OpenStreetMap, &copy; CARTO",
      maxZoom: 19,
    }).addTo(map);
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
    layerDestaque = L.layerGroup().addTo(map);

    LiveState.subscribe(render);
    render();
    // o grid-stack só dá o tamanho certo ao container depois de montado —
    // sem isto o Leaflet nasce com metade do tile carregado.
    setTimeout(() => map && map.invalidateSize(), 60);
    return map;
  }

  function destroy() {
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

  // O cluster assume a cor do pior estado que agrupa: vermelho (tem offline), âmbar (só
  // alertas) ou neutro e discreto. O selo mostra quantos dos agrupados têm problema.
  function iconeCluster(cluster) {
    const filhos = cluster.getAllChildMarkers();
    const offline = filhos.filter((m) => m.options.eqOnline === false).length;
    const problemas = filhos.filter((m) => m.options.eqOnline === false || m.options.eqAlerta).length;
    const estado = offline ? "is-offline" : problemas ? "is-alerta" : "";
    const tam = offline ? 42 : problemas ? 38 : 32;
    const selo = problemas ? `<span class="map-cluster-prob" title="${problemas} com problema">${problemas}</span>` : "";
    return L.divIcon({
      html: `<div class="map-cluster ${estado}" style="width:${tam}px;height:${tam}px"><span>${filhos.length}</span>${selo}</div>`,
      className: "",
      iconSize: [tam, tam],
    });
  }

  function sincronizarMarcadores(lista) {
    const idsVisiveis = new Set(lista.map((eq) => eq.id));
    const remover = [];
    marcadores.forEach((m, id) => {
      if (!idsVisiveis.has(id)) {
        remover.push(m.marker);
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
      const existente = marcadores.get(eq.id);
      if (!existente) {
        const marker = L.marker([eq.lat, eq.lng], { icon: pinEquipamento(eq), eqOnline: eq.online, eqAlerta: alertaAtivo, zIndexOffset });
        marker.on("click", () => selecionarEquipamento(eq.id));
        marcadores.set(eq.id, { marker, chave });
        adicionar.push(marker);
      } else if (existente.chave !== chave) {
        existente.marker.options.eqOnline = eq.online;
        existente.marker.options.eqAlerta = alertaAtivo;
        existente.marker.setIcon(pinEquipamento(eq));
        existente.marker.setZIndexOffset(zIndexOffset);
        existente.chave = chave;
        mudouEstado = true;
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
        })
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
    const limite = map.getSize().x - (LARGURA_PAINEL + 50);
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
      const alvo = map.project([eq.lat, eq.lng], zoom).add([LARGURA_PAINEL / 2, 0]);
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
    map.fitBounds(bounds, { paddingTopLeft: [40, 60], paddingBottomRight: [LARGURA_PAINEL + 40, 40] });
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
    setFiltroCompleto,
    focarEquipamento,
    focarRegiao,
    limparFoco,
    buscar,
    corDaArea,
  };
})();
