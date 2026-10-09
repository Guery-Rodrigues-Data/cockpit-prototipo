/* ==========================================================================
   Cockpit — estado "ao vivo": cópia mutável dos dados mock que a simulação de
   tempo real altera (status de conexão indo/vindo, alertas abrindo/fechando).
   Widgets se inscrevem via LiveState.subscribe() pra re-renderizar quando algo
   muda — pub/sub simples, sem framework, suficiente pro protótipo.
   ========================================================================== */

const LiveState = (() => {
  let equipamentos = EQUIPAMENTOS.map((e) => ({ ...e }));
  let alertas = ALERTAS.map((a) => ({ ...a }));
  const subscribers = new Set();

  function notify() {
    subscribers.forEach((fn) => fn());
  }

  function subscribe(fn) {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  }

  function getEquipamentos() {
    return equipamentos;
  }
  function getAlertas() {
    return alertas;
  }
  function equipamentoPorId(id) {
    return equipamentos.find((e) => e.id === id) || null;
  }
  function alertasDoEquipamento(id) {
    return alertas.filter((a) => a.equipamentoId === id);
  }

  // MOCK — HIPÓTESE NÃO VALIDADA (regra confirmada pelo Guery em 29/09/2026: Operador se
  // `modoOperador`, senão Centro/Local pela seleção de plano; o dado real vem da tabela de
  // programação). Proporções da captura do legado: Local 47%, Centro 53%. Operador foi 0% na
  // captura; deixei ~1% só pra o destaque no mapa poder ser visto — NÃO é número de produção.
  // v3 (widget Notificações): controladores que entraram/saíram do modo Operador durante a simulação. Sobrepõe o modo
  // sorteado abaixo; vazio nas demais versões (a simulação de modo só roda quando a versão tem o widget).
  const modosSimulados = new Map();
  function modoDoControlador(id) {
    // Modo de controle (Operador/Local/Centro) só entra na v3: hoje só se sabe dos ALERTAS dos controladores. Antes disso, tudo é "centro" (neutro).
    if (typeof Versoes !== "undefined" && !Versoes.tem("modo-controle")) return "centro";
    if (modosSimulados.has(id)) return modosSimulados.get(id);
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    const n = h % 100;
    return n < 1 ? "operador" : n < 47 ? "local" : "centro";
  }

  // MOCK — HIPÓTESE NÃO VALIDADA: "Status" do modo de operação = estado dos grupos no controlador
  // (manual DP40A §10.6/§11.13): Cores (normal), Intermitente (piscante) ou Apagado. O JSON do legado
  // não traz esse campo; as proporções vêm do estado da captura de 29/09/2026 (Piscante ~4 e Apagado
  // 2 em 1.334, ou seja ~0,3% e ~0,15%), arredondadas pra aparecerem alguns pinos.
  const ROTULOS_STATUS = { cores: "Cores", intermitente: "Intermitente", apagado: "Apagado" };
  function statusDoControlador(id) {
    let h = 7;
    for (let i = 0; i < id.length; i++) h = (h * 37 + id.charCodeAt(i)) >>> 0;
    const n = h % 1000;
    return n < 4 ? "intermitente" : n < 6 ? "apagado" : "cores";
  }

  function horaAtualFmt() {
    const d = new Date();
    return (
      d.toLocaleDateString("pt-BR") +
      " " +
      d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    );
  }

  /* ---------- simulação de problemas nos controladores ----------
     Calibrada com a captura do legado (29/09/2026, 1.334 controladores): ~9% com problema
     (107 com alarme + 13 offline sem alarme = 120), dos quais ~14% offline (17 de 120) e o resto
     online com alarme. Por isso a faixa é proporcional ao total de controladores (8% a 10%), e não
     um número fixo — antes eram 25–40 fixos (24/09: 5–10; 29/09 o Guery pediu mais falhas).
     A cada tick um problema abre ou fecha, sem sair da faixa. Alertas fixos de data.js
     (id que não começa com ALR-LIVE) não são fechados pela simulação. */
  const PROBLEMAS_FRACAO_MIN = 0.08;
  const PROBLEMAS_FRACAO_MAX = 0.10;
  const PROPORCAO_OFFLINE = 0.14;
  // Alarmes online mais frequentes na captura (n = ocorrências), mapeados para o catálogo (alarmes.js):
  // lâmpada queimada domina (70 de 114). Peso = n; o que não está aqui quase nunca aparece.
  const ALARMES_PESOS = [
    ["lampadaQueimada", 70], ["detectorAvariado", 23], ["falhaGps", 6], ["portaAberta", 3],
    ["bateriaAusenteNobreak", 3], ["falhaNtp", 3], ["falhaUps", 2], ["grupoAvariado", 2], ["testeInterno", 1],
  ];
  const SEVERIDADE_DO_CATALOGO = { ALTO: "Alto", MEDIO: "Médio", BAIXO: "Baixo" };

  const ehControlador = (e) => e.tipo === "semaforo";
  const temProblema = (e) => !e.online || alertasDoEquipamento(e.id).length > 0;
  const controladoresComProblema = () => equipamentos.filter((e) => ehControlador(e) && temProblema(e));
  const sortear = (lista) => lista[Math.floor(Math.random() * lista.length)];
  function sortearAlarme() {
    let r = Math.random() * ALARMES_PESOS.reduce((t, [, w]) => t + w, 0);
    for (const [tipo, w] of ALARMES_PESOS) if ((r -= w) < 0) return tipo;
    return ALARMES_PESOS[0][0];
  }
  function faixaProblemas() {
    const n = equipamentos.filter(ehControlador).length;
    return { min: Math.round(n * PROBLEMAS_FRACAO_MIN), max: Math.round(n * PROBLEMAS_FRACAO_MAX) };
  }

  /* ---------- registro de eventos (widget Notificações, v3) ----------
     MOCK — HIPÓTESE NÃO VALIDADA: o feed é o que a simulação faz a cada tick (alarme abriu, alarme encerrou, ficou offline,
     voltou, entrou/saiu do modo Operador). No sistema real viria do histórico de eventos (o catálogo tem "Reset",
     "Controle Manual", "Log In"...). Só registra durante o tick: a cena inicial e o slide do admin não inundam o feed. */
  // MOCK — HIPÓTESE NÃO VALIDADA: e-mails de exemplo; no sistema real o autor vem do registro de auditoria do evento.
  const USUARIOS_EXEMPLO = ["ana.souza@exemplo.com.br", "carlos.lima@exemplo.com.br", "marina.alves@exemplo.com.br", "paulo.reis@exemplo.com.br"];
  const eventos = [];
  const EVENTOS_MAX = 200;
  let registrando = false;
  // Regra do feed: só notificações do dia (desde 00:00 do horário local). A virada do dia tira o que ficou para trás.
  // HIPÓTESE NÃO VALIDADA: "dia" = dia civil, não turno do operador (quem vira a noite perde o que aconteceu antes da meia-noite).
  function inicioDoDia() { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function eventosDeHoje() {
    const ini = inicioDoDia();
    const i = eventos.findIndex((e) => e.ts < ini); // lista da mais nova para a mais antiga
    if (i >= 0) eventos.length = i;
    return eventos;
  }
  function registrar(tipo, equipamentoId, texto, severidade, autor) {
    if (!registrando) return;
    const eq = equipamentoPorId(equipamentoId);
    eventos.unshift({
      id: `EV-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ts: Date.now(),
      tipo, // "alarme" | "offline" | "operador" | "plano" | "tabela"
      autor: autor || "Sistema", // quem causou: "Sistema" ou um usuário (nomes de exemplo, ver USUARIOS_EXEMPLO)
      equipamentoId,
      nome: eq ? eq.nome : equipamentoId,
      texto,
      severidade: severidade || null,
    });
    eventosDeHoje();
    if (eventos.length > EVENTOS_MAX) eventos.length = EVENTOS_MAX;
  }

  function novoAlerta(equipamentoId, tipoAlarme) {
    const info = ALARMES_CATALOGO[tipoAlarme];
    return {
      id: `ALR-LIVE-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      equipamentoId,
      tipoAlarme,
      descricao: info.descricao,
      severidade: SEVERIDADE_DO_CATALOGO[info.criticidade] || "Médio",
      dataHora: horaAtualFmt(),
    };
  }

  function atualizarEquipamento(id, mudancas) {
    equipamentos = equipamentos.map((e) => (e.id === id ? { ...e, ...mudancas } : e));
  }

  function abrirProblema() {
    const saudaveis = equipamentos.filter((e) => ehControlador(e) && !temProblema(e));
    if (!saudaveis.length) return;
    const alvo = sortear(saudaveis);
    if (Math.random() < PROPORCAO_OFFLINE) {
      // guarda o momento em que deixou de comunicar (a aba Geral mostra como "Última comunicação")
      atualizarEquipamento(alvo.id, { online: false, ultimaComunicacao: Date.now() });
      alertas = [novoAlerta(alvo.id, "comunicacao"), ...alertas];
      registrar("offline", alvo.id, "Deixou de comunicar", "Alto", "Sistema");
    } else {
      const alerta = novoAlerta(alvo.id, sortearAlarme());
      alertas = [alerta, ...alertas];
      registrar("alarme", alvo.id, ALARMES_CATALOGO[alerta.tipoAlarme].nome, alerta.severidade);
    }
  }

  function fecharProblema() {
    const temFixo = (e) => alertas.some((a) => a.equipamentoId === e.id && !a.id.startsWith("ALR-LIVE"));
    const resolviveis = controladoresComProblema().filter((e) => !temFixo(e));
    if (!resolviveis.length) return;
    const alvo = sortear(resolviveis);
    if (!alvo.online) atualizarEquipamento(alvo.id, { online: true });
    alertas = alertas.filter((a) => a.equipamentoId !== alvo.id);
  }

  // v3: de vez em quando um controlador entra ou sai do modo Operador (alguém assumiu o controle manual).
  // v3: o controlador mudou de plano (pela grade horária, "Sistema", ou manualmente por alguém) ou alguém mudou a tabela de
  // programação. Só registra o evento; não muda nenhum dado do protótipo. Números de plano de exemplo.
  // HIPÓTESE NÃO VALIDADA: se o legado/Antares registra a troca de plano e quem editou a tabela.
  function mudarPlano() {
    const alvo = sortear(equipamentos.filter(ehControlador));
    if (!alvo) return;
    const de = 1 + Math.floor(Math.random() * 8);
    const para = ((de + Math.floor(Math.random() * 7)) % 8) + 1;
    const porGrade = Math.random() < 0.7; // a maioria das trocas é automática, pela grade horária
    registrar("plano", alvo.id, `Mudou do plano ${de} para o plano ${para}`, null, porGrade ? "Sistema" : sortear(USUARIOS_EXEMPLO));
  }
  function mudarTabela() {
    const alvo = sortear(equipamentos.filter(ehControlador));
    if (!alvo) return;
    registrar("tabela", alvo.id, "Mudou a tabela de programação", null, sortear(USUARIOS_EXEMPLO));
  }

  function alternarModoOperador() {
    const controladores = equipamentos.filter(ehControlador);
    if (!controladores.length) return;
    const emOperador = controladores.filter((e) => modoDoControlador(e.id) === "operador");
    if (emOperador.length && Math.random() < 0.5) {
      const alvo = sortear(emOperador);
      modosSimulados.set(alvo.id, "centro");
    } else {
      const alvo = sortear(controladores.filter((e) => modoDoControlador(e.id) !== "operador"));
      if (!alvo) return;
      modosSimulados.set(alvo.id, "operador");
      registrar("operador", alvo.id, "Entrou no modo Operador", null, sortear(USUARIOS_EXEMPLO));
    }
  }

  // Cena inicial: sai já com um número de problemas dentro da faixa, sem esperar os ticks.
  function semearProblemas() {
    const { min, max } = faixaProblemas();
    const alvo = min + Math.floor(Math.random() * (max - min + 1));
    let guarda = 2000;
    while (controladoresComProblema().length > alvo && guarda--) fecharProblema();
    while (controladoresComProblema().length < alvo && guarda--) abrirProblema();
  }

  /* ---------- número fixo de falhas (modo admin: slide "Simular falhas") ----------
     O admin escolhe quantos controladores estão com falha (offline ou alarme) e a simulação SEGURA esse número:
     o tick não mexe mais. Alarmes que já vêm fixos nos dados de exemplo (que não são "ao vivo") não fecham, então
     o mínimo pode não ser zero. Voltar ao automático: voltarSimulacao(). */
  let alvoManual = null;

  function definirProblemas(n) {
    if (falhasReais) return;
    const total = equipamentos.filter(ehControlador).length;
    alvoManual = Math.max(0, Math.min(total, Math.round(n)));
    let guarda = 5000;
    while (controladoresComProblema().length > alvoManual && guarda--) fecharProblema();
    guarda = 5000;
    while (controladoresComProblema().length < alvoManual && guarda--) abrirProblema();
    notify();
  }
  function voltarSimulacao() {
    alvoManual = null;
    semearProblemas();
    notify();
  }
  const contagemProblemas = () => ({ atual: controladoresComProblema().length, total: equipamentos.filter(ehControlador).length, manual: alvoManual });

  function tick() {
    if (falhasReais || alvoManual !== null || !equipamentos.some(ehControlador)) return;
    const n = controladoresComProblema().length;
    const { min, max } = faixaProblemas();
    registrando = true;
    if (n < min) abrirProblema();
    else if (n > max) fecharProblema();
    else if (n === min || (n < max && Math.random() < 0.5)) abrirProblema();
    else fecharProblema();
    // só nas versões com o widget Notificações: a mudança de modo altera o que "Só alertas" mostra no mapa
    if (typeof Versoes !== "undefined" && Versoes.tem("widget.notificacoes") && Math.random() < 0.3) alternarModoOperador();
    if (typeof Versoes !== "undefined" && Versoes.tem("widget.notificacoes") && Math.random() < 0.2) mudarPlano();
    if (typeof Versoes !== "undefined" && Versoes.tem("widget.notificacoes") && Math.random() < 0.08) mudarTabela();
    registrando = false;
    notify();
  }

  /* ---------- falhas reais (modo admin) ----------
     O admin busca os eventos de dispositivos-eventos (API do Antares dev) e chama isto: as falhas
     simuladas saem, as reais entram e a simulação PARA (senão o tick reabriria problemas por cima).
     Associação evento -> controlador é HIPÓTESE NÃO VALIDADA: o `comunicacaoId` da API ("010103")
     não é o id do Supabase ("112962"). Casa por id quando bate; senão sorteia um controlador (e o
     admin avisa quantos foram sorteados). Voltar à simulação: limparFalhasReais(). */
  let falhasReais = false;

  function aplicarFalhasReais(eventos) {
    const controladores = equipamentos.filter(ehControlador);
    const porId = new Map(controladores.map((e) => [e.id, e]));
    const usados = new Set();
    const livres = () => controladores.filter((e) => !usados.has(e.id));
    let sorteados = 0;

    alvoManual = null; // as falhas reais entram no lugar do número escolhido no slide
    alertas = alertas.filter((a) => !a.id.startsWith("ALR-LIVE") && !a.id.startsWith("ALR-API"));
    equipamentos = equipamentos.map((e) => (ehControlador(e) && !e.online ? { ...e, online: true } : e));

    const novos = [];
    for (const ev of eventos) {
      let alvo = porId.get(String(ev.comunicacaoId));
      if (!alvo || usados.has(alvo.id)) {
        const pool = livres();
        if (!pool.length) break;
        alvo = sortear(pool);
        sorteados++;
      }
      usados.add(alvo.id);
      const info = ALARMES_CATALOGO[ev.identificador] || ALARMES_CATALOGO.desconhecido;
      const d = new Date(ev.dataAlerta);
      novos.push({
        id: `ALR-API-${ev.id}`,
        equipamentoId: alvo.id,
        endereco: alvo.nome, // a API ainda não cadastra endereço: vale o do controlador onde o evento caiu
        tipoAlarme: ALARMES_CATALOGO[ev.identificador] ? ev.identificador : "desconhecido",
        descricao: ev.descricaoAlerta || info.descricao,
        severidade: SEVERIDADE_DO_CATALOGO[ev.criticidade] || "Médio",
        dataHora: isNaN(d) ? "" : d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      });
      if (ev.identificador === "comunicacao") atualizarEquipamento(alvo.id, { online: false, ultimaComunicacao: isNaN(d) ? Date.now() : d.getTime() });
    }
    alertas = [...novos, ...alertas];
    falhasReais = true;
    notify();
    return { aplicados: novos.length, sorteados };
  }

  function limparFalhasReais() {
    alertas = alertas.filter((a) => !a.id.startsWith("ALR-API"));
    equipamentos = equipamentos.map((e) => (ehControlador(e) && !e.online ? { ...e, online: true } : e));
    falhasReais = false;
    semearProblemas();
    notify();
  }

  let intervalId = null;
  function start(periodoMs) {
    if (intervalId) return;
    semearProblemas();
    notify();
    intervalId = setInterval(tick, periodoMs || 6000);
  }

  // Troca todos os equipamentos de um tipo (ex.: semáforos de exemplo pelos reais do
  // banco). Alertas de equipamento que deixou de existir saem junto.
  function substituirEquipamentosDoTipo(tipo, novos) {
    equipamentos = [...equipamentos.filter((e) => e.tipo !== tipo), ...novos];
    const ids = new Set(equipamentos.map((e) => e.id));
    alertas = alertas.filter((a) => ids.has(a.equipamentoId));
    semearProblemas(); // controladores novos (do banco) chegam todos online
    notify();
  }

  return {
    subscribe,
    notificar: notify,
    getEquipamentos,
    getAlertas,
    getEventos: eventosDeHoje,
    equipamentoPorId,
    alertasDoEquipamento,
    modoDoControlador,
    statusDoControlador,
    ROTULOS_STATUS,
    substituirEquipamentosDoTipo,
    aplicarFalhasReais,
    limparFalhasReais,
    falhasReaisAtivas: () => falhasReais,
    definirProblemas,
    voltarSimulacao,
    contagemProblemas,
    start,
  };
})();
