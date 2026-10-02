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
  function modoDoControlador(id) {
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
    } else {
      alertas = [novoAlerta(alvo.id, sortearAlarme()), ...alertas];
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

  // Cena inicial: sai já com um número de problemas dentro da faixa, sem esperar os ticks.
  function semearProblemas() {
    const { min, max } = faixaProblemas();
    const alvo = min + Math.floor(Math.random() * (max - min + 1));
    let guarda = 2000;
    while (controladoresComProblema().length > alvo && guarda--) fecharProblema();
    while (controladoresComProblema().length < alvo && guarda--) abrirProblema();
  }

  function tick() {
    if (!equipamentos.some(ehControlador)) return;
    const n = controladoresComProblema().length;
    const { min, max } = faixaProblemas();
    if (n < min) abrirProblema();
    else if (n > max) fecharProblema();
    else if (n === min || (n < max && Math.random() < 0.5)) abrirProblema();
    else fecharProblema();
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
    equipamentoPorId,
    alertasDoEquipamento,
    modoDoControlador,
    statusDoControlador,
    ROTULOS_STATUS,
    substituirEquipamentosDoTipo,
    start,
  };
})();
