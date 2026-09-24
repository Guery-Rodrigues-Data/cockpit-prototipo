/* ==========================================================================
   Cockpit — abas do painel lateral quando o dispositivo selecionado é um controlador
   (categoria Semáforos): Geral (cadastro e status), Plano, Alertas e Comandos (Grupos está desligada por ora). Quem monta o painel e troca de
   aba é painel-selecao.js; aqui só mora o conteúdo de cada aba.

   O que é real e o que é simulado:
   - Cadastro (Geral) e Grupos: reais. Grupos vêm de `grupos_focais` (o mesmo Supabase do Croqui).
   - Conexão e alertas são a simulação do LiveState. Plano e cor ainda não têm origem
     definida, então aparecem como "Sem dado", sem valor inventado.
   - Plano: tudo de exemplo (planos, tabela horária, grupos) — ver PLANOS_EXEMPLO.
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
      { id: "plano", label: "Plano" },
      { id: "alertas", label: `Alertas${n ? ` <span class="sel-aba-n">${n}</span>` : ""}` },
      { id: "comandos", label: "Comandos" },
      // Grupos fora por enquanto (pedido do Guery, 23/09). O conteúdo (gruposMarkup) continua
      // aqui — é só descomentar para voltar.
      // { id: "grupos", label: "Grupos" },
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
    { id: "busca-eventos-gerais", nome: "Busca dos eventos gerais", icone: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h5"/>' },
    { id: "limpar-alarmes-gerais", nome: "Limpar alarmes gerais", grupo: "executar", confirmar: true, icone: '<circle cx="12" cy="12" r="9"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>' },
  ];

  const historico = new Map(); // id do controlador -> [{ cmdId, nome, hora, enviado }], mais recente primeiro (só desta sessão)
  const cacheGrupos = new Map(); // id do controlador -> { estado, grupos, croquis, erro }

  const redesenhar = () => PainelSelecao.redesenharDados();
  const statusTag = (eq) =>
    `<span class="status-tag" data-status="${eq.online ? "online" : "offline"}">${eq.online ? "Online" : "Offline"}</span>`;
  const horaAgora = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  /* ---------- Geral: seções recolhíveis como no sistema atual ---------- */

  // Fabricante e modelo não existem no banco: são os valores do print do sistema atual, como exemplo.
  const DETALHES_EXEMPLO = { fabricante: "DATAPROM", modelo: "DP40" };

  // Modo de operação e plano ainda não têm origem real (protocolo é fase 2): valores de
  // exemplo tirados do print do sistema atual, mesmo padrão do DETALHES_EXEMPLO acima.
  const OPERACAO_EXEMPLO = {
    portaEquipamento: "Fechada",
    programacao: "Normal",
    subareaLogica: "21",
    selecao: "Centro",
    statusModo: "Cores",
    plano: "4",
    ciclo: "24/90",
    defasagem: "26",
    sincronismo: "Sincronizado",
    modoPlano: "Tempo fixo com sincronismo",
    requisitado: "Nenhum",
    etapa: "E1",
    vigenciaInicio: "22/09/2026 09:00:00",
    vigenciaFim: "22/09/2026 15:59:59",
  };

  // Seções que começam fechadas (as outras começam abertas). O estado vale para todos os controladores.
  const secoesFechadas = new Set(["campos", "vinculados"]);

  function secaoMarkup(id, titulo, corpo) {
    const aberta = !secoesFechadas.has(id);
    return `
      <div class="sel-secao">
        <button type="button" class="sel-secao-topo" data-sel-secao="${id}" aria-expanded="${aberta}">
          <span>${titulo}</span>${ICONS.chevronDown}
        </button>
        ${aberta ? `<div class="sel-secao-corpo">${corpo}</div>` : ""}
      </div>`;
  }

  const linha = (rotulo, valor) => `<div class="sel-linha"><span>${rotulo}</span>${valor}</div>`;
  const valor = (v) => (v ? `<strong>${v}</strong>` : "<em>Sem dado</em>");
  // Campo em grade (rótulo em cima, valor embaixo) — ver .sel-campos no CSS. `full` ocupa a
  // linha inteira, pra valor mais longo (ex.: data/hora) não espremer ao lado de um curto.
  const campo = (rotulo, valorHtml, full) => `<div class="sel-campo${full ? " is-full" : ""}"><span>${rotulo}</span>${valorHtml}</div>`;

  // Endereço por geocodificação reversa (OpenStreetMap/Nominatim, consulta pública gratuita), uma por
  // controlador e no máximo uma por segundo, que é o limite do serviço.
  const cacheEndereco = new Map(); // id do controlador -> { estado, rua, numero, bairro }
  let filaEndereco = Promise.resolve();

  function carregarEndereco(eq) {
    if (cacheEndereco.has(eq.id)) return;
    cacheEndereco.set(eq.id, { estado: "carregando" });
    filaEndereco = filaEndereco.then(async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      try {
        const resp = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&accept-language=pt-BR&lat=${eq.lat}&lon=${eq.lng}`,
          { signal: ctrl.signal }
        );
        const a = resp.ok ? (await resp.json()).address || {} : {};
        cacheEndereco.set(eq.id, {
          estado: "ok",
          rua: a.road || a.pedestrian || a.cycleway || null,
          numero: a.house_number || null,
          bairro: a.suburb || a.neighbourhood || a.city_district || null,
        });
      } catch (e) {
        cacheEndereco.set(eq.id, { estado: "erro" });
      } finally {
        clearTimeout(timer);
      }
      redesenhar();
      await new Promise((r) => setTimeout(r, 1100));
    });
  }

  // Bloco de topo do painel: só dado cadastral (o que é o equipamento) + status de comunicação
  // agora. Nome não repete aqui — já está no subtítulo do cabeçalho do painel. Endereço, status
  // operacional e modo de operação têm seção própria logo abaixo. "Última comunicação" fica
  // fixa no rodapé do painel (ver rodapeMarkup), visível em qualquer aba, não só na Geral.
  function identificacaoMarkup(eq) {
    return `<div class="sel-campos">
      ${campo("Tipo", "<strong>Controlador</strong>")}
      ${campo("Modelo", `<strong>${DETALHES_EXEMPLO.modelo}</strong>`)}
      ${campo("Fabricante", `<strong>${DETALHES_EXEMPLO.fabricante}</strong>`)}
      ${campo("Comunicação", statusTag(eq))}
    </div>`;
  }

  // Rodapé fixo do painel (fora do conteúdo da aba): comunicação é status que importa em
  // qualquer aba que o operador esteja olhando, não só na Geral. Online é agora; offline é
  // quando esta sessão viu o controlador cair (LiveState).
  function rodapeMarkup(eq) {
    const agora = new Date();
    const ultima = eq.online ? agora : eq.ultimaComunicacao ? new Date(eq.ultimaComunicacao) : null;
    return `<div class="sel-footer-linha"><span>Última comunicação</span> ${valor(ultima ? fmtHora(ultima) : null)}</div>`;
  }

  // O que é "leitura ao vivo" do equipamento (muda com o funcionamento, não é dado cadastral):
  // a comparação de relógio Equip. x Servidor é o que o operador mais confere aqui
  // (dessincronizar o relógio bagunça o plano), junto com porta e modo de programação.
  // Relógio do equipamento é simulado: essa hora própria não existe no modelo ainda
  // (telemetria real é fase 2); uso um desvio pequeno e fixo por equipamento só pra dar
  // exemplo visual de sincronizado x fora de sincronia.
  function statusOperacionalMarkup(eq) {
    const agora = new Date();
    const desvioS = (eq.id.charCodeAt(eq.id.length - 1) % 12) - 6;
    const equipamento = new Date(agora.getTime() + desvioS * 1000);
    return `<div class="sel-campos">
      ${campo("Porta do equipamento", `<strong>${OPERACAO_EXEMPLO.portaEquipamento}</strong>`)}
      ${campo("Programação", `<strong>${OPERACAO_EXEMPLO.programacao}</strong>`)}
      ${campo("Horário do equipamento", `<strong>${fmtHora(equipamento)}</strong>`)}
      ${campo("Horário do servidor", `<strong>${fmtHora(agora)}</strong>`)}
    </div>`;
  }

  // Subárea/Corredor de cadastro (mesmo dado de "Endereço", não repete lá) + o que é
  // seleção operacional do plano (Subárea lógica, Seleção, Status) + o modo do plano em curso
  // (pedido do Guery: fica aqui na Geral, não na aba Plano; no modal de planos continua por plano).
  function modoOperacaoMarkup(eq) {
    const sub = eq.subareaId ? nomeSubarea(eq.subareaId) : null;
    const cor = eq.corredorId ? nomeCorredor(eq.corredorId) : null;
    return `<div class="sel-campos">
      ${campo("Modo", `<strong>${PLANOS_EXEMPLO[faixaAgora()[2]].modo}</strong>`, true)}
      ${campo("Subárea lógica", `<strong>${OPERACAO_EXEMPLO.subareaLogica}</strong>`)}
      ${campo("Subárea do sistema", `<strong>${sub || "Fora de subárea"}</strong>`)}
      ${campo("Seleção", `<strong>${OPERACAO_EXEMPLO.selecao}</strong>`)}
      ${campo("Corredor", `<strong>${cor || "Fora de corredor"}</strong>`)}
      ${campo("Status", `<strong>${OPERACAO_EXEMPLO.statusModo}</strong>`)}
    </div>`;
  }

  // Resumo em destaque (2 blocos grandes), reservado pra quando existir a aba Plano própria —
  // por ora não é chamado em lugar nenhum (tirado da Geral: vai ficar bastante coisa lá dentro).
  function planoResumoMarkup() {
    return `<div class="sel-kpis is-duo">
      <div class="sel-kpi"><b>${OPERACAO_EXEMPLO.plano}</b><span>Plano</span></div>
      <div class="sel-kpi"><b>${OPERACAO_EXEMPLO.sincronismo}</b><span>Sincronismo</span></div>
    </div>`;
  }

  function enderecoMarkup(eq) {
    const e = cacheEndereco.get(eq.id) || { estado: "carregando" };
    const buscando = e.estado === "carregando" ? "<em>Buscando...</em>" : null;
    return `<div class="sel-campos">
      ${campo("Logradouro", buscando || valor(e.rua), true)}
      ${campo("Bairro", buscando || valor(e.bairro))}
      ${campo("Coordenadas", `<strong class="sel-mono">${eq.lat.toFixed(5)}, ${eq.lng.toFixed(5)}</strong>`)}
    </div>`;
  }

  // Atalho pro croqui onde esse controlador mora — abre em modo SÓ LEITURA (apresentacao-
  // croqui.html, não editor-croqui.html — quem vem do Cockpit não deve editar o croqui por
  // acidente).
  //
  // FIXO POR ENQUANTO: sempre leva pro mesmo croqui de exemplo (CRQ-2260/302260), pedido do
  // Guery pra ter uma referência estável enquanto mexemos nisso — ainda não é por controlador
  // de verdade (isso usaria cacheGrupos, igual a aba Grupos, mas tá comentado embaixo pra
  // quando for a hora de ligar de novo).
  function croquiAtalhoMarkup(eq) {
    const url = `${URL_CROQUI}apresentacao-croqui.html?id=CRQ-2260&ct=302260`;
    return `<div class="sel-croqui-atalho"><a class="btn-text" href="${url}" target="_blank" rel="noopener">Ver croqui cadastrado</a></div>`;
    // const c = cacheGrupos.get(eq.id);
    // if (!c || c.estado !== "ok" || !c.croquis.length) return "";
    // const croquiId = c.croquis[0];
    // const url = `${URL_CROQUI}apresentacao-croqui.html?id=${encodeURIComponent(croquiId)}&ct=${encodeURIComponent(eq.id)}`;
    // return `<div class="sel-croqui-atalho"><a class="btn-text" href="${url}" target="_blank" rel="noopener">Ver croqui cadastrado</a></div>`;
  }

  function geralMarkup(eq) {
    return `
      <div class="sel-bloco">${identificacaoMarkup(eq)}</div>
      ${secaoMarkup("status-operacional", "Status operacional", statusOperacionalMarkup(eq))}
      ${secaoMarkup("modo-operacao", "Modo de operação", modoOperacaoMarkup(eq))}
      ${croquiAtalhoMarkup(eq)}`;
    // "Endereço", "Campos customizados" e "Dispositivos vinculados" saíram da Geral por ora —
    // Endereço pode voltar depois; Vinculados pode virar aba própria mais pra frente.
  }

  /* ---------- Alertas ---------- */

  // Rótulo "Alertas ativos" sem repetir a contagem (a aba já mostra o número). Linha do tempo
  // (bolinha colorida + traço ligando os itens), referência que o Guery trouxe (print
  // "alert.png", seção "Audit Timeline"). O que importa é o alerta em si — descrição em
  // destaque, severidade/hora viram metadado pequeno embaixo. A bolinha pulsa pra deixar claro
  // que é alerta ATIVO (agora), não um histórico/log parado.
  function alertasMarkup(eq) {
    const alertas = LiveState.alertasDoEquipamento(eq.id);
    return `
      <div class="sel-bloco sel-timeline">
        <h5>Alertas ativos</h5>
        ${
          alertas.length
            ? alertas
                .map(
                  (a) => `
          <div class="sel-timeline-item" data-sev="${a.severidade}">
            <span class="sel-timeline-dot"></span>
            <div class="sel-timeline-content">
              <p>${a.descricao}</p>
              <div class="sel-timeline-meta"><span class="id-mono">${a.dataHora}</span></div>
            </div>
          </div>`
                )
                .join("")
            : '<div class="sel-vazio">Nenhum alerta ativo.</div>'
        }
      </div>`;
  }

  /* ---------- Comandos ---------- */

  // Ícone verde = o último envio desse comando a este controlador já teve resposta.
  function respondido(eqId, cmdId) {
    const ultimo = (historico.get(eqId) || []).find((h) => h.cmdId === cmdId);
    return !!ultimo && ultimo.enviado;
  }

  function cartaoComando(c, eqId) {
    const aberta = aberto.get(eqId) === c.id;
    // A seta é um botão irmão (não dá para pôr botão dentro de botão): clicar nela só mostra ou
    // esconde a resposta que já voltou, sem reenviar o comando.
    const seta = temResposta(eqId, c.id)
      ? `<button type="button" class="sel-cmd-seta" data-sel-res="alternar" data-cmd="${c.id}" aria-expanded="${aberta}" aria-label="${aberta ? "Esconder" : "Mostrar"} a resposta de ${c.nome}" title="${aberta ? "Esconder" : "Mostrar"} a resposta">${ICONS.chevronDown}</button>`
      : "";
    return `
          <div class="sel-cmd-linha">
            ${seta}
            <button type="button" class="sel-cmd${c.confirmar ? " is-perigo" : ""}${respondido(eqId, c.id) ? " is-respondido" : ""}" data-sel-cmd="${c.id}" data-eq="${eqId}" title="Executar: ${c.nome}">
              <span class="sel-cmd-icone"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${c.icone}</svg></span>
              <span class="sel-cmd-nome">${c.nome}</span>
              <span class="sel-cmd-play">${ICONS.play}</span>
            </button>
          </div>`;
  }

  // Dois blocos: o que só lê do controlador e o que age sobre ele (grade de 3 colunas em cada um).
  const GRUPOS_COMANDOS = [
    { id: "consultar", titulo: "Consultar" },
    { id: "executar", titulo: "Executar" },
  ];

  // "Enviados nesta sessão" saiu por enquanto — o histórico (`historico`) continua registrado
  // por baixo (é o que faz o ícone verde de "já respondeu" funcionar), só não lista mais aqui.
  function comandosMarkup(eq) {
    return `
      <div class="sel-bloco">
        ${eq.online ? "" : '<div class="sel-aviso">Controlador offline: o comando pode não chegar até ele.</div>'}
        ${GRUPOS_COMANDOS.map(
          (g) => `
        <h5 class="sel-cmd-grupo">${g.titulo}</h5>
        <div class="sel-cmds">${COMANDOS.filter((c) => (c.grupo || "consultar") === g.id)
          .map((c) => cartaoComando(c, eq.id) + resultadoMarkup(eq, c.id))
          .join("")}
        </div>`
        ).join("")}
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
    const entrada = { cmdId: cmd.id, nome: cmd.nome, hora: horaAgora(), enviado: false };
    const montarResultado = RESULTADOS[cmd.id];
    historico.set(eqId, [entrada, ...lista].slice(0, 20));
    if (montarResultado) {
      guardarResultado(eqId, cmd.id, { titulo: cmd.nome, pendente: true, corpo: '<div class="sel-vazio">Aguardando resposta do controlador...</div>' });
      aberto.set(eqId, cmd.id);
    }
    redesenhar();
    if (montarResultado) mostrarResultado();
    setTimeout(() => {
      entrada.enviado = true;
      const eq = LiveState.equipamentoPorId(eqId);
      if (eq && montarResultado) guardarResultado(eqId, cmd.id, montarResultado(eq));
      redesenhar();
      if (montarResultado) mostrarResultado();
      else toast(`${cmd.nome}: comando enviado (simulado).`);
    }, 700);
  }

  /* ---------- Resultado dos comandos (mesmo conteúdo dos modais do sistema atual, embaixo da lista) ---------- */

  // Só os comandos com print definido mostram resultado; os demais continuam só registrando o envio.
  // Os valores são de exemplo (os mesmos dos prints), não vêm do controlador.

  const pad = (n) => String(n).padStart(2, "0");
  const fmtDataHora = (d) =>
    `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} - ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const fmtHora = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

  // "Cruzamento: rua x rua" em vermelho + "Controlador - id", igual nos modais dos prints
  function cabecalhoResultado(eq, rotulo = "Cruzamento") {
    return `
      <div class="cmd-cruz"><span class="cmd-rotulo">${rotulo}:</span> ${eq.nome}</div>
      <div class="cmd-ctrl">Controlador - ${eq.id}</div>`;
  }

  function tabelaResultado(colunas, linhas) {
    return `
      <div class="cmd-tabela">
        <table>
          <thead><tr>${colunas.map((c) => `<th>${c}</th>`).join("")}</tr></thead>
          <tbody>${linhas.map((l) => `<tr>${l.map((v) => `<td>${v}</td>`).join("")}</tr>`).join("")}</tbody>
        </table>
      </div>`;
  }

  function resultadoVersao(eq) {
    const placas = [["CPU", "CPU123"], ["MON", "MON123"], ["IHM", "IHM123"]];
    return {
      titulo: "Versão do firmware e número de série das placas",
      corpo: `
        <div class="cmd-placas-titulo">Placas - ${eq.id}</div>
        <div class="cmd-placas">
          ${placas.map(([tipo, serial]) => `<div class="cmd-placa"><b>${tipo}</b><span><b>Versão:</b> 1.0.0</span><span><b>Serial</b> ${serial}</span></div>`).join("")}
        </div>
        ${tabelaResultado(["Tipo da placa", "Versão", "Serial"], [["Potencia 1", "1.0.0", "POT123"]])}`,
    };
  }

  function resultadoDetectores(eq) {
    const agora = fmtDataHora(new Date());
    const detectores = ["Detector Antares 05", "Detector Antares 06"];
    return {
      titulo: "Detectores avariados",
      corpo: `
        ${cabecalhoResultado(eq)}
        ${detectores
          .map(
            (nome) => `
        <div class="cmd-campos">
          <b>Identificação:</b><span>${nome}</span>
          <b>Tipo:</b><span>Físico</span>
          <b>Data/hora:</b><span>${agora}</span>
        </div>`
          )
          .join("")}`,
    };
  }

  function resultadoSincronizacao(eq) {
    const servidor = new Date();
    const controlador = new Date(servidor.getTime() - 146000); // relógio atrasado, como no exemplo do print
    return {
      titulo: "Sincronização de horário",
      corpo: `
        ${cabecalhoResultado(eq, "Interseção")}
        <div class="cmd-campos">
          <b>Horário atual do servidor:</b><span>${fmtDataHora(servidor)}</span>
          <b>Horário atual do controlador:</b><span>${fmtDataHora(controlador)}</span>
        </div>
        <div class="cmd-sucesso">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8 12.5 3 3 5-6"/></svg>
          <p>Relógio do controlador atualizado com sucesso<br />para ${fmtDataHora(servidor)}</p>
        </div>`,
    };
  }

  const RESULTADOS = {
    "versao-fw": resultadoVersao,
    "detectores-avariados": resultadoDetectores,
    "sincronizacao-horario": resultadoSincronizacao,
  };

  // Resultado mais recente de cada controlador (o que aparece embaixo da lista de comandos).
  const resultados = new Map(); // id do controlador -> Map(id do comando -> { titulo, corpo, aoBaixar?, pendente? })
  const aberto = new Map(); // id do controlador -> id do comando cuja resposta está aberta (uma por vez)

  const resultadoGuardado = (eqId, cmdId) => (resultados.get(eqId) || new Map()).get(cmdId);
  function guardarResultado(eqId, cmdId, r) {
    if (!resultados.has(eqId)) resultados.set(eqId, new Map());
    resultados.get(eqId).set(cmdId, r);
  }
  // A seta só aparece quando já há resposta guardada (não enquanto aguarda).
  const temResposta = (eqId, cmdId) => {
    const r = resultadoGuardado(eqId, cmdId);
    return !!r && !r.pendente;
  };

  // Devolve o resultado só se ele for do comando pedido: ele aparece logo abaixo da linha desse comando.
  function resultadoMarkup(eq, cmdId) {
    const r = resultadoGuardado(eq.id, cmdId);
    if (!r || aberto.get(eq.id) !== cmdId) return "";
    return `
      <div class="sel-resultado" id="selResultado">
        <div class="sel-resultado-topo">
          <strong>${r.titulo}</strong>
          <button type="button" class="sel-resultado-x" data-sel-res="fechar" aria-label="Fechar resultado" title="Fechar resultado">${ICONS.x}</button>
        </div>
        ${r.corpo}
      </div>`;
  }

  function mostrarResultado() {
    const el = document.getElementById("selResultado");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
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

  /* ---------- Plano: diagrama do plano em curso + planos do dia ---------- */

  // TUDO DE EXEMPLO, igual para todo controlador: plano e tabela horária ainda não têm origem
  // (importação do legado é da Fase 1, mecanismo com o time técnico). O Plano 1 é o do print
  // do sistema atual (23/09, Westphalen x João Viana Seiler: estágios 50/30, defasagem 40,
  // 07:00–08:59). O Plano 4 bate com a vigência do OPERACAO_EXEMPLO (09:00–15:59). Os demais e
  // as descrições são inventados — o legado só tem o número do plano, sem descrição.
  // 16 planos: cidade grande (ex.: Curitiba) chega nisso. Sem cor por plano de propósito —
  // ninguém distingue 16 cores; a cor marca só o plano SELECIONADO (ver .plano-bloco no CSS).
  const PLANOS_EXEMPLO = Object.fromEntries(
    [
      [1, "Pico manhã", [50, 30], 40],
      [2, "Transição", [40, 30], 20],
      [3, "Pico tarde", [55, 45], 60],
      [4, "Entrepico", [45, 35], 26],
      [5, "Madrugada", [30, 20], 0],
      [6, "Sábado comércio", [45, 30], 10],
      [7, "Almoço", [45, 30], 30],
      [8, "Sexta pico tarde", [35, 10, 10, 20], 13],
      [9, "Entrada escolar", [40, 35], 15],
      [10, "Noite", [35, 25], 5],
      [11, "Sexta noite", [40, 30], 12],
      [12, "Madrugada fim de semana", [25, 20], 0],
      [13, "Sábado tarde", [40, 30], 18],
      [14, "Domingo manhã", [30, 25], 0],
      [15, "Domingo lazer", [40, 35], 8],
      [16, "Evento / jogo", [70, 30], 0],
    ].map(([num, desc, est, def]) => [num, { num, desc, est, def, estrutura: 1, modo: "Tempo fixo com sincronismo", derivSubarea: null, derivLocal: null }])
  );
  // Plano de 4 estágios, copiado da tela de configuração do Programador DP40 (print "plano config",
  // 23/09): estrutura 1 lá, aqui estrutura 2 porque o exemplo de 2 estágios já usa a 1.
  Object.assign(PLANOS_EXEMPLO[8], { est: [35, 10, 10, 20], def: 13, estrutura: 2, modo: "Sequência lógica com sincronismo" });
  // Entreverdes lido do print (HIPÓTESE): 5 s = 4 s de amarelo + 1 s de vermelho geral no veicular.
  const ENTREVERDES = 5, AMARELO = 4;
  Object.values(PLANOS_EXEMPLO).forEach((p) => (p.ciclo = p.est.reduce((a, b) => a + b, 0) + ENTREVERDES * p.est.length));
  // Horários dos planos no mesmo formato do Programador DP40 (tela de horários): cada linha diz
  // qual plano roda, em quais dias da semana (0 = Dom … 6 = Sáb), de que horas até que horas.
  // A configuração do plano (estrutura, defasagem, estágios…) fica separada, em PLANOS_EXEMPLO.
  // A grade da semana (TABELA_SEMANA) é só derivada disto. Exemplo inventado; o que o cadastro
  // real faz com buraco (horário sem plano), sobreposição e horário que vira a meia-noite ainda
  // é pendência — aqui as linhas cobrem o dia inteiro, sem sobrepor.
  const SEG_SEX = [1, 2, 3, 4, 5], SEG_QUI = [1, 2, 3, 4], SEX = [5], SAB = [6], DOM = [0];
  const HORARIOS_PLANOS = [
    { plano: 5, dias: SEG_SEX, inicio: "00:00", fim: "05:00" },
    { plano: 2, dias: SEG_SEX, inicio: "05:00", fim: "06:30" },
    { plano: 9, dias: SEG_SEX, inicio: "06:30", fim: "07:00" },
    { plano: 1, dias: SEG_SEX, inicio: "07:00", fim: "09:00" },
    { plano: 4, dias: SEG_SEX, inicio: "09:00", fim: "12:00" },
    { plano: 7, dias: SEG_SEX, inicio: "12:00", fim: "14:00" },
    { plano: 4, dias: SEG_QUI, inicio: "14:00", fim: "16:00" },
    { plano: 2, dias: SEG_QUI, inicio: "16:00", fim: "17:00" },
    { plano: 3, dias: SEG_QUI, inicio: "17:00", fim: "19:30" },
    { plano: 10, dias: SEG_QUI, inicio: "19:30", fim: "22:00" },
    { plano: 4, dias: SEX, inicio: "14:00", fim: "16:30" },
    { plano: 8, dias: SEX, inicio: "16:30", fim: "20:00" },
    { plano: 11, dias: SEX, inicio: "20:00", fim: "22:00" },
    { plano: 5, dias: SEG_SEX, inicio: "22:00", fim: "24:00" },
    { plano: 12, dias: SAB, inicio: "00:00", fim: "06:00" },
    { plano: 2, dias: SAB, inicio: "06:00", fim: "10:00" },
    { plano: 6, dias: SAB, inicio: "10:00", fim: "14:00" },
    { plano: 13, dias: SAB, inicio: "14:00", fim: "18:00" },
    { plano: 10, dias: SAB, inicio: "18:00", fim: "23:00" },
    { plano: 12, dias: SAB, inicio: "23:00", fim: "24:00" },
    { plano: 12, dias: DOM, inicio: "00:00", fim: "07:00" },
    { plano: 14, dias: DOM, inicio: "07:00", fim: "11:00" },
    { plano: 15, dias: DOM, inicio: "11:00", fim: "18:00" },
    { plano: 2, dias: DOM, inicio: "18:00", fim: "22:00" },
    { plano: 12, dias: DOM, inicio: "22:00", fim: "24:00" },
  ];
  // O Plano 16 (Evento / jogo) não tem horário: HIPÓTESE de que existe plano que só entra por
  // imposição manual. Confirmar se isso acontece no DP40.
  const emMinutos = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
  // Grade por dia [início, fim, plano] em minutos, montada uma vez (as faixas são comparadas por
  // identidade no relógio da aba, então não pode ser recriada a cada leitura).
  const TABELA_SEMANA = Object.fromEntries(
    [0, 1, 2, 3, 4, 5, 6].map((d) => [
      d,
      HORARIOS_PLANOS.filter((h) => h.dias.includes(d))
        .map((h) => [emMinutos(h.inicio), emMinutos(h.fim), h.plano])
        .sort((x, y) => x[0] - y[0]),
    ])
  );
  const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const ORDEM_SEMANA = [1, 2, 3, 4, 5, 6, 0]; // semana começando na segunda
  // Estrutura = quais grupos ficam verdes em cada estágio (HIPÓTESE NÃO VALIDADA sobre o campo
  // "Estrutura" do DP40). `verde`: índices dos estágios em que o grupo está verde.
  // Estrutura 1 é a do print do sistema atual: 1 e 4 verdes no E1, 2 e 3 no E2 (3 e 4 como
  // pedestre também é HIPÓTESE). Estrutura 2 é inventada, só pra ter um plano de 4 estágios.
  // Ainda não usa os grupos reais da aba Grupos: o campo `fase` não foi confirmado como estágio.
  const ESTRUTURAS = {
    1: [
      { id: "G1", tipo: "veic", verde: [0] },
      { id: "G2", tipo: "veic", verde: [1] },
      { id: "G3", tipo: "ped", verde: [1] },
      { id: "G4", tipo: "ped", verde: [0] },
    ],
    2: [
      { id: "G1", tipo: "veic", verde: [0] },
      { id: "G2", tipo: "veic", verde: [2, 3] },
      { id: "G3", tipo: "ped", verde: [1] },
      { id: "G4", tipo: "ped", verde: [0, 3] },
    ],
  };
  const gruposDo = (p) => ESTRUTURAS[p.estrutura] || ESTRUTURAS[1];

  let planoModal = null; // { eqId, num } — modal "Planos do controlador" aberto, e em qual plano

  const hm = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`; // fim do dia sai como 24:00
  const segDoDia = () => { const d = new Date(); return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000; };
  const hoje = () => new Date().getDay();
  const faixaAgora = () => { const m = Math.floor(segDoDia() / 60); return TABELA_SEMANA[hoje()].find((f) => m >= f[0] && m < f[1]); };
  // "Seg–Sex 07:00–09:00", "Sáb 10:00–14:00": junta dias seguidos com os mesmos horários.
  function quandoRoda(num) {
    const grupos = [];
    for (const d of ORDEM_SEMANA) {
      const k = TABELA_SEMANA[d].filter((f) => f[2] === num).map((f) => `${hm(f[0])}–${hm(f[1])}`).join(", ");
      const g = grupos[grupos.length - 1];
      if (g && g.k === k) g.fim = d;
      else grupos.push({ ini: d, fim: d, k });
    }
    // "Seg a Sex" (e não "Seg–Sex"): o traço fica só nos horários, pra não confundir as duas faixas
    return grupos.filter((g) => g.k).map((g) => ({ dias: `${DIAS[g.ini]}${g.ini !== g.fim ? ` a ${DIAS[g.fim]}` : ""}`, horarios: g.k }));
  }
  const posNoCiclo = (p) => (((segDoDia() - p.def) % p.ciclo) + p.ciclo) % p.ciclo;

  function intervalosPlano(p) {
    const out = [];
    let t = 0;
    p.est.forEach((d, i) => {
      out.push({ ini: t, fim: t + d, verde: true, i });
      t += d;
      out.push({ ini: t, fim: t + ENTREVERDES, verde: false, i });
      t += ENTREVERDES;
    });
    return out;
  }
  function estagioNoCiclo(p, t) {
    const iv = intervalosPlano(p).find((x) => t >= x.ini && t < x.fim);
    return iv.verde ? `E${iv.i + 1}` : `EV ${iv.i + 1}→${((iv.i + 1) % p.est.length) + 1}`;
  }
  function coresDoGrupo(p, g) {
    const segs = [];
    const n = p.est.length;
    for (const iv of intervalosPlano(p)) {
      const verdeAqui = g.verde.includes(iv.i);
      if (iv.verde) segs.push([iv.ini, iv.fim, verdeAqui ? "verde" : "vermelho"]);
      else if (!verdeAqui) segs.push([iv.ini, iv.fim, "vermelho"]);
      else if (g.verde.includes((iv.i + 1) % n)) segs.push([iv.ini, iv.fim, "verde"]); // segue verde no próximo estágio
      else if (g.tipo === "veic") segs.push([iv.ini, iv.ini + AMARELO, "amarelo"], [iv.ini + AMARELO, iv.fim, "vermelho"]);
      else segs.push([iv.ini, iv.fim, "intermitente"]);
    }
    return segs;
  }

  // Diagrama de barras como no sistema atual (uma linha por grupo, eixo = ciclo). `largura` muda
  // entre o painel (312) e o modal. O cursor é movido pelo relógio abaixo, sem refazer o SVG.
  const DL = 24, DR = 4, DTOPO = 18, DGAP = 4;
  // Largura útil do diagrama no painel lateral: a mesma conta do CSS de .map-selecao
  // (30% do mapa, entre 340 e 420px) menos bordas e padding. Desenhar o SVG já na largura
  // real mantém o texto do tamanho certo em vez de esticar junto com o viewBox.
  function larguraDiagramaPainel() {
    const mapaW = document.querySelector(".map-selecao")?.parentElement?.clientWidth;
    if (!mapaW) return 312;
    const painelW = Math.min(Math.max(340, mapaW * 0.3), 420, mapaW - 20);
    return Math.round(painelW) - 42; // 2px de borda + 20px de padding de cada lado (.sel-dados)
  }

  function diagramaMarkup(p, aoVivo, largura = larguraDiagramaPainel(), altLinha = 20) {
    const DW = largura, DLINHA = altLinha;
    const iw = DW - DL - DR, x = (t) => DL + (t / p.ciclo) * iw;
    const grupos = gruposDo(p);
    const base = DTOPO + grupos.length * (DLINHA + DGAP) - DGAP;
    const H = base + 22;
    const padrao = `planoInterm${DW}`;
    const fills = { verde: "var(--plano-verde)", amarelo: "var(--plano-amarelo)", vermelho: "var(--plano-vermelho)", intermitente: `url(#${padrao})` };
    let s = `<svg class="plano-diag" viewBox="0 0 ${DW} ${H}" role="img" aria-label="Diagrama do plano ${p.num}, ciclo de ${p.ciclo} segundos">
      <defs><pattern id="${padrao}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="5" height="5" fill="var(--plano-interm)"/><rect width="2.5" height="5" fill="var(--plano-vermelho)"/></pattern></defs>`;
    for (const iv of intervalosPlano(p)) {
      if (!iv.verde) continue;
      const w = x(iv.fim) - x(iv.ini);
      s += `<text x="${x(iv.ini) + w / 2}" y="11" text-anchor="middle" class="plano-diag-est">E${iv.i + 1}${w > 60 ? ` · ${iv.fim - iv.ini}s` : ""}</text>`;
    }
    grupos.forEach((g, k) => {
      const y = DTOPO + k * (DLINHA + DGAP);
      s += `<text x="0" y="${y + DLINHA / 2 + 4}" class="plano-diag-grupo">${g.id}</text>`;
      for (const [ini, fim, c] of coresDoGrupo(p, g)) s += `<rect x="${x(ini)}" y="${y}" width="${x(fim) - x(ini)}" height="${DLINHA}" fill="${fills[c]}"/>`;
    });
    for (const iv of intervalosPlano(p)) s += `<line x1="${x(iv.fim)}" x2="${x(iv.fim)}" y1="${DTOPO - 3}" y2="${base + 3}" class="plano-diag-troca"/>`;
    s += `<line x1="${DL}" x2="${x(p.ciclo)}" y1="${base + 4}" y2="${base + 4}" class="plano-diag-eixo"/>`;
    for (let t = 0; t <= p.ciclo; t += 10) s += `<line x1="${x(t)}" x2="${x(t)}" y1="${base + 4}" y2="${base + (t % 30 ? 7 : 9)}" class="plano-diag-eixo"/>`;
    const rotulos = [];
    for (let t = 0; t <= p.ciclo; t += 30) rotulos.push(t);
    if (p.ciclo - rotulos[rotulos.length - 1] >= 10) rotulos.push(p.ciclo);
    rotulos.forEach((t) => (s += `<text x="${x(t)}" y="${base + 19}" text-anchor="${t === p.ciclo ? "end" : t === 0 ? "start" : "middle"}" class="plano-diag-eixo-txt">${t}${t === p.ciclo ? "s" : ""}</text>`));
    if (aoVivo) s += `<line data-w="${DW}" y1="${DTOPO - 5}" y2="${base + 4}" class="plano-diag-cursor"/>`;
    return `${s}</svg>`;
  }

  // Uma barra de 24h de um dia da tabela horária. No painel, clicar num bloco abre o modal já
  // naquele plano; no modal, troca o plano mostrado. Nos dois casos é SÓ PARA VER.
  function barraDia(d, { sel = null, modal = false } = {}) {
    const ehHoje = d === hoje();
    const faixaAtual = faixaAgora();
    const blocos = TABELA_SEMANA[d].map((f) => {
      const p = PLANOS_EXEMPLO[f[2]], larg = ((f[1] - f[0]) / 1440) * 100;
      const marcado = sel ? f[2] === sel : ehHoje && f === faixaAtual;
      // só o número cabe num bloco de meia hora; o nome vem no title e no detalhe
      return `<button type="button" class="plano-bloco${marcado ? " is-sel" : ""}" style="width:${larg}%" data-num="${p.num}"
        ${modal ? `data-plano-ver="${p.num}"` : `data-plano-abrir="${p.num}"`} title="${DIAS[d]} ${hm(f[0])}–${hm(f[1])} · Plano ${p.num} · ${p.desc}" aria-label="${DIAS[d]}, das ${hm(f[0])} às ${hm(f[1])}: Plano ${p.num}, ${p.desc}">${larg >= 1.9 ? p.num : ""}</button>`;
    }).join("");
    return `<div class="plano-barra">${blocos}${ehHoje ? `<span class="plano-agora" style="left:${(segDoDia() / 86400) * 100}%"></span>` : ""}</div>`;
  }
  const horasMarkup = (hs) => `<div class="plano-horas">${hs.map((h) => `<span style="left:${(h / 24) * 100}%">${pad(h)}h</span>`).join("")}</div>`;

  const seloPlano = (ehEmCurso, online) =>
    !ehEmCurso
      ? '<span class="status-tag" data-status="pendente">Não está rodando</span>'
      : online
        ? '<span class="status-tag" data-status="online">Em curso</span>'
        : '<span class="status-tag" data-status="previsto">Previsto agora</span>';
  const forte = (v, cls) => `<strong${cls ? ` class="${cls}"` : ""}>${v}</strong>`;
  const legendaMarkup = () => `
        <div class="plano-legenda">
          <span><i style="background:var(--plano-verde)"></i>Verde</span>
          <span><i style="background:var(--plano-amarelo)"></i>Amarelo</span>
          <span><i style="background:var(--plano-vermelho)"></i>Vermelho</span>
          <span title="Vermelho intermitente (pedestre)"><i class="is-interm"></i>Intermitente</span>
        </div>`;

  // Painel: só o plano em curso (o olhar rápido). Estrutura, derivativos, Seleção e Requisitado
  // ficam só no modal, junto com os outros planos e a semana. Em vez do selo "Em curso", só uma
  // bolinha no nome (verde = rodando; âmbar = offline, previsto) — o caso offline já tem o aviso.
  function planoMarkup(eq) {
    const faixa = faixaAgora();
    const p = PLANOS_EXEMPLO[faixa[2]];
    // Offline: não há leitura do equipamento, então o que aparece é o previsto pela tabela
    // horária — sem cursor, pra não passar posição de ciclo como se fosse dado de campo.
    const aoVivo = eq.online;


    return `
      <div class="sel-bloco" id="planoAba">
        ${!eq.online ? '<div class="sel-aviso">Controlador offline: mostrando o plano previsto pela tabela horária, não o que ele está executando.</div>' : ""}
        <div class="sel-campos plano-resumo-campos">
          ${campo(
            "Plano",
            `<strong class="plano-nome-vivo"><i class="plano-dot${eq.online ? "" : " is-previsto"}" title="${eq.online ? "Em curso" : "Previsto pela tabela horária"}" aria-label="${eq.online ? "Em curso" : "Previsto pela tabela horária"}"></i>Plano ${p.num} · ${p.desc}</strong>`
          )}
          ${campo("Vigência", forte(`${hm(faixa[0])}–${hm(faixa[1])}`))}
          ${campo("Modo de operação", forte(p.modo), true)}
          ${campo("Sincronismo", aoVivo ? forte(OPERACAO_EXEMPLO.sincronismo) : "<em>Sem leitura</em>")}
          ${campo("Defasagem", forte(`${p.def}s`))}
        </div>
      </div>
      ${secaoMarkup(
        "plano-diagrama",
        "Diagrama do ciclo",
        // ciclo e etapa ao vivo ficam colados no diagrama: são a leitura do cursor que anda nele
        diagramaMarkup(p, aoVivo) +
          `<div class="sel-campos plano-diag-leitura">
            ${campo("Ciclo", aoVivo ? forte("—", "js-plano-ciclo") : "<em>Sem leitura</em>")}
            ${campo("Etapa", aoVivo ? forte("—", "js-plano-estagio") : "<em>Sem leitura</em>")}
          </div>` +
          legendaMarkup()
      )}
      <div class="sel-croqui-atalho plano-ver-todos"><button type="button" class="btn-text" data-plano-abrir="">Ver todos os planos</button></div>`;
      // A faixa de 24h dos planos de hoje saiu do painel (com 10+ planos não cabe em 340px e
      // repetia o modal). A semana inteira, com detalhe, fica em "Ver todos os planos".
  }

  /* ---------- Modal "Planos do controlador": todos os planos, só visualização ---------- */

  // De cima pra baixo: plano → tempos → diagrama → coordenação → quando roda (texto + semana)
  // → outros planos (chips). Sem botão Salvar de propósito: nada aqui envia comando.
  function modalEl() {
    let el = document.getElementById("planoModal");
    if (!el) {
      el = document.createElement("div");
      el.id = "planoModal";
      el.className = "modal-overlay";
      document.body.appendChild(el);
    }
    return el;
  }
  function abrirModal(eqId, num) {
    planoModal = { eqId, num: num || faixaAgora()[2] };
    renderModal();
    modalEl().classList.add("is-open");
    modalEl().querySelector("[data-plano-fechar]")?.focus();
  }
  function fecharModal() {
    planoModal = null;
    const el = document.getElementById("planoModal");
    if (el) {
      el.classList.remove("is-open");
      el.innerHTML = "";
    }
  }
  function renderModal() {
    if (!planoModal) return;
    const eq = LiveState.equipamentoPorId(planoModal.eqId);
    if (!eq) return fecharModal();
    const emCurso = PLANOS_EXEMPLO[faixaAgora()[2]];
    const p = PLANOS_EXEMPLO[planoModal.num];
    const ehEmCurso = p.num === emCurso.num;
    const aoVivo = ehEmCurso && eq.online;

    const chips = Object.values(PLANOS_EXEMPLO)
      .map(
        (q) => `<button type="button" class="plano-chip${q.num === p.num ? " is-sel" : ""}${quandoRoda(q.num).length ? "" : " is-fora"}" data-plano-ver="${q.num}" data-num="${q.num}" aria-pressed="${q.num === p.num}"
            title="Plano ${q.num} · ${q.desc}${q.num === emCurso.num ? " (em curso)" : ""}" aria-label="Plano ${q.num}, ${q.desc}">${q.num}${q.num === emCurso.num ? '<span class="plano-chip-agora"></span>' : ""}</button>`
      )
      .join("");
    // Lista no topo: troca de plano sem depender de descer até os chips.
    const opcoes = Object.values(PLANOS_EXEMPLO)
      .map(
        (q) =>
          `<option value="${q.num}"${q.num === p.num ? " selected" : ""}>Plano ${q.num} · ${q.desc}${q.num === emCurso.num ? " (em curso)" : quandoRoda(q.num).length ? "" : " (fora da tabela)"}</option>`
      )
      .join("");
    const semana = ORDEM_SEMANA.map(
      (d) => `<div class="plano-semana-linha${d === hoje() ? " is-hoje" : ""}">
          <span class="plano-semana-dia">${DIAS[d]}${d === hoje() ? "<small>hoje</small>" : ""}</span>
          ${barraDia(d, { sel: p.num, modal: true })}
        </div>`
    ).join("");
    const ou = (v) => (v ? forte(v) : "<em>Nenhum</em>");

    modalEl().innerHTML = `
      <div class="config-modal plano-modal" role="dialog" aria-modal="true" aria-labelledby="planoModalTitulo">
        <div class="config-modal-header">
          <div class="plano-modal-titulo"><strong id="planoModalTitulo">Planos</strong><span>${eq.nome} · ${eq.id}</span></div>
          <button type="button" class="widget-icon-btn" data-plano-fechar title="Fechar (Esc)" aria-label="Fechar">${ICONS.x}</button>
        </div>
        <div class="config-modal-body plano-modal-corpo">
          <section class="plano-detalhe">
            <!-- Ordem de leitura de quem programa semáforo: qual plano → tempos (ciclo, estágios,
                 defasagem) → diagrama → coordenação com os vizinhos → quando roda (agenda, no fim).
                 HIPÓTESE: validar com engenheiro de tráfego do cliente. -->
            <!-- sem título nem rótulos: a lista já diz qual plano é e o selo diz se está rodando -->
            <div class="plano-id">
              <select class="plano-nav-select" data-plano-select aria-label="Escolher plano">${opcoes}</select>
              ${seloPlano(ehEmCurso, eq.online)}
            </div>
            <div>
              <h5 class="plano-modal-h">Tempos</h5>
              <div class="sel-campos plano-config-campos">
                ${campo("Ciclo", aoVivo ? forte("—", "js-plano-ciclo") : forte(`${p.ciclo}s`))}
                ${campo("Defasagem", forte(`${p.def}s`))}
                ${campo("Entreverdes", forte(`${ENTREVERDES}s por troca`))}
                ${campo("Estrutura", forte(p.estrutura))}
              </div>
              <!-- em cartões que quebram linha: com muitos estágios cresce pra baixo sem empurrar os campos -->
              <div class="plano-estagios">${p.est.map((d, i) => `<div class="plano-estagio"><span>E${i + 1}</span><strong>${d}s</strong></div>`).join("")}</div>
            </div>
            <div>
              <h5 class="plano-modal-h">Diagrama do ciclo</h5>
              ${diagramaMarkup(p, aoVivo, 752, 22)}
              ${legendaMarkup()}
            </div>
            <div>
              <h5 class="plano-modal-h">Coordenação</h5>
              <div class="sel-campos plano-config-campos">
                ${campo("Modo de operação", forte(p.modo))}
                ${campo("Derivativo subárea", ou(p.derivSubarea))}
                ${campo("Derivativo local", ou(p.derivLocal))}
                ${
                  // leituras do controlador: só existem para o plano que está rodando agora
                  ehEmCurso
                    ? campo("Seleção", aoVivo ? forte(OPERACAO_EXEMPLO.selecao) : "<em>Sem leitura</em>") +
                      campo("Requisitado", aoVivo ? forte(OPERACAO_EXEMPLO.requisitado) : "<em>Sem leitura</em>")
                    : ""
                }
              </div>
            </div>
          </section>

          <section class="plano-quando">
            <h5 class="plano-modal-h">Quando roda</h5>
            ${
              quandoRoda(p.num).length
                ? `<div class="plano-quando-lista">${quandoRoda(p.num).map((q) => `<span>${q.dias}</span><strong>${q.horarios}</strong>`).join("")}</div>`
                : '<p class="plano-quando-fora">Fora da tabela horária — não roda sozinho em nenhum dia (só por imposição?)</p>'
            }
            <div class="plano-semana">
              ${semana}
              <div class="plano-semana-linha is-eixo"><span class="plano-semana-dia"></span>${horasMarkup([0, 3, 6, 9, 12, 15, 18, 21, 24])}</div>
            </div>
            <h5 class="plano-modal-h plano-outros-h">Outros planos</h5>
            <div class="plano-chips" role="group" aria-label="Escolher plano para ver">${chips}</div>
          </section>
        </div>
        <div class="config-modal-actions plano-modal-acoes">
          <button type="button" class="btn-secondary" data-plano-fechar>Fechar</button>
        </div>
      </div>`;
  }

  // Relógio da aba Plano e do modal: move cursor, "agora" e campos ao vivo sem refazer o HTML.
  // Se o horário cruza uma troca de plano, redesenha (o plano em curso mudou).
  let faixaVista = null;
  setInterval(() => {
    const faixa = faixaAgora();
    if (faixaVista && faixa !== faixaVista) {
      faixaVista = faixa;
      if (document.getElementById("planoAba")) redesenhar();
      renderModal();
      return;
    }
    faixaVista = faixa;
    const pos = `${(segDoDia() / 86400) * 100}%`;
    document.querySelectorAll(".plano-agora").forEach((a) => (a.style.left = pos));
    const p = PLANOS_EXEMPLO[faixa[2]];
    const t = posNoCiclo(p);
    document.querySelectorAll(".plano-diag-cursor").forEach((c) => {
      const xc = DL + (t / p.ciclo) * (Number(c.dataset.w) - DL - DR);
      c.setAttribute("x1", xc);
      c.setAttribute("x2", xc);
    });
    document.querySelectorAll(".js-plano-ciclo").forEach((e) => (e.textContent = `${Math.floor(t)}/${p.ciclo}s`));
    document.querySelectorAll(".js-plano-estagio").forEach((e) => (e.textContent = estagioNoCiclo(p, t)));
  }, 250);

  document.addEventListener("click", (e) => {
    const abrir = e.target.closest("[data-plano-abrir]");
    if (abrir) {
      const sel = CockpitMap.getSelecao();
      if (sel && sel.tipo === "equipamento") abrirModal(sel.id, Number(abrir.dataset.planoAbrir) || null);
      return;
    }
    const ver = e.target.closest("[data-plano-ver]");
    if (ver && planoModal) {
      planoModal.num = Number(ver.dataset.planoVer);
      renderModal();
      return;
    }
    if (e.target.closest("[data-plano-fechar]") || e.target.id === "planoModal") fecharModal();
  });
  document.addEventListener("change", (e) => {
    if (!planoModal || !e.target.matches("[data-plano-select]")) return;
    planoModal.num = Number(e.target.value);
    renderModal();
    modalEl().querySelector("[data-plano-select]")?.focus(); // o render refaz o HTML; devolve o foco
  });
  // Com 16 planos não dá pra achar "onde mais esse plano roda" de olho: o hover acende todos os
  // blocos (e o botão) do mesmo número.
  function destacar(num) {
    document.querySelectorAll("#planoModal [data-num]").forEach((b) => b.classList.toggle("is-hover", num != null && b.dataset.num === num));
  }
  document.addEventListener("mouseover", (e) => {
    const alvo = e.target.closest?.("#planoModal [data-num]");
    destacar(alvo ? alvo.dataset.num : null);
  });

  // Esc fecha só o modal; stopImmediatePropagation evita que o Esc do painel (painel-selecao.js,
  // registrado depois) feche também o painel do controlador.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !planoModal) return;
    e.stopImmediatePropagation();
    fecharModal();
  });

  /* ---------- API ---------- */

  function dados(eq, aba) {
    if (aba === "plano") return planoMarkup(eq);
    if (aba === "alertas") return alertasMarkup(eq);
    if (aba === "comandos") return comandosMarkup(eq);
    if (aba === "grupos") return gruposMarkup(eq);
    // carregarEndereco(eq) fica pausado — Endereço saiu da Geral por ora, sem uso pra buscar.
    carregarGrupos(eq.id); // pro atalho "Ver croqui cadastrado" no final da Geral
    return geralMarkup(eq);
  }

  document.addEventListener("click", (e) => {
    const botao = e.target.closest("[data-sel-cmd]");
    if (botao) enviarComando(botao);
    const secao = e.target.closest("[data-sel-secao]");
    if (secao) {
      const id = secao.dataset.selSecao;
      if (secoesFechadas.has(id)) secoesFechadas.delete(id);
      else secoesFechadas.add(id);
      redesenhar();
    }
    const res = e.target.closest("[data-sel-res]");
    if (res) {
      const sel = CockpitMap.getSelecao();
      if (sel && sel.tipo === "equipamento") {
        if (res.dataset.selRes === "fechar") {
          aberto.delete(sel.id); // esconde; a resposta continua guardada e a seta a reabre
          redesenhar();
        } else if (res.dataset.selRes === "alternar") {
          if (aberto.get(sel.id) === res.dataset.cmd) aberto.delete(sel.id);
          else aberto.set(sel.id, res.dataset.cmd);
          redesenhar();
          mostrarResultado();
        } else if (res.dataset.selRes === "baixar") {
          const r = resultadoGuardado(sel.id, aberto.get(sel.id));
          if (r && r.aoBaixar) r.aoBaixar();
        }
      }
    }
    if (e.target.closest('[data-sel-acao="recarregar-grupos"]')) {
      const sel = CockpitMap.getSelecao();
      if (sel && sel.tipo === "equipamento") {
        cacheGrupos.delete(sel.id);
        carregarGrupos(sel.id);
        redesenhar();
      }
    }
  });

  // secaoMarkup e campo também servem o painel da área (painel-selecao.js), no mesmo visual da Geral
  return { abas, dados, carregarGrupos, statusTag, rodapeMarkup, secaoMarkup, campo };
})();
