/* =====================================================================
   Cockpit — versões de entrega (recorte v1 / v2 / v3)
   Cada recurso do protótipo declara em qual versão ENTRA (`desde`). Versões são cumulativas:
   v2 = tudo da v1 + o que entra na v2; v3 = tudo o que o protótipo tem hoje.

   HIPÓTESE NÃO VALIDADA: a distribuição abaixo é um rascunho montado das notas do projeto
   (widget-mapa-v1: mapa único, sem configuração, "Requer atenção"; Programação Fase 1 = só leitura,
   comando/escrita depois). Quem define o recorte real é o Produto com o time — é só editar `RECURSOS`.

   Seletor na barra do Cockpit; também aceita ?versao=1|2|3. A tela salva (layout) é separada por
   versão (v3 usa a chave original), para trocar de versão não apagar o layout de outra.
   ===================================================================== */
const Versoes = (function () {
  const CHAVE = "cockpitVersaoV3";
  const ROTULOS = { 1: "v1", 2: "v2", 3: "v3" };
  const NIVEL_COMPLETO = 3;
  const nivelDoRotulo = (r) => Number(Object.keys(ROTULOS).find((n) => ROTULOS[n] === r)) || null;

  // id: { desde (nível), grupo, nome }. Ordem = ordem de exibição no painel "O que entra em cada versão".
  const RECURSOS = {
    "mapa": { desde: 1, grupo: "Mapa", nome: "Widget de Mapa (instância única, sem configuração)" },
    "mapa.posicao": { desde: 1, grupo: "Mapa", nome: "Todos os dispositivos plotados por lat/long, iguais e opacos, sem estado (pino neutro); hover da subárea mostra a quantidade de dispositivos" },
    "mapa.busca": { desde: 1, grupo: "Mapa", nome: "Busca por dispositivo, corredor ou subárea" },
    "mapa.legendas": { desde: 1, grupo: "Mapa", nome: "Botão de camadas do mapa (\"Filtros\" com Dispositivos, Subáreas e Corredores; v2 e v3 herdam da v1)" },
    "cockpit.multiplos": { desde: 1, grupo: "Cockpit", nome: "Painel modular (widgets movem e redimensionam) e vários cockpits por usuário (começa com um)" },
    "mapa.selecao": { desde: 3, grupo: "Painel do dispositivo", nome: "Clicar no pino, subárea ou corredor seleciona e abre o painel lateral" },
    "painel.geral": { desde: 3, grupo: "Painel do dispositivo", nome: "Aba Geral (inclui coordenadas)" },
    "mapa.estado": { desde: 2, grupo: "Mapa", nome: "Estado no pino (offline / alerta ativo)" },
    "mapa.requer-atencao": { desde: 2, grupo: "Mapa", nome: "Mapa estático: mostra tudo, sem seletor de alertas; o estado só aparece ao clicar num grupo do widget Alertas (subáreas mudam de cor pelas falhas)" },
    "modo-controle": { desde: 3, grupo: "Mapa", nome: "Modo de controle do controlador (Centro / Local / Operador): bolinha azul no pino e filtro. Na v2 só se conhecem os alertas." },
    "painel.alertas": { desde: 3, grupo: "Painel do dispositivo", nome: "Aba Alertas" },
    "painel.plano": { desde: 3, grupo: "Painel do dispositivo", nome: "Aba Plano (só leitura: plano em curso e tabela horária)" },
    "widget.resumo": { desde: 3, grupo: "Widgets", nome: "Widget Resumo (totais e filtro do mapa)" },
    "widget.alertas": { desde: 2, grupo: "Widgets", nome: "Widget Alertas" },
    "alertas.agrupar-severidade": { desde: 3, grupo: "Widgets", nome: "Alertas: agrupar por severidade" },
    "widget.notificacoes": { desde: 3, grupo: "Widgets", nome: "Widget Notificações (teste inicial: feed do que está acontecendo — alarme, offline, modo Operador)" },
    "widget.dispositivos": { desde: 3, grupo: "Widgets", nome: "Widget Dispositivos" },
    "widget.regioes": { desde: 3, grupo: "Widgets", nome: "Widget Subáreas e Corredores" },
    "filtro-geral": { desde: 3, grupo: "Cockpit", nome: "Filtro geral por tipo de equipamento" },
    "painel.comandos": { desde: 3, grupo: "Escrita no controlador", nome: "Aba Comandos" },
    "mapa.menu-contexto": { desde: 3, grupo: "Escrita no controlador", nome: "Menu do botão direito (modo, comando, tabela horária)" },
    "plano.ajuste": { desde: 3, grupo: "Escrita no controlador", nome: "Ajustar tempos (plano registrado)" },
  };

  function lerVersao() {
    const pedido = nivelDoRotulo(new URLSearchParams(location.search).get("versao"));
    if (pedido) {
      try { localStorage.setItem(CHAVE, String(pedido)); } catch (e) { /* sem localStorage: vale só nesta carga */ }
      return pedido;
    }
    try {
      const salvo = localStorage.getItem(CHAVE);
      if (salvo && ROTULOS[salvo]) return Number(salvo);
    } catch (e) { /* sem localStorage */ }
    return NIVEL_COMPLETO; // sem escolha: o protótipo completo, como era antes do seletor
  }

  const atual = lerVersao();
  document.documentElement.dataset.versao = atual;

  const tem = (id) => !RECURSOS[id] || RECURSOS[id].desde <= atual;

  function trocar(n) {
    if (!ROTULOS[n] || n === atual) return;
    try { localStorage.setItem(CHAVE, String(n)); } catch (e) { /* ver lerVersao */ }
    const url = new URL(location.href);
    url.searchParams.set("versao", ROTULOS[n]); // garante mesmo sem localStorage
    location.href = url.toString();
  }

  // Layout salvo por versão; v3 mantém a chave original (o que já estava salvo antes do seletor).
  const chaveLayout = (base) => (atual === NIVEL_COMPLETO ? base : `${base}-v${ROTULOS[atual]}`);

  function resumoPainel() {
    const grupos = [];
    Object.entries(RECURSOS).forEach(([id, r]) => {
      const alvo = grupos.find((g) => g.nome === r.grupo) || (grupos.push({ nome: r.grupo, itens: [] }), grupos[grupos.length - 1]);
      alvo.itens.push({ ...r, id });
    });
    return `
      <div class="versao-pop-titulo">O que entra em cada versão</div>
      <p class="versao-pop-aviso">Rascunho — hipótese não validada com o time. Versões são cumulativas.</p>
      ${grupos.map((g) => `
        <div class="versao-pop-grupo">${g.nome}</div>
        ${g.itens.map((i) => `<div class="versao-pop-item${i.desde <= atual ? "" : " is-fora"}"><span class="versao-pop-tag" data-v="${i.desde}">${ROTULOS[i.desde]}</span>${i.nome}</div>`).join("")}`).join("")}`;
  }

  // O seletor mora na barra do modo admin (admin.js chama isto com o dock); fora do admin a versão só muda por ?versao=.
  function montarSeletor(alvo, depoisDe) {
    if (!alvo) return;
    const wrap = document.createElement("div");
    wrap.className = "versao-wrap";
    wrap.innerHTML = `
      <select class="versao-select" aria-label="Versão do Cockpit" title="Versão do Cockpit">
        ${Object.entries(ROTULOS).map(([n, r]) => `<option value="${n}"${Number(n) === atual ? " selected" : ""}>${r}</option>`).join("")}
      </select>
      <button type="button" class="versao-info" data-versao-info title="O que entra em cada versão" aria-label="O que entra em cada versão">i</button>
      <div class="versao-pop" id="versaoPop">${resumoPainel()}</div>`;
    alvo.insertBefore(wrap, depoisDe ? depoisDe.nextSibling : alvo.firstChild);
    wrap.querySelector(".versao-select").addEventListener("change", (e) => trocar(Number(e.target.value)));
    wrap.addEventListener("click", (e) => {
      if (e.target.closest("[data-versao-info]")) wrap.querySelector("#versaoPop").classList.toggle("is-open");
    });
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".versao-wrap")) wrap.querySelector("#versaoPop").classList.remove("is-open");
    });
  }

  // Esconde na barra o que a versão não tem (biblioteca de widgets e filtro geral).
  function aplicarNaPagina() {
    document.querySelectorAll('[data-action="add-widget"]').forEach((b) => {
      if (!tem("widget." + b.dataset.type) && b.dataset.type !== "mapa") b.hidden = true;
    });
    if (!tem("filtro-geral")) {
      const f = document.querySelector(".filtro-geral-wrap");
      if (f) f.hidden = true;
    }
    // sem nada na barra de ferramentas (só havia o Filtros geral, da v3), a faixa some e a tela ganha o espaço
    document.body.classList.toggle("sem-toolbar", !tem("filtro-geral"));
  }

  document.addEventListener("DOMContentLoaded", aplicarNaPagina);

  return { atual, tem, chaveLayout, trocar, montarSeletor, RECURSOS };
})();
