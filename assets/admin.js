/* ==========================================================================
   Cockpit — modo admin (?admin): cadastro de corredor (nome + linha no mapa) e de área
   (nome + polígono). Escondido de quem abre o Cockpit normalmente: este arquivo só é
   carregado com o modo ligado (carregarAdmin() em app.js) e nada na tela sugere que ele
   existe. Grava no Supabase via regioes.js; o resto do Cockpit só enxerga as regiões
   já cadastradas.
   ========================================================================== */

(() => {
  "use strict";

  const COR_CORREDOR = "#2f6fed";
  const COR_AREA = "#e0342b";
  const MIN_PONTOS = { corredor: 2, area: 3 };
  const NOME_TIPO = { corredor: "corredor", area: "área" };

  let desenho = null; // { tipo, pontos, map, grupo, cursor } enquanto o operador traça
  let listaAberta = false;

  /* ---------- utilidades ---------- */

  const desescapar = (t) => {
    const el = document.createElement("textarea");
    el.innerHTML = t;
    return el.value;
  };
  const arred = (p) => [Number(p[0].toFixed(6)), Number(p[1].toFixed(6))];
  const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1).replace(".", ",")} km` : `${Math.round(m)} m`);
  const cadastrados = () => ({ corredores: CORREDORES.filter((c) => c.cadastrado), areas: SUBAREAS.filter((s) => s.cadastrado) });

  function comprimentoM(pontos) {
    let total = 0;
    for (let i = 0; i < pontos.length - 1; i++) total += L.latLng(pontos[i]).distanceTo(L.latLng(pontos[i + 1]));
    return total;
  }

  function controladoresNaGeometria(tipo, pontos, raioM) {
    return LiveState.getEquipamentos().filter(
      (e) =>
        e.origem === "banco" &&
        (tipo === "area" ? pontoNoPoligono(e.lat, e.lng, pontos) : distanciaAPolilinhaM(e.lat, e.lng, pontos) <= raioM)
    ).length;
  }

  /* ---------- casca: dock, barra de desenho, lista ---------- */

  const dock = document.createElement("div");
  dock.className = "admin-dock";
  dock.innerHTML = `
    <span class="admin-dock-tag">Admin</span>
    <button type="button" data-adm="novo-corredor">${ICONS.plus} Corredor</button>
    <button type="button" data-adm="novo-area">${ICONS.plus} Área</button>
    <button type="button" data-adm="lista">Cadastrados <span class="admin-dock-count" id="admContagem"></span></button>
    <span class="admin-dock-sep"></span>
    <button type="button" data-adm="telas">Telas</button>
    <button type="button" data-adm="mapa-osm" title="Troca o fundo do mapa pelo OpenStreetMap (em zoom alto mostra setas de mão única e detalhes das vias)">Mapa OSM</button>`;

  const barra = document.createElement("div");
  barra.className = "admin-drawbar";
  barra.hidden = true;

  const painel = document.createElement("div");
  painel.className = "admin-lista";
  painel.hidden = true;

  // Telas de exemplo (PRESETS em app.js) + Limpar Cockpit: ferramenta de teste, por isso moram
  // no dock do admin e não no menu do avatar. Os cliques são tratados em app.js
  // (data-action load-preset / clear-layout), como antes.
  const painelTelas = document.createElement("div");
  painelTelas.className = "admin-lista admin-telas";
  painelTelas.hidden = true;
  painelTelas.innerHTML = `
    <h4>Telas de exemplo</h4>
    ${PRESETS.map(
      (p) => `
      <button type="button" class="admin-tela" data-action="load-preset" data-preset="${p.id}">
        <strong>${p.nome}</strong><span>${p.descricao}</span>
      </button>`
    ).join("")}
    <div class="admin-telas-rodape">
      <button type="button" class="btn-text" data-action="clear-layout" title="Remove todos os widgets desta tela, volta ao primeiro acesso">Limpar Cockpit</button>
    </div>`;
  let telasAbertas = false;

  document.body.append(dock, barra, painel, painelTelas);
  document.body.classList.add("modo-admin"); // admin.css reserva o espaço do dock embaixo do canvas

  function atualizarDock() {
    const { corredores, areas } = cadastrados();
    document.getElementById("admContagem").textContent = corredores.length + areas.length;
    dock.querySelector('[data-adm="lista"]').classList.toggle("is-on", listaAberta);
    dock.querySelector('[data-adm="telas"]').classList.toggle("is-on", telasAbertas);
    dock.querySelector('[data-adm="mapa-osm"]').classList.toggle("is-on", CockpitMap.mapaBaseAtual() === "osm");
  }

  // Telas e Cadastrados abrem no mesmo canto: um fecha o outro.
  function alternarTelas(abrir) {
    telasAbertas = abrir === undefined ? !telasAbertas : abrir;
    painelTelas.hidden = !telasAbertas;
    if (telasAbertas && listaAberta) alternarLista(false);
    atualizarDock();
  }

  /* ---------- desenho no mapa ---------- */

  function iniciarDesenho(tipo) {
    const map = CockpitMap.getMap();
    if (!map) {
      toast("Adicione o widget de Mapa à tela para poder desenhar.");
      return;
    }
    encerrarDesenho();
    alternarLista(false);
    CockpitMap.limparSelecao();
    map.doubleClickZoom.disable();
    map.getContainer().classList.add("admin-desenhando");
    desenho = { tipo, pontos: [], map, grupo: L.layerGroup().addTo(map), cursor: null };
    map.on("click", aoClicarNoMapa);
    map.on("dblclick", aoDuploCliqueNoMapa);
    map.on("mousemove", aoMoverNoMapa);
    atualizarBarra();
  }

  function encerrarDesenho() {
    if (!desenho) return;
    const { map, grupo } = desenho;
    try {
      map.off("click", aoClicarNoMapa);
      map.off("dblclick", aoDuploCliqueNoMapa);
      map.off("mousemove", aoMoverNoMapa);
      map.doubleClickZoom.enable();
      map.getContainer().classList.remove("admin-desenhando");
      grupo.remove();
    } catch (e) {
      /* o widget de Mapa foi removido no meio do desenho: não há mais o que limpar */
    }
    desenho = null;
    barra.hidden = true;
  }

  function aoClicarNoMapa(e) {
    desenho.pontos.push([e.latlng.lat, e.latlng.lng]);
    redesenhar();
    atualizarBarra();
  }

  // Duplo clique conclui o desenho. O navegador dispara "click" duas vezes antes do
  // "dblclick", então o último ponto vem duplicado: tira a cópia (a poucos pixels do
  // anterior) e só então conclui. Se ainda faltarem pontos, só avisa e segue desenhando.
  function aoDuploCliqueNoMapa() {
    const { pontos, map, tipo } = desenho;
    if (pontos.length >= 2) {
      const a = map.latLngToContainerPoint(pontos[pontos.length - 1]);
      const b = map.latLngToContainerPoint(pontos[pontos.length - 2]);
      if (a.distanceTo(b) < 6) pontos.pop();
    }
    redesenhar();
    atualizarBarra();
    const falta = MIN_PONTOS[tipo] - pontos.length;
    if (falta > 0) toast(`Ainda ${falta === 1 ? "falta 1 ponto" : `faltam ${falta} pontos`} para concluir.`);
    else concluirDesenho();
  }

  function aoMoverNoMapa(e) {
    desenho.cursor = [e.latlng.lat, e.latlng.lng];
    redesenhar();
  }

  function redesenhar() {
    const { tipo, pontos, grupo, cursor } = desenho;
    const cor = tipo === "corredor" ? COR_CORREDOR : COR_AREA;
    const rota = cursor && pontos.length ? [...pontos, cursor] : pontos;
    grupo.clearLayers();
    if (tipo === "area" && rota.length >= 3) {
      L.polygon(rota, { color: cor, weight: 2, dashArray: "5 5", fillColor: cor, fillOpacity: 0.1, interactive: false }).addTo(grupo);
    } else if (rota.length >= 2) {
      L.polyline(rota, { color: cor, weight: tipo === "corredor" ? 4 : 2, dashArray: "6 6", opacity: 0.9, interactive: false }).addTo(grupo);
    }
    pontos.forEach((p, i) =>
      L.circleMarker(p, { radius: i === 0 ? 6 : 4, color: "#fff", weight: 2, fillColor: cor, fillOpacity: 1, interactive: false }).addTo(grupo)
    );
  }

  function atualizarBarra() {
    const { tipo, pontos } = desenho;
    const falta = MIN_PONTOS[tipo] - pontos.length;
    const dica =
      pontos.length === 0
        ? "clique no mapa para marcar o primeiro ponto"
        : falta > 0
        ? `faltam ${falta} ${falta === 1 ? "ponto" : "pontos"}`
        : tipo === "corredor"
        ? `${pontos.length} pontos · ${fmtDist(comprimentoM(pontos))}`
        : `${pontos.length} vértices`;
    barra.hidden = false;
    barra.innerHTML = `
      <span><strong>Novo ${NOME_TIPO[tipo]}</strong> <span class="admin-drawbar-info">· ${dica}</span></span>
      <span class="admin-drawbar-acts">
        <button type="button" data-adm="desfazer" ${pontos.length ? "" : "disabled"}>Desfazer</button>
        <button type="button" data-adm="concluir" ${falta > 0 ? "disabled" : ""}>Concluir</button>
        <button type="button" data-adm="cancelar">Cancelar</button>
      </span>`;
  }

  function desfazerPonto() {
    if (!desenho || !desenho.pontos.length) return;
    desenho.pontos.pop();
    redesenhar();
    atualizarBarra();
  }

  function concluirDesenho() {
    if (!desenho || desenho.pontos.length < MIN_PONTOS[desenho.tipo]) return;
    if (CockpitMap.getMap() !== desenho.map) {
      encerrarDesenho();
      toast("O widget de Mapa foi removido; o desenho foi descartado.");
      return;
    }
    abrirFormulario(desenho.tipo, desenho.pontos.map(arred));
  }

  /* ---------- formulário (nome + raio) ---------- */

  let overlay = null;

  function abrirFormulario(tipo, pontos) {
    fecharFormulario();
    overlay = document.createElement("div");
    overlay.className = "modal-overlay is-open";
    overlay.innerHTML = `
      <div class="config-modal" style="width:420px">
        <div class="config-modal-header">
          <strong>Novo ${NOME_TIPO[tipo]}</strong>
          <button type="button" class="widget-icon-btn" data-adm="form-voltar" title="Voltar ao mapa">${ICONS.x}</button>
        </div>
        <div class="config-modal-body">
          <div class="field">
            <label for="admNome">Nome</label>
            <input type="text" id="admNome" maxlength="80" autocomplete="off" placeholder="${tipo === "corredor" ? "Ex.: Av. Sete de Setembro" : "Ex.: Centro Cívico"}" />
            ${tipo === "corredor" ? '<span class="admin-hint" id="admNomeDica"></span>' : ""}
          </div>
          ${
            tipo === "corredor"
              ? `<div class="field">
                   <label for="admRaio">Alcance da linha (metros)</label>
                   <input type="text" id="admRaio" inputmode="numeric" value="${RAIO_CORREDOR_PADRAO_M}" />
                   <span class="admin-hint">Controladores a até essa distância da linha entram no corredor.</span>
                 </div>`
              : ""
          }
          <div class="admin-resumo" id="admResumo"></div>
          <div class="admin-erro" id="admErro" hidden></div>
        </div>
        <div class="config-modal-actions">
          <button type="button" class="btn-secondary" data-adm="form-voltar">Voltar ao mapa</button>
          <button type="button" class="btn-primary" data-adm="form-salvar">Salvar</button>
        </div>
      </div>`;
    overlay.dataset.tipo = tipo;
    overlay._pontos = pontos;
    overlay._id = novoIdRegiao(tipo === "corredor" ? "CR" : "SA"); // fixo enquanto o formulário existir
    document.body.appendChild(overlay);
    overlay.addEventListener("input", atualizarResumo);
    atualizarResumo();
    overlay.querySelector("#admNome").focus();
    if (tipo === "corredor") sugerirNomeDoCorredor(overlay, pontos[0]);
  }

  /* ---------- sugestão de nome: rua do primeiro ponto ---------- */

  const cacheRua = new Map(); // "lat,lng" -> { nome, fonte } | null; evita repetir a consulta

  // Controlador do banco mais próximo, se estiver a até 100 m (o nome dele é a via cadastrada).
  function ruaDoControladorMaisProximo(lat, lng) {
    let melhor = null;
    let menor = 100;
    LiveState.getEquipamentos().forEach((e) => {
      if (e.origem !== "banco") return;
      const d = L.latLng(lat, lng).distanceTo([e.lat, e.lng]);
      if (d < menor) {
        menor = d;
        melhor = e;
      }
    });
    return melhor ? desescapar(melhor.nome) : null;
  }

  // Rua no ponto pelo OpenStreetMap (Nominatim, consulta pública gratuita); se não responder,
  // usa a via do controlador mais próximo. Devolve null se nenhum dos dois achar.
  async function ruaDoPonto([lat, lng]) {
    const chave = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    if (cacheRua.has(chave)) return cacheRua.get(chave);
    let resultado = null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=17&accept-language=pt-BR&lat=${lat}&lon=${lng}`,
        { signal: ctrl.signal }
      );
      if (resp.ok) {
        const a = (await resp.json()).address || {};
        const rua = a.road || a.pedestrian || a.cycleway || a.footway;
        if (rua) resultado = { nome: rua, fonte: "OpenStreetMap" };
      }
    } catch (e) {
      /* sem resposta a tempo ou sem rede: cai no controlador mais próximo */
    } finally {
      clearTimeout(timer);
    }
    if (!resultado) {
      const via = ruaDoControladorMaisProximo(lat, lng);
      if (via) resultado = { nome: via, fonte: "controlador mais próximo" };
    }
    cacheRua.set(chave, resultado);
    return resultado;
  }

  // Preenche o nome com a rua do primeiro ponto, já selecionado para ser trocado ao digitar.
  // Não sobrescreve se você começou a digitar antes de a busca voltar.
  function sugerirNomeDoCorredor(janela, primeiroPonto) {
    const input = janela.querySelector("#admNome");
    const dica = janela.querySelector("#admNomeDica");
    let digitou = false;
    input.addEventListener("input", () => (digitou = true));
    dica.textContent = "Buscando o nome da rua do primeiro ponto...";
    ruaDoPonto(primeiroPonto).then((res) => {
      if (overlay !== janela) return; // formulário já foi fechado
      if (!res) {
        dica.textContent = "";
        return;
      }
      dica.textContent = digitou
        ? `Rua do primeiro ponto: ${res.nome} (${res.fonte}).`
        : `Sugestão: rua do primeiro ponto (${res.fonte}). Pode trocar.`;
      if (!digitou && !input.value) {
        input.value = res.nome;
        input.select();
        atualizarResumo();
      }
    });
  }

  function lerRaio() {
    const bruto = (overlay.querySelector("#admRaio") || {}).value;
    const n = Number(String(bruto).trim());
    return Number.isInteger(n) && n > 0 && n <= 2000 ? n : null;
  }

  function atualizarResumo() {
    if (!overlay) return;
    const { tipo } = overlay.dataset;
    const pontos = overlay._pontos;
    const resumo = overlay.querySelector("#admResumo");
    if (tipo === "corredor") {
      const raio = lerRaio();
      resumo.textContent =
        `${pontos.length} pontos · ${fmtDist(comprimentoM(pontos))} de extensão` +
        (raio ? ` · ${controladoresNaGeometria("corredor", pontos, raio)} controladores a até ${raio} m` : " · alcance inválido");
    } else {
      resumo.textContent = `${pontos.length} vértices · ${controladoresNaGeometria("area", pontos)} controladores dentro`;
    }
  }

  function mostrarErro(msg) {
    const el = overlay.querySelector("#admErro");
    el.textContent = msg;
    el.hidden = false;
  }

  async function salvarFormulario() {
    const { tipo } = overlay.dataset;
    const pontos = overlay._pontos;
    const nome = overlay.querySelector("#admNome").value.trim();
    if (!nome) return mostrarErro("Dê um nome antes de salvar.");
    let raioM = null;
    if (tipo === "corredor") {
      raioM = lerRaio();
      if (!raioM) return mostrarErro("Alcance inválido: use um número inteiro de metros, de 1 a 2000.");
    }

    const btn = overlay.querySelector('[data-adm="form-salvar"]');
    btn.disabled = true;
    btn.textContent = "Salvando...";
    try {
      const id = overlay._id;
      if (tipo === "corredor") await cadastrarCorredor({ id, nome, linha: pontos, raioM });
      else await cadastrarArea({ id, nome, poligono: pontos });
    } catch (erro) {
      console.warn("[Cockpit admin] falha ao salvar:", erro);
      btn.disabled = false;
      btn.textContent = "Salvar";
      return mostrarErro(`Não foi possível salvar no banco. ${erro.message}`);
    }
    fecharFormulario();
    encerrarDesenho();
    aoMudarRegioes();
    atualizarDock();
    if (listaAberta) renderLista();
    toast(`${tipo === "corredor" ? "Corredor" : "Área"} "${nome}" cadastrado.`);
  }

  function fecharFormulario() {
    if (overlay) overlay.remove();
    overlay = null;
  }

  /* ---------- lista dos cadastrados ---------- */

  function alternarLista(abrir) {
    listaAberta = abrir === undefined ? !listaAberta : abrir;
    painel.hidden = !listaAberta;
    if (listaAberta && telasAbertas) alternarTelas(false);
    if (listaAberta) renderLista();
    atualizarDock();
  }

  function linhaMarkup(tipo, r) {
    const n = controladoresDaRegiao(tipo, r.id);
    const detalhe = `${r.id} · ${n} controlad.` + (tipo === "corredor" ? ` · ${r.raioM} m` : "");
    return `
      <div class="admin-row" data-tipo="${tipo}" data-id="${r.id}">
        <div class="admin-row-info"><strong title="${r.nome}">${r.nome}</strong><span>${detalhe}</span></div>
        <div class="admin-row-acts">
          <button type="button" data-adm="focar" title="Mostrar no mapa">Ver</button>
          <button type="button" data-adm="renomear">Renomear</button>
          <button type="button" data-adm="excluir" class="is-danger">Excluir</button>
        </div>
      </div>`;
  }

  function renderLista() {
    const { corredores, areas } = cadastrados();
    painel.innerHTML = `
      <h4>Corredores</h4>
      ${corredores.length ? corredores.map((c) => linhaMarkup("corredor", c)).join("") : '<div class="admin-vazio">Nenhum corredor cadastrado.</div>'}
      <h4>Áreas</h4>
      ${areas.length ? areas.map((a) => linhaMarkup("area", a)).join("") : '<div class="admin-vazio">Nenhuma área cadastrada.</div>'}
      <div class="admin-dica">Renomear e Excluir ficam só aqui, no modo admin; o painel lateral do Mapa não tem essas ações.</div>`;
  }

  function editarNome(linha) {
    const tipo = linha.dataset.tipo;
    const item = (tipo === "corredor" ? CORREDORES : SUBAREAS).find((r) => r.id === linha.dataset.id);
    if (!item) return;
    linha.innerHTML = `
      <div class="admin-row-edit">
        <input type="text" maxlength="80" value="" />
        <button type="button" class="btn-primary" data-adm="renomear-salvar" style="padding:6px 10px;font-size:12px">Salvar</button>
        <button type="button" class="btn-secondary" data-adm="renomear-cancelar" style="padding:6px 10px;font-size:12px">Cancelar</button>
      </div>`;
    const input = linha.querySelector("input");
    input.value = desescapar(item.nome);
    input.focus();
    input.select();
  }

  async function salvarNome(linha) {
    const nome = linha.querySelector("input").value.trim();
    if (!nome) return toast("O nome não pode ficar vazio.");
    try {
      await renomearRegiao(linha.dataset.tipo, linha.dataset.id, nome);
    } catch (erro) {
      console.warn("[Cockpit admin] falha ao renomear:", erro);
      return toast("Não foi possível renomear no banco.");
    }
    aoMudarRegioes();
    renderLista();
    CockpitMap.reemitirSelecao(); // se a região estiver aberta no painel lateral, mostra o nome novo
    toast("Nome atualizado.");
  }

  async function excluir(botao, linha) {
    // dois cliques: o primeiro só arma o botão, para não apagar sem querer
    if (!botao.dataset.armado) {
      botao.dataset.armado = "1";
      botao.textContent = "Confirmar?";
      setTimeout(() => {
        if (botao.isConnected) {
          delete botao.dataset.armado;
          botao.textContent = "Excluir";
        }
      }, 3000);
      return;
    }
    try {
      await excluirRegiao(linha.dataset.tipo, linha.dataset.id);
    } catch (erro) {
      console.warn("[Cockpit admin] falha ao excluir:", erro);
      return toast("Não foi possível excluir no banco.");
    }
    aoMudarRegioes(); // a região some e o painel lateral fecha sozinho
    atualizarDock();
    renderLista();
    toast("Excluído.");
  }

  /* ---------- eventos ---------- */

  document.addEventListener("click", (e) => {
    if (e.target.closest(".admin-telas [data-action]")) return alternarTelas(false);
    const alvo = e.target.closest("[data-adm]");
    if (!alvo) return;
    const linha = alvo.closest(".admin-row");
    switch (alvo.dataset.adm) {
      case "novo-corredor": return iniciarDesenho("corredor");
      case "novo-area": return iniciarDesenho("area");
      case "lista": return alternarLista();
      case "telas": return alternarTelas();
      case "mapa-osm":
        CockpitMap.setMapaBase(CockpitMap.mapaBaseAtual() === "osm" ? "esri" : "osm");
        return atualizarDock();
      case "desfazer": return desfazerPonto();
      case "concluir": return concluirDesenho();
      case "cancelar": return encerrarDesenho();
      case "form-voltar": return fecharFormulario();
      case "form-salvar": return salvarFormulario();
      case "focar":
        return CockpitBus.focarRegiao(linha.dataset.tipo === "corredor" ? "corredor" : "subarea", linha.dataset.id);
      case "renomear": return editarNome(linha);
      case "renomear-salvar": return salvarNome(linha);
      case "renomear-cancelar": return renderLista();
      case "excluir": return excluir(alvo, linha);
    }
  });

  document.addEventListener("keydown", (e) => {
    const digitando = !!e.target.matches?.("input, textarea");
    if (e.key === "Escape") {
      if (overlay) fecharFormulario();
      else if (desenho) encerrarDesenho();
      return;
    }
    if (e.key === "Enter") {
      if (overlay && e.target.matches?.("#admNome, #admRaio")) return salvarFormulario();
      if (!overlay && desenho && !digitando) return concluirDesenho();
      const linha = e.target.closest && e.target.closest(".admin-row-edit");
      if (linha) return salvarNome(linha.closest(".admin-row"));
    }
    if (!overlay && desenho && !digitando && (e.key === "Backspace" || (e.key === "z" && (e.ctrlKey || e.metaKey)))) {
      e.preventDefault();
      desfazerPonto();
    }
  });

  atualizarDock();
})();
