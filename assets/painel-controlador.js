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
    return `<div class="sel-campos is-esq-larga">
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
    return `<div class="sel-campos is-esq-larga">
      ${campo("Porta do equipamento", `<strong>${OPERACAO_EXEMPLO.portaEquipamento}</strong>`)}
      ${campo("Programação", `<strong>${OPERACAO_EXEMPLO.programacao}</strong>`)}
      ${campo("Horário do equipamento", `<strong>${fmtHora(equipamento)}</strong>`)}
      ${campo("Horário do servidor", `<strong>${fmtHora(agora)}</strong>`)}
    </div>`;
  }

  // Subárea de cadastro (mesmo dado de "Endereço", não repete lá) + o que é
  // seleção operacional do plano (Subárea lógica, Seleção, Status) + o modo do plano em curso
  // (pedido do Guery: fica aqui na Geral, não na aba Plano; no modal de planos continua por plano).
  function modoOperacaoMarkup(eq) {
    const sub = eq.subareaId ? nomeSubarea(eq.subareaId) : null;
    // Sem o código ("SA06 - "), como na lista de Subáreas; o nome oficial completo fica no title.
    return `<div class="sel-campos is-esq-larga">
      ${campo("Modo", `<strong>${PLANOS_EXEMPLO[faixaAgora()[2]].modo}</strong>`, true)}
      ${campo("Subárea do sistema", `<strong class="sel-uma-linha" title="${sub || "Fora de subárea"}">${sub ? nomeSemCodigo(sub) : "Fora de subárea"}</strong>`)}
      ${campo("Subárea lógica", `<strong>${OPERACAO_EXEMPLO.subareaLogica}</strong>`)}
      ${campo("Seleção", `<strong>${OPERACAO_EXEMPLO.selecao}</strong>`)}
      ${campo("Status", `<strong>${LiveState.ROTULOS_STATUS[LiveState.statusDoControlador(eq.id)]}</strong>`)}
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
    return `<div class="sel-campos is-esq-larga">
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
      // Nomes pela faixa do dia (a ficha real só tem o número). Tempos no molde da ficha do 205
      // (Av. Batel x R. Francisco Rocha, DP40-8F, UOT-CTA 03/07/2023): 4 estágios — E1 e E2
      // veiculares, E3 e E4 curtos de pedestre atuado — com ciclo e defasagem da ficha. Os
      // estágios foram acertados para fechar o ciclo no modelo simplificado do protótipo
      // (ciclo = soma dos estágios + 5 s de entreverdes por troca); a ficha real tem transições
      // diferentes por troca.
      [1, "Manhã cedo", [26, 22, 6, 6], 72],
      [2, "Pico manhã", [30, 28, 6, 6], 75],
      [3, "Fim da noite", [16, 12, 6, 6], 5],
      [4, "Entrepico", [32, 26, 6, 6], 78],
      [5, "Noite", [27, 21, 6, 6], 70],
      // Plano 6 = CASO REAL (print do Plano Registrado, controlador 180301 Sete de Setembro x
      // Alferes Poli, 25/09): estágios 16/17/21/14, defasagem 18, ciclo 90, 6 grupos (estrutura 3).
      [6, "Pico tarde", [16, 17, 21, 14], 18, 90],
      [7, "Madrugada", [27, 23], 0],
      [8, "Sáb fim da noite", [16, 12, 6, 6], 5],
      [9, "Sáb manhã cedo", [28, 20, 6, 6], 72],
      [10, "Sáb noite", [27, 21, 6, 6], 70],
      [11, "Sáb dia", [31, 27, 6, 6], 73],
      [12, "Sáb tarde", [30, 28, 6, 6], 73],
      [13, "Dom manhã", [26, 22, 6, 6], 73],
      [14, "Dom dia", [30, 28, 6, 6], 66],
      [15, "Dom noite", [27, 21, 6, 6], 70],
      [16, "Dom fim da noite", [16, 12, 6, 6], 6],
    ].map(([num, desc, est, def, ciclo]) => [num, { num, desc, est, def, ciclo, estrutura: num === 6 ? 3 : est.length === 4 ? 1 : 2, modo: "Tempo fixo com sincronismo", derivSubarea: null, derivLocal: null }])
  );
  // Plano 7 (madrugada) roda a estrutura 2 da ficha: só 2 estágios, pedestre atuado apagado.
  // Entreverdes lido do print (HIPÓTESE): 5 s = 4 s de amarelo + 1 s de vermelho geral no veicular.
  const ENTREVERDES = 5, AMARELO = 4;
  // Ciclo: o da ficha/tela quando existe (caso real); senão soma dos estágios + 5 s por troca.
  // `ev` = entreverdes por troca que fecha o ciclo (no caso real: (90 − 68) / 4 = 5,5 s).
  Object.values(PLANOS_EXEMPLO).forEach((p) => {
    const soma = p.est.reduce((a, b) => a + b, 0);
    p.ciclo = p.ciclo || soma + ENTREVERDES * p.est.length;
    p.ev = (p.ciclo - soma) / p.est.length;
  });
  // Horários dos planos no mesmo formato do Programador DP40 (tela de horários): cada linha diz
  // qual plano roda, em quais dias da semana (0 = Dom … 6 = Sáb), de que horas até que horas.
  // A configuração do plano (estrutura, defasagem, estágios…) fica separada, em PLANOS_EXEMPLO.
  // A grade da semana (TABELA_SEMANA) é só derivada disto. Exemplo inventado; o que o cadastro
  // real faz com buraco (horário sem plano), sobreposição e horário que vira a meia-noite ainda
  // é pendência — aqui as linhas cobrem o dia inteiro, sem sobrepor.
  // Tabela horária REAL de um controlador da SA01 - Batel (fichas de programação UOT-CTA,
  // 03/07/2023). Cada controlador tem a sua tabela; nos cruzamentos conferidos (172, 212, 421,
  // 423, 430) ela coincide por serem coordenados. A tabela quase não é editada: o que a operação
  // muda no dia a dia é o ajuste de tempos no ciclo (Plano Registrado, "Ajustar tempos"). A ficha só tem o INÍCIO: o fim é o início do plano seguinte (resolve a pendência de
  // 23/09 "fim digitado ou calculado"). Três tipos de dia: Seg a Sex, Sáb, Dom.
  const SEG_SEX = [1, 2, 3, 4, 5], SAB = [6], DOM = [0], TODOS = [0, 1, 2, 3, 4, 5, 6];
  const INICIOS_PLANOS = [
    { plano: 7, dias: TODOS, inicio: "00:00" },
    { plano: 1, dias: SEG_SEX, inicio: "06:00" },
    { plano: 2, dias: SEG_SEX, inicio: "07:00" },
    { plano: 4, dias: SEG_SEX, inicio: "09:00" },
    { plano: 6, dias: SEG_SEX, inicio: "16:00" },
    { plano: 5, dias: SEG_SEX, inicio: "20:00" },
    { plano: 3, dias: SEG_SEX, inicio: "23:00" },
    { plano: 9, dias: SAB, inicio: "06:00" },
    { plano: 11, dias: SAB, inicio: "07:00" },
    { plano: 12, dias: SAB, inicio: "16:00" },
    { plano: 10, dias: SAB, inicio: "20:00" },
    { plano: 8, dias: SAB, inicio: "23:00" },
    { plano: 13, dias: DOM, inicio: "06:00" },
    { plano: 14, dias: DOM, inicio: "11:00" },
    { plano: 15, dias: DOM, inicio: "20:00" },
    { plano: 16, dias: DOM, inicio: "23:00" },
  ];
  // Mesmo formato de antes ({ plano, dias, inicio, fim }): fim = próximo início do mesmo dia.
  const HORARIOS_PLANOS = INICIOS_PLANOS.flatMap((h) =>
    h.dias.map((d) => {
      const seguintes = INICIOS_PLANOS.filter((x) => x.dias.includes(d) && x.inicio > h.inicio).map((x) => x.inicio).sort();
      return { plano: h.plano, dias: [d], inicio: h.inicio, fim: seguintes[0] || "24:00" };
    })
  );
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
  // Estrutura = quais grupos ficam verdes em cada estágio, lida da ficha do 205 (HIPÓTESE sobre
  // detalhes: a ficha tem sequência atuada que o protótipo simplifica). `verde`: índices dos
  // estágios em que o grupo está verde.
  // Estrutura 1 (4 estágios): E1 via principal (G1) + pedestre G3; E2 transversal (G2); E3 e E4
  // curtos, de pedestre atuado (G4 no E3; G2 volta no E4).
  // Estrutura 2 (2 estágios, plano da madrugada): G1 no E1, G2 no E2; pedestres sem atuação.
  const ESTRUTURAS = {
    // Estrutura 3 = CASO REAL (print do Plano Registrado do 180301, 25/09), lida do diagrama:
    // G1 veic verde E1+E2; G2 veic E1; G3 veic E2; G4 veic E3; G5 pedestre E4→E1→E2 (vermelho
    // piscante antes do E3); G6 pedestre E4 (piscante no fim).
    3: [
      { id: "G1", tipo: "veic", verde: [0, 1] },
      { id: "G2", tipo: "veic", verde: [0] },
      { id: "G3", tipo: "veic", verde: [1] },
      { id: "G4", tipo: "veic", verde: [2] },
      { id: "G5", tipo: "ped", verde: [3, 0, 1] },
      { id: "G6", tipo: "ped", verde: [3] },
    ],
    1: [
      { id: "G1", tipo: "veic", verde: [0] },
      { id: "G2", tipo: "veic", verde: [1, 3] },
      { id: "G3", tipo: "ped", verde: [0, 2] },
      { id: "G4", tipo: "ped", verde: [2] },
    ],
    2: [
      { id: "G1", tipo: "veic", verde: [0] },
      { id: "G2", tipo: "veic", verde: [1] },
      { id: "G3", tipo: "ped", verde: [0] },
      { id: "G4", tipo: "ped", verde: [1] },
    ],
  };
  const gruposDo = (p) => ESTRUTURAS[p.estrutura] || ESTRUTURAS[1];

  let planoModal = null; // { eqId, num, aba, ajuste } — modal "Planos do controlador" aberto, e em qual plano

  // ---------- Ajuste de tempos ("Plano Registrado" do sistema atual) ----------
  // Ação que a operação usa bastante (relato do Guery, 25/09, print do Antares): mover alguns
  // segundos de um estágio para outro SEM mudar o ciclo — ex.: segurar o vermelho de uma
  // aproximação por causa de um acidente. Aqui é simulado: nada vai para o controlador.
  // HIPÓTESES NÃO VALIDADAS (ver Programação/02 - aba-plano-notas.md):
  // - o ajuste só vale para o plano EM CURSO (no legado: "Comando - Plano Atual");
  // - é temporário: vale até a próxima troca de plano pela tabela horária (ou é persistente?);
  // - estágio não pode ficar abaixo do VMIN dele (verde mínimo da ficha de programação);
  // - execução "Imediata" (o legado tem um select de Execução; outras opções não levantadas).
  // VMIN = verde mínimo de cada estágio, como na linha "VMIN" da ficha de programação (SA01 Batel,
  // UOT-CTA 03/07/2023): 4 estágios → 12, 12, 5 e 5 s (ficha 205; E3/E4 são pedestre atuado);
  // 2 estágios → 12 e 12 s (fichas 212, 423, 430). Plano pode trazer o seu em `vmin`.
  const vminDe = (p) => p.vmin || (p.est.length === 4 ? [12, 12, 5, 5] : p.est.map(() => 12));
  const AJUSTES = new Map(); // "eqId|plano" -> { est: [...], hora: "HH:MM" }
  function planoEfetivo(eqId, num) {
    const base = PLANOS_EXEMPLO[num];
    const aj = eqId != null && AJUSTES.get(`${eqId}|${num}`);
    return aj ? { ...base, est: aj.est, ajustado: aj } : base;
  }

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
      out.push({ ini: t, fim: t + (p.ev ?? ENTREVERDES), verde: false, i });
      t += p.ev ?? ENTREVERDES;
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
  // "09:00–12:00" a partir de 2h30; "14h–16h" a partir de 1h45 (menos que isso não cabe); abaixo, só o número.
  function horarioNoBloco([ini, fim, num]) {
    const dur = fim - ini;
    if (dur >= 150) return `${hm(ini)}–${hm(fim)}`;
    const curto = (min) => `${Math.floor(min / 60)}h${min % 60 ? pad(min % 60) : ""}`;
    if (dur >= 105) return `${curto(ini)}–${curto(fim)}`;
    return dur >= 28 ? num : "";
  }
  function barraDia(d, { sel = null, modal = false } = {}) {
    const ehHoje = d === hoje();
    const faixaAtual = faixaAgora();
    const blocos = TABELA_SEMANA[d].map((f) => {
      const p = PLANOS_EXEMPLO[f[2]], larg = ((f[1] - f[0]) / 1440) * 100;
      const marcado = sel ? f[2] === sel : ehHoje && f === faixaAtual;
      // só o número cabe num bloco de meia hora; o nome vem no title e no detalhe.
      // No modal, o plano escolhido mostra o horário dentro do bloco (feedback da operação: só o
      // número não dizia quando ele roda); o formato encurta conforme o bloco cabe.
      const texto = modal && marcado ? horarioNoBloco(f) : larg >= 1.9 ? p.num : "";
      return `<button type="button" class="plano-bloco${marcado ? " is-sel" : ""}" style="width:${larg}%" data-num="${p.num}"
        ${modal ? `data-plano-ver="${p.num}"` : `data-plano-abrir="${p.num}"`} title="${DIAS[d]} ${hm(f[0])}–${hm(f[1])} · Plano ${p.num} · ${p.desc}" aria-label="${DIAS[d]}, das ${hm(f[0])} às ${hm(f[1])}: Plano ${p.num}, ${p.desc}">${texto}</button>`;
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
    const p = planoEfetivo(eq.id, faixa[2]);
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

  // De cima pra baixo: plano → tempos → diagrama → coordenação → quando roda (chips com "+" e semana).
  // Sem botão Salvar de propósito: nada aqui envia comando.
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
  // Atalho do botão direito no mapa: abre o modal SÓ com o ajuste de tempos do plano em curso
  // (sem lista, abas nem coordenação). "Ver plano completo" volta ao modal inteiro.
  function abrirAjuste(eqId) {
    const eq = LiveState.equipamentoPorId(eqId);
    if (!eq) return;
    if (!eq.online) return toast("Controlador offline: o ajuste de tempos não chegaria até ele.");
    const num = faixaAgora()[2];
    const p = planoEfetivo(eqId, num);
    planoModal = { eqId, num, aba: "dados", soAjuste: true, ajuste: { est: [...p.est], base: [...p.est] } };
    renderModal();
    modalEl().classList.add("is-open");
  }
  function fecharModal() {
    planoModal = null;
    const el = document.getElementById("planoModal");
    if (el) {
      el.classList.remove("is-open");
      el.innerHTML = "";
    }
  }
  // Estágios: cartões só de leitura + "Ajustar tempos"; em edição, um passo −/+ por estágio e o
  // saldo (tirou de um, tem que pôr em outro: o ciclo não muda).
  function estagiosMarkup(eq, p, ehEmCurso) {
    const ed = planoModal.ajuste;
    if (!ed) {
      const pode = ehEmCurso && eq.online;
      const motivo = !ehEmCurso ? "Só o plano em curso pode ser ajustado" : !eq.online ? "Controlador offline" : "";
      return `<div>
          <div class="plano-h-linha">
            <h5 class="plano-modal-h">Estágios</h5>
            <button type="button" class="btn-secondary plano-ajustar-btn" data-ajuste="abrir" ${pode ? "" : `disabled title="${motivo}"`}>Ajustar tempos</button>
          </div>
          <div class="plano-estagios">${p.est.map((d, i) => `<div class="plano-estagio"><span>E${i + 1}</span><strong>${d}s</strong></div>`).join("")}</div>
          ${p.ajustado ? `<p class="plano-ajuste-nota">Ajustado às ${p.ajustado.hora} · antes: ${PLANOS_EXEMPLO[p.num].est.map((d, i) => `E${i + 1} ${d}s`).join(", ")} <button type="button" class="btn-text" data-ajuste="voltar">Desfazer</button></p>` : ""}
        </div>`;
    }
    const vmin = vminDe(p);
    const soma = ed.est.reduce((a, b) => a + b, 0);
    const saldo = soma - ed.base.reduce((a, b) => a + b, 0);
    const linhas = ed.est.map((d, i) => {
      const dif = d - ed.base[i];
      const noMinimo = d - 1 < vmin[i];
      return `<div class="ajuste-linha${noMinimo ? " is-no-minimo" : ""}">
          <span class="ajuste-est">E${i + 1}</span>
          <span class="ajuste-antes">${ed.base[i]}s</span>
          <span class="ajuste-min">${vmin[i]}s</span>
          <div class="ajuste-passo">
            <button type="button" data-ajuste="menos" data-i="${i}" ${noMinimo ? `disabled title="E${i + 1} já está no verde mínimo (VMIN ${vmin[i]}s)"` : ""} aria-label="Tirar 1 segundo do E${i + 1}">−</button>
            <strong>${d}s</strong>
            <button type="button" data-ajuste="mais" data-i="${i}" aria-label="Pôr 1 segundo no E${i + 1}">+</button>
          </div>
          <span class="ajuste-dif${dif > 0 ? " is-mais" : dif < 0 ? " is-menos" : ""}">${dif > 0 ? `+${dif}s` : dif < 0 ? `${dif}s` : ""}</span>
        </div>`;
    }).join("");
    const mudou = ed.est.some((d, i) => d !== ed.base[i]);
    // Ciclo antes x depois, lado a lado e em barras de mesma escala: a regra do ajuste é que os
    // dois fiquem IGUAIS (ciclo = soma dos estágios + entreverdes).
    const cicloDepois = soma + p.ev * ed.est.length; // mesmas trocas: só os verdes mudam
    const iguais = cicloDepois === p.ciclo;
    const escala = Math.max(p.ciclo, cicloDepois);
    const barra = (est, rotulo, total) => `<div class="ciclo-barra-linha">
        <span class="ciclo-barra-rot">${rotulo}</span>
        <div class="ciclo-barra-trilho">
          <div class="ciclo-barra" style="width:${(total / escala) * 100}%">
            ${est.map((d, i) => `<span class="ciclo-seg" style="flex:${d}"><b>E${i + 1}</b> ${d}s</span><span class="ciclo-ev" style="flex:${p.ev}" title="Entreverdes ${+p.ev.toFixed(1)}s"></span>`).join("")}
          </div>
          <span class="ciclo-marca" style="left:${(p.ciclo / escala) * 100}%" title="Ciclo registrado: ${p.ciclo}s"></span>
        </div>
        <strong class="ciclo-barra-total">${total}s</strong>
      </div>`;
    const comparacao = `<div class="ciclo-comparar${iguais ? " is-igual" : " is-diferente"}">
        <div class="ciclo-num"><span>Ciclo atual</span><strong>${p.ciclo}s</strong></div>
        <div class="ciclo-sinal" aria-hidden="true">${iguais ? "=" : "≠"}</div>
        <div class="ciclo-num"><span>Com o ajuste</span><strong>${cicloDepois}s</strong></div>
        <div class="ciclo-status">${iguais ? "Ciclo mantido" : saldo > 0 ? `Sobram ${saldo}s` : `Faltam ${-saldo}s`}</div>
      </div>
      <div class="ciclo-barras">
        ${barra(ed.base, "Antes", p.ciclo)}
        ${barra(ed.est, "Depois", cicloDepois)}
      </div>`;
    return `<div class="ajuste-caixa">
        <div class="plano-h-linha"><h5 class="plano-modal-h">Ajustar tempos · Plano ${p.num}</h5><span class="ajuste-exec">Ciclo ${p.ciclo}s · Defasagem ${p.def}s · Execução: Imediata</span></div>
        <p class="ajuste-ajuda">Passe segundos de um estágio para outro. O ciclo tem que continuar igual.</p>
        ${comparacao}
        <div class="ajuste-cab"><span>Estágio</span><span>Atual</span><span>Mínimo</span><span>Novo</span><span></span></div>
        ${linhas}
        <div class="ajuste-rodape">
          <span class="ajuste-saldo-vazio"></span>
          <div class="ajuste-botoes">
            <button type="button" class="btn-secondary" data-ajuste="cancelar">Cancelar</button>
            <button type="button" class="btn-primary" data-ajuste="enviar" ${saldo === 0 && mudou ? "" : "disabled"}>Enviar ajuste</button>
          </div>
        </div>
        <!-- A confirmar com a operação (não vai para a tela): vale só até a próxima troca de plano ou
             fica gravado? Quem pode fazer? Fica registrado quem enviou? -->
      </div>`;
  }

  function acaoAjuste(btn) {
    const acao = btn.dataset.ajuste;
    const eqId = planoModal.eqId;
    const p = planoEfetivo(eqId, planoModal.num);
    if (acao === "completo") {
      planoModal.soAjuste = false;
      planoModal.ajuste = null;
      return renderModal();
    }
    if (planoModal.soAjuste && acao === "cancelar") return fecharModal();
    if (acao === "abrir") planoModal.ajuste = { est: [...p.est], base: [...p.est] };
    else if (acao === "cancelar") planoModal.ajuste = null;
    else if (acao === "mais" || acao === "menos") {
      const i = Number(btn.dataset.i);
      planoModal.ajuste.est[i] = Math.max(vminDe(p)[i], planoModal.ajuste.est[i] + (acao === "mais" ? 1 : -1));
    } else if (acao === "enviar") {
      const d = new Date();
      AJUSTES.set(`${eqId}|${p.num}`, { est: [...planoModal.ajuste.est], hora: `${pad(d.getHours())}:${pad(d.getMinutes())}` });
      planoModal.ajuste = null;
      toast(`Plano ${p.num}: ajuste de tempos enviado (simulado).`);
      redesenhar();
      if (planoModal.soAjuste) return fecharModal();
    } else if (acao === "voltar") {
      AJUSTES.delete(`${eqId}|${p.num}`);
      toast(`Plano ${p.num}: voltou aos tempos registrados (simulado).`);
      redesenhar();
    }
    renderModal();
  }

  function renderModal() {
    if (!planoModal) return;
    const eq = LiveState.equipamentoPorId(planoModal.eqId);
    if (!eq) return fecharModal();
    const emCurso = PLANOS_EXEMPLO[faixaAgora()[2]];
    const p = planoEfetivo(eq.id, planoModal.num);
    const ehEmCurso = p.num === emCurso.num;
    const aoVivo = ehEmCurso && eq.online;

    const ou = (v) => (v ? forte(v) : "<em>Nenhum</em>");
    const aba = planoModal.aba || "dados";
    // Menu lateral de planos (pedido do Guery, 25/09): fica à esquerda nas duas abas e substitui a
    // lista suspensa + os quadradinhos. Cada lado do modal rola sozinho.
    const itensLista = Object.values(PLANOS_EXEMPLO).map((q) => {
      const fora = !quandoRoda(q.num).length;
      const agora = q.num === emCurso.num;
      return `<button type="button" class="plano-lista-item${q.num === p.num ? " is-sel" : ""}" data-plano-ver="${q.num}" data-num="${q.num}" aria-current="${q.num === p.num}">
          <span class="plano-lista-num">${q.num}</span>
          <span class="plano-lista-txt" title="${q.desc}${fora ? " · fora da tabela horária" : ` · ciclo ${q.ciclo}s`}">${q.desc}</span>
          ${agora ? `<i class="plano-lista-agora" title="${eq.online ? "Em curso" : "Previsto agora"}"></i>` : ""}
          <small class="plano-lista-meta">${fora ? "fora" : `${q.ciclo}s`}</small>
        </button>`;
    }).join("");
    const listaLateral = `
          <aside class="plano-lista" aria-label="Planos do controlador">
            <div class="plano-lista-h">Planos <span>${Object.keys(PLANOS_EXEMPLO).length}</span></div>
            <div class="plano-lista-itens">${itensLista}</div>
            <button type="button" class="plano-lista-novo" data-plano-novo>+ Novo plano</button>
          </aside>`;
    const rolagemAntes = GradeHorarios.lerRolagem(modalEl());
    // Conteúdo da aba "Dados do plano". Ordem: resumo dos tempos → estágios → coordenação com os
    // vizinhos → diagrama (no fim, pedido do Guery 25/09). HIPÓTESE: validar a ordem com engenheiro de tráfego do cliente.
    const kpi = (rotulo, valor, cls = "") => `<div class="plano-kpi"><span>${rotulo}</span><strong${cls ? ` class="${cls}"` : ""}>${valor}</strong></div>`;
    const abaDados = `
            <div class="plano-kpis">
              ${kpi("Ciclo", aoVivo ? "—" : `${p.ciclo}s`, aoVivo ? "js-plano-ciclo" : "")}
              ${kpi("Defasagem", `${p.def}s`)}
              ${kpi("Entreverdes", `${+p.ev.toFixed(1)}s`)}
              ${kpi("Estrutura", p.estrutura)}
            </div>
            ${estagiosMarkup(eq, p, ehEmCurso)}
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
            <div>
              <h5 class="plano-modal-h">Diagrama do ciclo</h5>
              ${diagramaMarkup(planoModal.ajuste ? { ...p, est: planoModal.ajuste.est } : p, aoVivo && !planoModal.ajuste, 700, 22)}
              ${planoModal.ajuste ? '<p class="plano-ajuste-previa">Prévia do ajuste</p>' : ""}
              ${legendaMarkup()}
            </div>`;
    // Conteúdo da aba "Planos e horários": a tabela horária inteira (grade-horarios.js), com o
    // plano escolhido na lista em destaque. Clicar num bloco também escolhe o plano.
    const abaHorarios = `
            ${GradeHorarios.markup(agenda(), { enxuta: true, caber: true, verTodos: true, attrSel: "data-plano-abrir-dados" })}`;

    if (planoModal.soAjuste) {
      modalEl().innerHTML = `
      <div class="config-modal plano-modal plano-modal-ajuste" role="dialog" aria-modal="true" aria-labelledby="planoModalTitulo">
        <div class="config-modal-header">
          <div class="plano-modal-titulo"><strong id="planoModalTitulo">Ajustar tempos · Plano ${p.num} · ${p.desc}</strong><span>${eq.nome} · ${eq.id}</span></div>
          <button type="button" class="widget-icon-btn" data-plano-fechar title="Fechar (Esc)" aria-label="Fechar">${ICONS.x}</button>
        </div>
        <div class="config-modal-body plano-ajuste-corpo">
          ${estagiosMarkup(eq, p, ehEmCurso)}
          <div>
            <h5 class="plano-modal-h">Diagrama do ciclo</h5>
            ${diagramaMarkup(planoModal.ajuste ? { ...p, est: planoModal.ajuste.est } : p, false, 700, 20)}
            ${legendaMarkup()}
          </div>
        </div>
        <div class="config-modal-actions plano-modal-acoes">
          <button type="button" class="btn-text lab-abrir" data-ajuste="completo">Ver plano completo</button>
          <button type="button" class="btn-secondary" data-plano-fechar>Fechar</button>
        </div>
      </div>`;
      return;
    }

    // Layout: menu lateral de planos à esquerda (só na aba Dados do plano) e, à direita, o plano
    // escolhido — título + selo, as abas e o conteúdo da aba, que rola sozinho. Na aba Planos e
    // horários a lista some e a grade ocupa a largura toda (clicar num bloco escolhe o plano).
    modalEl().innerHTML = `
      <div class="config-modal plano-modal" role="dialog" aria-modal="true" aria-labelledby="planoModalTitulo">
        <div class="config-modal-header">
          <div class="plano-modal-titulo"><strong id="planoModalTitulo">Planos</strong><span>${eq.nome} · ${eq.id}</span></div>
          <button type="button" class="widget-icon-btn" data-plano-fechar title="Fechar (Esc)" aria-label="Fechar">${ICONS.x}</button>
        </div>
        <div class="config-modal-body plano-modal-corpo">
          <!-- abas fixas no topo do modal (não mudam de lugar ao trocar de aba). duas abas: como UM plano roda (dados) x quando TODOS os planos rodam (horários) -->
          <div class="plano-abas plano-abas-topo" role="tablist">
            <button type="button" role="tab" class="plano-aba${aba === "dados" ? " is-ativa" : ""}" aria-selected="${aba === "dados"}" data-plano-aba="dados">Dados do plano</button>
            <button type="button" role="tab" class="plano-aba${aba === "horarios" ? " is-ativa" : ""}" aria-selected="${aba === "horarios"}" data-plano-aba="horarios">Planos e horários</button>
          </div>
          <!-- menu lateral de planos só na aba Dados; em Planos e horários a grade usa a largura toda -->
          <div class="plano-mestre${aba === "horarios" ? " sem-lista" : ""}">
            ${aba === "horarios" ? "" : listaLateral}
            <section class="plano-direita">
              ${aba === "horarios" ? "" : `<div class="plano-direita-topo">
                <strong class="plano-det-titulo">Plano ${p.num} · ${p.desc}</strong>
                ${seloPlano(ehEmCurso, eq.online)}
                ${p.ajustado ? `<span class="status-tag plano-tag-ajustado" title="Tempos ajustados às ${p.ajustado.hora} (simulado)">Ajustado às ${p.ajustado.hora}</span>` : ""}
              </div>`}
              <div class="plano-direita-corpo${aba === "horarios" ? " is-horarios" : ""}">${aba === "horarios" ? abaHorarios : abaDados}</div>
            </section>
          </div>
        </div>
        <div class="config-modal-actions plano-modal-acoes">
          <!-- EXPERIMENTO: abre o laboratório de modelos do "Quando roda" (lab-quando-roda.js) -->
          <button type="button" class="btn-text lab-abrir" data-lab-abrir="${p.num}">Modelos do "Quando roda" (teste)</button>
          <button type="button" class="btn-secondary" data-plano-fechar>Fechar</button>
        </div>
      </div>`;
    ajustarLarguraPlano();
    GradeHorarios.aplicarRolagem(modalEl(), rolagemAntes);
  }

  // Fallback de `field-sizing: content` (Safari/Firefox): a lista de plano fica da largura da
  // opção escolhida, como o "Ordenar" da lista de Subáreas.
  function ajustarLarguraPlano() {
    if (CSS.supports("field-sizing", "content")) return;
    const sel = modalEl().querySelector("[data-plano-select]");
    if (!sel) return;
    const medida = document.createElement("span");
    medida.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:${getComputedStyle(sel).font}`;
    medida.textContent = sel.options[sel.selectedIndex].text;
    document.body.appendChild(medida);
    sel.style.width = `${medida.offsetWidth + 24}px`;
    medida.remove();
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
    const aj = e.target.closest("[data-ajuste]");
    if (aj && planoModal) {
      acaoAjuste(aj);
      return;
    }
    const abrirDados = e.target.closest("[data-plano-abrir-dados]");
    if (abrirDados && planoModal) {
      planoModal.num = Number(abrirDados.dataset.planoAbrirDados);
      planoModal.aba = "dados";
      planoModal.ajuste = null;
      renderModal();
      return;
    }
    const abaBtn = e.target.closest("[data-plano-aba]");
    if (abaBtn && planoModal) {
      planoModal.aba = abaBtn.dataset.planoAba;
      renderModal();
      return;
    }
    const apagar = e.target.closest("[data-plano-apagar]");
    if (apagar && planoModal) {
      planoModal.apagarOutros = apagar.checked;
      renderModal();
      return;
    }
    const ver = e.target.closest("[data-plano-ver]");
    if (ver && planoModal) {
      planoModal.ajuste = null; // ajuste em edição é do plano que estava aberto
      planoModal.num = Number(ver.dataset.planoVer);
      renderModal();
      return;
    }
    // Cadastro de plano ainda não existe: o "+" só mostra onde ele vai entrar
    if (e.target.closest("[data-plano-novo]")) {
      if (typeof toast === "function") toast("Cadastro de novo plano ainda não disponível no protótipo");
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
  // lista para o submenu "Enviar comando" do botão direito no mapa (map.js)
  const listaComandos = () => COMANDOS.map((c) => ({ id: c.id, nome: c.nome, grupo: c.grupo || "consultar" }));

  // Dados da agenda para o laboratório de modelos (lab-quando-roda.js) — só leitura.
  const agenda = () => ({
    planos: PLANOS_EXEMPLO,
    horarios: HORARIOS_PLANOS,
    tabela: TABELA_SEMANA,
    dias: DIAS,
    ordem: ORDEM_SEMANA,
    emCurso: faixaAgora()[2],
  });

  return { abas, dados, carregarGrupos, statusTag, rodapeMarkup, secaoMarkup, campo, listaComandos, agenda, abrirAjuste };
})();
