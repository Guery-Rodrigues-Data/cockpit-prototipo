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
  let layerEquipamentos = null;
  let layerDestaque = null; // anel pulsante da busca livre (não filtra, só aponta)
  let onFiltroChange = () => {};

  let filtro = {
    subareas: new Set(SUBAREAS.map((s) => s.id)),
    corredores: new Set(CORREDORES.map((c) => c.id)),
    categorias: new Set(CATEGORIAS_EQUIPAMENTO.map((c) => c.id)),
    statusAlerta: "todos", // 'todos' | 'somente-ativos'
    statusConexao: "todos", // 'todos' | 'online' | 'offline'
  };
  let foco = null; // {tipo:'equipamento', id} | {tipo:'regiao', regiaoTipo:'subarea'|'corredor', id}

  function init(container, callbackFiltroChange, filtroSalvo) {
    onFiltroChange = callbackFiltroChange || (() => {});
    // Regra de negócio da #125167: filtros do Mapa persistem por perfil — restaura o
    // que foi salvo na sessão anterior em vez de sempre abrir com tudo selecionado.
    if (filtroSalvo) {
      filtro = {
        subareas: new Set(filtroSalvo.subareas || SUBAREAS.map((s) => s.id)),
        corredores: new Set(filtroSalvo.corredores || CORREDORES.map((c) => c.id)),
        categorias: new Set(filtroSalvo.categorias || CATEGORIAS_EQUIPAMENTO.map((c) => c.id)),
        statusAlerta: filtroSalvo.statusAlerta || "todos",
        statusConexao: filtroSalvo.statusConexao || "todos",
      };
    }
    map = L.map(container, { zoomControl: false }).setView(CENTRO_CURITIBA, 13);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: "&copy; OpenStreetMap, &copy; CARTO",
      maxZoom: 19,
    }).addTo(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);

    layerRegioes = L.layerGroup().addTo(map);
    layerEquipamentos = L.layerGroup().addTo(map);
    layerDestaque = L.layerGroup().addTo(map);

    LiveState.subscribe(render);
    render();
    // o grid-stack só dá o tamanho certo ao container depois de montado —
    // sem isto o Leaflet nasce com metade do tile carregado.
    setTimeout(() => map && map.invalidateSize(), 60);
    return map;
  }

  function destroy() {
    if (map) map.remove();
    map = null;
  }

  function invalidateSize() {
    if (map) setTimeout(() => map.invalidateSize(), 60);
  }

  function equipamentoVisivel(eq) {
    if (!filtro.categorias.has(eq.tipo)) return false;
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

  function pinEquipamento(eq) {
    const cor = eq.online ? "var(--green)" : "var(--red)";
    const icone = ICONES_CATEGORIA[eq.tipo] || "";
    const alertaAtivo = LiveState.alertasDoEquipamento(eq.id).length > 0;
    const html = `<div class="map-eq-pin" style="--pin-cor:${cor}">${icone}${
      alertaAtivo ? '<span class="map-eq-pin-alerta"></span>' : ""
    }</div>`;
    return L.divIcon({ html, className: "", iconSize: [26, 26], iconAnchor: [13, 13] });
  }

  function render() {
    if (!map) return;
    layerRegioes.clearLayers();
    layerEquipamentos.clearLayers();

    const focoRegiaoId = foco && foco.tipo === "regiao" ? foco.id : null;

    SUBAREAS.forEach((s) => {
      if (!filtro.subareas.has(s.id)) return;
      if (foco && foco.tipo === "regiao" && !(foco.regiaoTipo === "subarea" && foco.id === s.id)) return;
      const destacada = focoRegiaoId === s.id;
      L.polygon(s.poligono, {
        color: destacada ? "var(--red)" : "#8b94a3",
        weight: destacada ? 2.5 : 1.5,
        fillColor: "#e0342b",
        fillOpacity: destacada ? 0.16 : 0.06,
        dashArray: destacada ? null : "4 4",
      })
        .bindTooltip(s.nome, { permanent: false, direction: "center", className: "map-region-tooltip" })
        .addTo(layerRegioes);
    });

    CORREDORES.forEach((c) => {
      if (!filtro.corredores.has(c.id)) return;
      if (foco && foco.tipo === "regiao" && !(foco.regiaoTipo === "corredor" && foco.id === c.id)) return;
      const destacado = focoRegiaoId === c.id;
      L.polyline(c.linha, {
        color: destacado ? "var(--red)" : "#2f6fed",
        weight: destacado ? 5 : 3,
        opacity: destacado ? 0.9 : 0.55,
      })
        .bindTooltip(c.nome, { permanent: false, className: "map-region-tooltip" })
        .addTo(layerRegioes);
    });

    const lista = LiveState.getEquipamentos().filter((eq) => {
      if (foco && foco.tipo === "equipamento") return eq.id === foco.id;
      if (foco && foco.tipo === "regiao") {
        return foco.regiaoTipo === "subarea" ? eq.subareaId === foco.id : eq.corredorId === foco.id;
      }
      return equipamentoVisivel(eq);
    });

    lista.forEach((eq) => {
      const marker = L.marker([eq.lat, eq.lng], { icon: pinEquipamento(eq) });
      const alertasEq = LiveState.alertasDoEquipamento(eq.id);
      marker.bindPopup(
        `<div class="map-popup"><strong>${eq.nome}</strong><span>${eq.id} · ${categoriaLabel(eq.tipo)}</span>` +
          `<div class="map-popup-status" data-online="${eq.online}">${eq.online ? "Online" : "Offline"}</div>` +
          (alertasEq.length
            ? `<div class="map-popup-alerta">${alertasEq[0].descricao}</div>`
            : "") +
          `</div>`
      );
      marker.addTo(layerEquipamentos);
    });

    if (foco && foco.tipo === "equipamento" && lista[0]) {
      map.setView([lista[0].lat, lista[0].lng], 16, { animate: true });
    } else if (foco && foco.tipo === "regiao") {
      const bounds =
        foco.regiaoTipo === "subarea"
          ? L.polygon(SUBAREAS.find((s) => s.id === foco.id).poligono).getBounds()
          : L.polyline(CORREDORES.find((c) => c.id === foco.id).linha).getBounds();
      map.fitBounds(bounds, { padding: [40, 40] });
    }

    onFiltroChange({
      contagens: getContagens(),
      focoLabel: focoLabel(),
      filtroSerializado: {
        subareas: [...filtro.subareas],
        corredores: [...filtro.corredores],
        categorias: [...filtro.categorias],
        statusAlerta: filtro.statusAlerta,
        statusConexao: filtro.statusConexao,
      },
    });
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
    };
  }

  function getFiltro() {
    return filtro;
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
      filtro.subareas = new Set(payload.regioes.filter((id) => id.startsWith("SA-")));
      filtro.corredores = new Set(payload.regioes.filter((id) => id.startsWith("CR-")));
    }
    filtro.statusConexao = payload.statusConexao || "todos";
    filtro.statusAlerta = payload.statusAlerta || "todos";
    render();
  }

  function limparFoco() {
    foco = null;
    render();
  }

  function focarEquipamento(id) {
    foco = { tipo: "equipamento", id };
    render();
  }

  function focarRegiao(regiaoTipo, id) {
    foco = { tipo: "regiao", regiaoTipo, id };
    render();
  }

  // Busca livre: só destaca + centraliza, não filtra o resto (critério da #125167
  // é distinto da integração de clique dos outros widgets, que filtra de verdade).
  function buscar(termo) {
    layerDestaque.clearLayers();
    const q = termo.trim().toLowerCase();
    if (!q) return null;

    const eq = LiveState.getEquipamentos().find((e) => e.nome.toLowerCase().includes(q) || e.id.toLowerCase() === q);
    if (eq) {
      map.setView([eq.lat, eq.lng], 16, { animate: true });
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
    getContagens,
    toggleSubarea,
    toggleCorredor,
    toggleCategoria,
    setTodas,
    setStatusAlerta,
    setStatusConexao,
    setFiltroCompleto,
    focarEquipamento,
    focarRegiao,
    limparFoco,
    buscar,
  };
})();
