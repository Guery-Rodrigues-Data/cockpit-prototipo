/* ==========================================================================
   Cockpit — abas do painel lateral quando o dispositivo selecionado é um controlador
   (categoria Semáforos): Geral (cadastro e status), Alertas, Comandos e Grupos. Quem monta o painel e troca de
   aba é painel-selecao.js; aqui só mora o conteúdo de cada aba.

   O que é real e o que é simulado:
   - Cadastro (Geral) e Grupos: reais. Grupos vêm de `grupos_focais` (o mesmo Supabase do Croqui).
   - Conexão e alertas são a simulação do LiveState. Plano e cor ainda não têm origem
     definida, então aparecem como "Sem dado", sem valor inventado.
   - Comandos: a lista é a que o Guery definiu, mas o envio é simulado (só registra o
     pedido); a resposta do controlador depende do protocolo, que é da fase 2.
   ========================================================================== */

const PainelControlador = (() => {
  // Base do Croqui para o botão "Abrir croqui": local usa a porta do croqui-prototipo, o resto
  // usa o deploy oficial.
  const URL_CROQUI = ["localhost", "127.0.0.1"].includes(location.hostname)
    ? "http://localhost:8743/"
    : "https://croqui-prototipo-delta.vercel.app/";

  // A aba Alertas leva a contagem no rótulo, para dar para ver de fora se há algo a olhar.
  function abas(eq) {
    const n = LiveState.alertasDoEquipamento(eq.id).length;
    return [
      { id: "geral", label: "Geral" },
      { id: "alertas", label: `Alertas${n ? ` <span class="sel-aba-n">${n}</span>` : ""}` },
      { id: "comandos", label: "Comandos" },
      { id: "grupos", label: "Grupos" },
    ];
  }

  // `grupo`: "executar" = age sobre o controlador; sem grupo = só consulta. `confirmar`: pede um segundo
  // clique antes de enviar.
  // `icone`: traços do SVG (24x24, contorno), como no painel de comandos do sistema atual.
  const COMANDOS = [
    { id: "versao-fw", nome: "Versão do FW", icone: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>' },
    { id: "detectores-avariados", nome: "Detectores Avariados", icone: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>' },
    { id: "lampadas-queimadas", nome: "Lâmpadas Queimadas", icone: '<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z"/>' },
    { id: "status-detectores-botoeiras", nome: "Status Detectores e botoeiras", icone: '<circle cx="12" cy="12" r="2"/><path d="M16.2 7.8a6 6 0 0 1 0 8.4"/><path d="M7.8 16.2a6 6 0 0 1 0-8.4"/><path d="M19.1 4.9a10 10 0 0 1 0 14.2"/><path d="M4.9 19.1a10 10 0 0 1 0-14.2"/>' },
    { id: "reset", nome: "Reset", grupo: "executar", confirmar: true, icone: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>' },
    { id: "sincronizacao-horario", nome: "Sincronização de Horário", grupo: "executar", icone: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>' },
    { id: "busca-alarmes", nome: "Busca de Alarmes", icone: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>' },
    { id: "busca-eventos-gerais", nome: "Busca dos eventos gerais", icone: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h5"/>' },
    { id: "limpar-alarmes-gerais", nome: "Limpar alarmes gerais", grupo: "executar", confirmar: true, icone: '<circle cx="12" cy="12" r="9"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>' },
  ];

  const historico = new Map(); // id do controlador -> [{ nome, hora, enviado }] (só desta sessão)
  const cacheGrupos = new Map(); // id do controlador -> { estado, grupos, croquis, erro }

  const redesenhar = () => PainelSelecao.redesenharDados();
  const statusTag = (eq) =>
    `<span class="status-tag" data-status="${eq.online ? "online" : "offline"}">${eq.online ? "Online" : "Offline"}</span>`;
  const horaAgora = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  /* ---------- Geral: status em tempo real + cadastro ---------- */

  function geralMarkup(eq) {
    const sub = eq.subareaId ? nomeSubarea(eq.subareaId) : null;
    const cor = eq.corredorId ? nomeCorredor(eq.corredorId) : null;
    return `
      <div class="sel-bloco">
        <div class="sel-linha"><span>Conexão</span>${statusTag(eq)}</div>
        <div class="sel-linha"><span>Plano</span><em>Sem dado</em></div>
        <div class="sel-linha"><span>Cor</span><em>Sem dado</em></div>
      </div>
      <div class="sel-bloco">
        <div class="sel-linha"><span>Identificador</span><strong class="sel-mono">${eq.id}</strong></div>
        <div class="sel-linha"><span>Categoria</span><strong>${categoriaLabel(eq.tipo)}</strong></div>
        <div class="sel-linha"><span>Subárea</span>${sub ? `<strong>${sub}</strong>` : "<em>Fora de subárea</em>"}</div>
        <div class="sel-linha"><span>Corredor</span>${cor ? `<strong>${cor}</strong>` : "<em>Fora de corredor</em>"}</div>
        <div class="sel-linha"><span>Posição</span><strong class="sel-mono">${eq.lat.toFixed(5)}, ${eq.lng.toFixed(5)}</strong></div>
      </div>`;
  }

  /* ---------- Alertas ---------- */

  function alertasMarkup(eq) {
    const alertas = LiveState.alertasDoEquipamento(eq.id);
    return `
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

  /* ---------- Comandos ---------- */

  function cartaoComando(c, eqId) {
    return `
          <button type="button" class="sel-cmd${c.confirmar ? " is-perigo" : ""}" data-sel-cmd="${c.id}" data-eq="${eqId}" title="${c.nome}">
            <span class="sel-cmd-icone"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${c.icone}</svg></span>
            <span class="sel-cmd-nome">${c.nome}</span>
          </button>`;
  }

  // Dois blocos: o que só lê do controlador e o que age sobre ele (grade de 3 colunas em cada um).
  const GRUPOS_COMANDOS = [
    { id: "consultar", titulo: "Consultar" },
    { id: "executar", titulo: "Executar" },
  ];

  function comandosMarkup(eq) {
    const enviados = historico.get(eq.id) || [];
    return `
      <div class="sel-bloco">
        ${eq.online ? "" : '<div class="sel-aviso">Controlador offline: o comando pode não chegar até ele.</div>'}
        ${GRUPOS_COMANDOS.map(
          (g) => `
        <h5 class="sel-cmd-grupo">${g.titulo}</h5>
        <div class="sel-cmds">${COMANDOS.filter((c) => (c.grupo || "consultar") === g.id)
          .map((c) => cartaoComando(c, eq.id))
          .join("")}
        </div>`
        ).join("")}
      </div>
      <div class="sel-bloco">
        <h5>Enviados nesta sessão <span class="sel-contagem">${enviados.length}</span></h5>
        ${
          enviados.length
            ? enviados
                .map(
                  (h) => `
          <div class="sel-hist">
            <span class="id-mono">${h.hora}</span>
            <strong>${h.nome}</strong>
            <span class="status-tag" data-status="${h.enviado ? "online" : "pendente"}">${h.enviado ? "Enviado" : "Enviando"}</span>
          </div>`
                )
                .join("")
            : '<div class="sel-vazio">Nenhum comando enviado.</div>'
        }
      </div>`;
  }

  function enviarComando(botao) {
    const cmd = COMANDOS.find((c) => c.id === botao.dataset.selCmd);
    const eqId = botao.dataset.eq;
    if (!cmd) return;
    // dois cliques: o primeiro só arma o botão, para não resetar sem querer
    if (cmd.confirmar && !botao.dataset.armado) {
      const rotulo = botao.querySelector(".sel-cmd-nome");
      botao.dataset.armado = "1";
      botao.classList.add("is-armado");
      rotulo.textContent = "Confirmar?";
      setTimeout(() => {
        if (botao.isConnected) {
          delete botao.dataset.armado;
          botao.classList.remove("is-armado");
          rotulo.textContent = cmd.nome;
        }
      }, 3000);
      return;
    }
    const lista = historico.get(eqId) || [];
    const entrada = { nome: cmd.nome, hora: horaAgora(), enviado: false };
    historico.set(eqId, [entrada, ...lista].slice(0, 20));
    redesenhar();
    setTimeout(() => {
      entrada.enviado = true;
      redesenhar();
      toast(`${cmd.nome}: comando enviado (simulado).`);
    }, 700);
  }

  /* ---------- Grupos: reais, do croqui ---------- */

  const TIPO_GRUPO = { veicular: "Veicular", pedestre: "Pedestre" };

  function carregarGrupos(id) {
    const atual = cacheGrupos.get(id);
    if (atual && atual.estado !== "erro") return; // já carregado ou carregando
    cacheGrupos.set(id, { estado: "carregando" });
    const alvo = encodeURIComponent(id);
    Promise.all([
      supabaseRequisitar(`grupos_focais?select=uid,id,tipo,direcao,fase,croqui_id,tem_repetidor,repetidor_de&controlador_id=eq.${alvo}&order=fase.asc`),
      supabaseRequisitar(`croqui_controladores?select=croqui_id,virtual&controlador_id=eq.${alvo}`),
    ])
      .then(([grupos, vinculos]) => {
        // o croqui onde o controlador "mora" (não virtual) vem primeiro
        const croquis = [...new Set([...vinculos.filter((v) => !v.virtual), ...vinculos.filter((v) => v.virtual), ...grupos].map((x) => x.croqui_id))];
        cacheGrupos.set(id, { estado: "ok", grupos, croquis });
      })
      .catch((erro) => cacheGrupos.set(id, { estado: "erro", erro: erro.message }))
      .finally(redesenhar);
  }

  // Um controlador pode estar em mais de um croqui; os grupos são mostrados por croqui.
  function grupoMarkup(g) {
    const tipo = TIPO_GRUPO[g.tipo] || escaparHtml(g.tipo || "");
    const detalhe = [g.direcao ? escaparHtml(g.direcao) : null, g.fase != null ? `Fase ${g.fase}` : null].filter(Boolean).join(" · ");
    const repetidor = g.tem_repetidor
      ? `<span class="status-tag" data-status="online">Repetidor${g.repetidor_de ? ` de ${escaparHtml(g.repetidor_de)}` : ""}</span>`
      : "";
    return `
      <div class="sel-grupo">
        <span class="sel-grupo-id">${escaparHtml(g.id || "")}</span>
        <div class="sel-grupo-txt"><strong>${tipo}</strong><span>${detalhe || "Sem detalhes"}</span></div>
        ${repetidor}
      </div>`;
  }

  function gruposMarkup(eq) {
    const c = cacheGrupos.get(eq.id);
    if (!c || c.estado === "carregando") {
      return `<div class="sel-bloco"><div class="sel-vazio">Carregando os grupos do croqui...</div></div>`;
    }
    if (c.estado === "erro") {
      return `<div class="sel-bloco"><div class="sel-aviso">Não foi possível ler os grupos. ${escaparHtml(c.erro)}</div>
        <button type="button" class="btn-secondary" data-sel-acao="recarregar-grupos" style="margin-top:8px">Tentar de novo</button></div>`;
    }
    if (c.croquis.length === 0) {
      return `<div class="sel-bloco"><div class="sel-vazio">Este controlador não está em nenhum croqui.</div></div>`;
    }
    return c.croquis
      .map((croquiId) => {
        const grupos = c.grupos.filter((g) => g.croqui_id === croquiId);
        return `
      <div class="sel-bloco">
        <h5>Croqui <span class="sel-mono">${escaparHtml(croquiId)}</span> <span class="sel-contagem">${grupos.length} ${grupos.length === 1 ? "grupo" : "grupos"}</span></h5>
        ${grupos.length ? grupos.map(grupoMarkup).join("") : '<div class="sel-vazio">Nenhum grupo focal cadastrado neste croqui.</div>'}
        <a class="btn-secondary sel-link" href="${URL_CROQUI}editor-croqui.html?id=${encodeURIComponent(croquiId)}" target="_blank" rel="noopener">Abrir croqui</a>
      </div>`;
      })
      .join("");
  }

  /* ---------- API ---------- */

  function dados(eq, aba) {
    if (aba === "alertas") return alertasMarkup(eq);
    if (aba === "comandos") return comandosMarkup(eq);
    if (aba === "grupos") return gruposMarkup(eq);
    return geralMarkup(eq);
  }

  document.addEventListener("click", (e) => {
    const botao = e.target.closest("[data-sel-cmd]");
    if (botao) enviarComando(botao);
    if (e.target.closest('[data-sel-acao="recarregar-grupos"]')) {
      const sel = CockpitMap.getSelecao();
      if (sel && sel.tipo === "equipamento") {
        cacheGrupos.delete(sel.id);
        carregarGrupos(sel.id);
        redesenhar();
      }
    }
  });

  return { abas, dados, carregarGrupos, statusTag };
})();
