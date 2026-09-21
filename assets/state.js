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

  // A cada ciclo alterna a conexão de 1 equipamento e, quando ele cai, abre um
  // alerta crítico de comunicação (fecha de novo quando reconecta) — o bastante
  // pra qualquer widget aberto mostrar número mudando sem ação do operador.
  //
  // Com centenas de equipamentos, virar um aleatório a cada tick faria a fração offline
  // subir até ~50% em poucos minutos; por isso o offline fica em torno de 3%: acima do
  // limite só reconecta, abaixo dele derruba na maior parte das vezes.
  function tick() {
    if (equipamentos.length === 0) return;
    const offline = equipamentos.filter((e) => !e.online);
    const limiteOffline = Math.max(4, Math.round(equipamentos.length * 0.03));
    const reconectar = offline.length > 0 && (offline.length >= limiteOffline || Math.random() < 0.35);
    const candidatos = reconectar ? offline : equipamentos.filter((e) => e.online);
    if (candidatos.length === 0) return;
    const alvo = candidatos[Math.floor(Math.random() * candidatos.length)];
    const atualizado = { ...alvo, online: !alvo.online };
    equipamentos = equipamentos.map((e) => (e.id === alvo.id ? atualizado : e));

    if (!atualizado.online) {
      const jaTemAlerta = alertas.some(
        (a) => a.equipamentoId === atualizado.id && a.descricao.includes("comunicação")
      );
      if (!jaTemAlerta) {
        alertas = [
          {
            id: "ALR-LIVE-" + Date.now(),
            equipamentoId: atualizado.id,
            descricao: "Falha de comunicação com o controlador",
            severidade: "Crítico",
            dataHora: horaAtualFmt(),
          },
          ...alertas,
        ];
      }
    } else {
      alertas = alertas.filter(
        (a) => !(a.equipamentoId === atualizado.id && a.descricao.includes("comunicação"))
      );
    }

    notify();
  }

  let intervalId = null;
  function start(periodoMs) {
    if (intervalId) return;
    intervalId = setInterval(tick, periodoMs || 6000);
  }

  // Troca todos os equipamentos de um tipo (ex.: semáforos de exemplo pelos reais do
  // banco). Alertas de equipamento que deixou de existir saem junto.
  function substituirEquipamentosDoTipo(tipo, novos) {
    equipamentos = [...equipamentos.filter((e) => e.tipo !== tipo), ...novos];
    const ids = new Set(equipamentos.map((e) => e.id));
    alertas = alertas.filter((a) => ids.has(a.equipamentoId));
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
