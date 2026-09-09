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
  function tick() {
    if (equipamentos.length === 0) return;
    const idx = Math.floor(Math.random() * equipamentos.length);
    const atualizado = { ...equipamentos[idx], online: !equipamentos[idx].online };
    equipamentos = equipamentos.map((e, i) => (i === idx ? atualizado : e));

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

  return { subscribe, getEquipamentos, getAlertas, equipamentoPorId, alertasDoEquipamento, start };
})();
