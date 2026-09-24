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

  function horaAtualFmt() {
    const d = new Date();
    return (
      d.toLocaleDateString("pt-BR") +
      " " +
      d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    );
  }

  /* ---------- simulação de problemas nos controladores ----------
     Mantém sempre entre 5 e 10 controladores com problema (pedido do Guery, 24/09, para ver
     como o mapa e os widgets ficam numa cena realista). ~1/3 cai (offline + alerta de
     comunicação); os demais seguem online com um alarme do catálogo real (alarmes.js).
     A cada tick um problema abre ou fecha, sem sair da faixa. Alertas fixos de data.js
     (id que não começa com ALR-LIVE) não são fechados pela simulação. */
  const PROBLEMAS_MIN = 5;
  const PROBLEMAS_MAX = 10;
  const ALARMES_SIMULADOS = ["lampadaQueimada", "detectorAvariado", "portaAberta", "grupoAvariado", "erroRelogio", "controleManual", "falhaNtp", "erroTabela", "queimaTotalVermelho"];
  const SEVERIDADE_DO_CATALOGO = { ALTO: "Alto", MEDIO: "Médio", BAIXO: "Baixo" };

  const ehControlador = (e) => e.tipo === "semaforo";
  const temProblema = (e) => !e.online || alertasDoEquipamento(e.id).length > 0;
  const controladoresComProblema = () => equipamentos.filter((e) => ehControlador(e) && temProblema(e));
  const sortear = (lista) => lista[Math.floor(Math.random() * lista.length)];

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
    if (Math.random() < 0.35) {
      // guarda o momento em que deixou de comunicar (a aba Geral mostra como "Última comunicação")
      atualizarEquipamento(alvo.id, { online: false, ultimaComunicacao: Date.now() });
      alertas = [novoAlerta(alvo.id, "comunicacao"), ...alertas];
    } else {
      alertas = [novoAlerta(alvo.id, sortear(ALARMES_SIMULADOS)), ...alertas];
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
    const alvo = PROBLEMAS_MIN + Math.floor(Math.random() * (PROBLEMAS_MAX - PROBLEMAS_MIN + 1));
    let guarda = 50;
    while (controladoresComProblema().length > alvo && guarda--) fecharProblema();
    while (controladoresComProblema().length < alvo && guarda--) abrirProblema();
  }

  function tick() {
    if (!equipamentos.some(ehControlador)) return;
    const n = controladoresComProblema().length;
    if (n < PROBLEMAS_MIN) abrirProblema();
    else if (n > PROBLEMAS_MAX) fecharProblema();
    else if (n === PROBLEMAS_MIN || (n < PROBLEMAS_MAX && Math.random() < 0.5)) abrirProblema();
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
    substituirEquipamentosDoTipo,
    start,
  };
})();
