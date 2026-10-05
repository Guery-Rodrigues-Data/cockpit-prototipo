/* ==========================================================================
   Cockpit — LABORATÓRIO do "Quando roda" (EXPERIMENTO, não é tela final).
   Modal com vários modelos de mostrar a tabela horária (quais planos rodam em que dias e
   horários), lado a lado nos mesmos dados, para a gente comparar e escolher. Abre pelo botão
   'Modelos do "Quando roda" (teste)' no rodapé do modal de Planos.
   Referência dos modelos: "plano do dia" + "plano da semana" dos controladores (FHWA Traffic
   Signal Timing Manual, cap. 7) e a tela de horários do Programador DP40.
   ========================================================================== */

const LabQuandoRoda = (() => {
  const MODELOS = [
    { id: "atual", nome: "A · Atual (7 dias)", nota: "O que está no modal hoje: uma barra de 24h por dia da semana." },
    { id: "agrupado", nome: "B · Dias agrupados + trocas", nota: "Dias com a mesma agenda viram uma linha só (plano do dia × plano da semana). Embaixo, a lista de trocas do grupo escolhido." },
    { id: "tabela", nome: "C · Tabela de horários", nota: "Formato da tela de horários do DP40: uma linha por horário cadastrado, com os dias marcados." },
    { id: "calendario", nome: "D · Grade semanal", nota: "Estilo agenda/calendário: dias em colunas, horas de cima para baixo." },
    { id: "hoje", nome: "E · Hoje + próximas trocas", nota: "Só o dia de hoje, com o horário de cada troca escrito, e as próximas trocas a partir de agora." },
    { id: "gradeCor", nome: "F · Grade colorida", nota: "Prints MediCare / Novainc / Synapse: grade de calendário com uma cor por plano, nome e horário dentro do bloco, coluna de hoje destacada e linha de agora com o horário. Rola na vertical; abre perto da hora atual." },
    { id: "agendaDia", nome: "G · Agenda do dia", nota: "Prints dos apps de jogos e de cavalos: escolhe o dia em cima e vê a lista de planos daquele dia em cartões, com início–fim, duração e o que está rodando agora." },
    { id: "gradeEnxuta", nome: "I · Grade enxuta", nota: "A F com menos coisa: dias iguais numa coluna só (Seg a Qui), blocos cinza só com o número, e cor + nome + horário apenas no plano escolhido. É a que está na aba Planos e horários." },
    { id: "inicios", nome: "J · Tabela de inícios", nota: "Formato da ficha de programação (\"Início de planos\"): uma linha por horário de troca, uma coluna por tipo de dia (dias iguais juntos). Traço = o plano anterior continua." },
    { id: "tipoDia", nome: "H · Dias iguais juntos", nota: "Print Working hours: ao escolher um dia, todos os dias com a mesma agenda acendem juntos; embaixo, as faixas De → Até com o plano." },
  ];

  let estado = null; // { sel: plano destacado, modelo: id, grupo: grupo do modelo B, dia: dia dos modelos G/H }

  // Uma cor por plano (modelos F, G, H), espalhada pelo círculo de cores para planos vizinhos
  // não ficarem parecidos. Fundo claro, borda e texto escuros do mesmo tom.
  const corPlano = (num) => {
    const h = Math.round((num * 137.508) % 360);
    return { fundo: `hsl(${h} 70% 93%)`, borda: `hsl(${h} 55% 45%)`, texto: `hsl(${h} 45% 24%)` };
  };
  const estiloCor = (num) => { const c = corPlano(num); return `--pl-fundo:${c.fundo};--pl-borda:${c.borda};--pl-texto:${c.texto}`; };
  const duracao = (min) => (min >= 60 ? `${Math.floor(min / 60)}h${min % 60 ? pad(min % 60) : ""}` : `${min} min`);

  const pad = (n) => String(n).padStart(2, "0");
  const hm = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
  const hojeDia = () => new Date().getDay();
  const minAgora = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

  function el() {
    let m = document.getElementById("labModal");
    if (!m) {
      m = document.createElement("div");
      m.id = "labModal";
      m.className = "modal-overlay lab-overlay";
      document.body.appendChild(m);
    }
    return m;
  }

  function abrir(num) {
    const a = PainelControlador.agenda();
    estado = { sel: num || a.emCurso, modelo: estado?.modelo || "agrupado", grupo: 0, dia: hojeDia(), apagarOutros: false };
    render();
    el().classList.add("is-open");
  }
  function fechar() {
    estado = null;
    const m = document.getElementById("labModal");
    if (m) { m.classList.remove("is-open"); m.innerHTML = ""; }
  }

  // ---------- peças comuns ----------

  const nomePlano = (a, num) => `Plano ${num} · ${a.planos[num].desc}`;

  function bloco(a, [ini, fim, num], { vertical = false, texto = null } = {}) {
    const tam = ((fim - ini) / 1440) * 100;
    const pos = (ini / 1440) * 100;
    const estilo = vertical ? `top:${pos}%;height:${tam}%` : `width:${tam}%`;
    const conteudo = texto != null ? texto : tam >= 2 ? num : "";
    return `<button type="button" class="lab-bloco${num === estado.sel ? " is-sel" : ""}${num === a.emCurso ? " is-agora" : ""}" style="${estilo}" data-lab-sel="${num}"
      title="${hm(ini)}–${hm(fim)} · ${nomePlano(a, num)}">${conteudo}</button>`;
  }

  const regua = () => `<div class="lab-regua"><span></span><div>${[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => `<i style="left:${(h / 24) * 100}%">${pad(h)}h</i>`).join("")}</div></div>`;

  const marcaAgora = () => `<span class="lab-agora" style="left:${(minAgora() / 1440) * 100}%"></span>`;

  // Agrupa os dias da semana que têm exatamente a mesma agenda (ordem Seg → Dom).
  function gruposDeDias(a) {
    const grupos = [];
    for (const d of a.ordem) {
      const chave = a.tabela[d].map((f) => f.join("-")).join("|");
      const g = grupos.find((x) => x.chave === chave);
      if (g) g.dias.push(d);
      else grupos.push({ chave, dias: [d], faixas: a.tabela[d] });
    }
    grupos.forEach((g) => (g.rotulo = rotuloDias(a, g.dias)));
    return grupos;
  }
  function rotuloDias(a, dias) {
    const pos = dias.map((d) => a.ordem.indexOf(d));
    const seguidos = pos.every((p, i) => i === 0 || p === pos[i - 1] + 1);
    if (dias.length === 1) return a.dias[dias[0]];
    if (seguidos) return `${a.dias[dias[0]]} a ${a.dias[dias[dias.length - 1]]}`;
    return dias.map((d) => a.dias[d]).join(", ");
  }

  // ---------- modelos ----------

  function modeloAtual(a) {
    const linhas = a.ordem.map((d) => `<div class="lab-linha${d === hojeDia() ? " is-hoje" : ""}">
        <span class="lab-dia">${a.dias[d]}${d === hojeDia() ? "<small>hoje</small>" : ""}</span>
        <div class="lab-barra">${a.tabela[d].map((f) => bloco(a, f)).join("")}${d === hojeDia() ? marcaAgora() : ""}</div>
      </div>`).join("");
    return regua() + linhas;
  }

  function modeloAgrupado(a) {
    const grupos = gruposDeDias(a);
    const gi = Math.min(estado.grupo, grupos.length - 1);
    const linhas = grupos.map((g, i) => `<div class="lab-linha lab-linha-grupo${i === gi ? " is-grupo-sel" : ""}${g.dias.includes(hojeDia()) ? " is-hoje" : ""}" data-lab-grupo="${i}">
        <span class="lab-dia">${g.rotulo}${g.dias.includes(hojeDia()) ? "<small>hoje</small>" : ""}</span>
        <div class="lab-barra">${g.faixas.map((f) => bloco(a, f)).join("")}${g.dias.includes(hojeDia()) ? marcaAgora() : ""}</div>
      </div>`).join("");
    const g = grupos[gi];
    const trocas = g.faixas.map(([ini, , num]) => `<button type="button" class="lab-troca${num === estado.sel ? " is-sel" : ""}" data-lab-sel="${num}">
        <b>${hm(ini)}</b><span>P${num}</span><small>${a.planos[num].desc}</small></button>`).join("");
    return `${regua()}${linhas}
      <div class="lab-trocas-titulo">Trocas de plano · ${g.rotulo} <small>(clique numa linha acima para trocar)</small></div>
      <div class="lab-trocas">${trocas}</div>`;
  }

  function modeloTabela(a) {
    const letras = { 0: "D", 1: "S", 2: "T", 3: "Q", 4: "Q", 5: "S", 6: "S" };
    const linhas = [...a.horarios]
      .map((h) => ({ ...h, primeiroDia: Math.min(...h.dias.map((d) => a.ordem.indexOf(d))) }))
      .sort((x, y) => x.primeiroDia - y.primeiroDia || x.inicio.localeCompare(y.inicio))
      .map((h) => `<tr class="${h.plano === estado.sel ? "is-sel" : ""}" data-lab-sel="${h.plano}">
          <td class="lab-td-plano">${h.plano}</td>
          <td>${a.planos[h.plano].desc}</td>
          <td class="lab-td-dias">${a.ordem.map((d) => `<i class="${h.dias.includes(d) ? "is-on" : ""}" title="${a.dias[d]}">${letras[d]}</i>`).join("")}</td>
          <td class="lab-td-hora">${h.inicio}</td>
          <td class="lab-td-hora">${h.fim}</td>
        </tr>`).join("");
    return `<table class="lab-tabela">
        <thead><tr><th>Plano</th><th>Nome</th><th>Dias</th><th>Início</th><th>Fim</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>`;
  }

  function modeloCalendario(a) {
    const horas = [0, 3, 6, 9, 12, 15, 18, 21];
    const colunas = a.ordem.map((d) => `<div class="lab-cal-col${d === hojeDia() ? " is-hoje" : ""}">
        <div class="lab-cal-dia">${a.dias[d]}${d === hojeDia() ? "<small>hoje</small>" : ""}</div>
        <div class="lab-cal-corpo">
          ${a.tabela[d].map((f) => bloco(a, f, { vertical: true, texto: f[1] - f[0] >= 90 ? `P${f[2]}<small>${hm(f[0])}</small>` : f[1] - f[0] >= 45 ? `P${f[2]}` : "" })).join("")}
          ${d === hojeDia() ? `<span class="lab-cal-agora" style="top:${(minAgora() / 1440) * 100}%"></span>` : ""}
        </div>
      </div>`).join("");
    return `<div class="lab-cal">
        <div class="lab-cal-horas"><div class="lab-cal-dia"></div><div class="lab-cal-corpo">${horas.map((h) => `<i style="top:${(h / 24) * 100}%">${pad(h)}h</i>`).join("")}</div></div>
        ${colunas}
      </div>`;
  }

  function modeloHoje(a) {
    const d = hojeDia();
    const faixas = a.tabela[d];
    // horário de cada troca embaixo da barra; trocas muito próximas (< 1h) não repetem o rótulo
    let ultimo = -999;
    const marcas = faixas.map(([ini]) => {
      if (ini - ultimo < 60) return "";
      ultimo = ini;
      return `<i style="left:${(ini / 1440) * 100}%">${hm(ini)}</i>`;
    }).join("");
    // próximas trocas a partir de agora, atravessando a meia-noite para os dias seguintes
    const proximas = [];
    const agora = minAgora();
    for (let k = 0; k < 7 && proximas.length < 6; k++) {
      const dia = (d + k) % 7;
      for (const [ini, , num] of a.tabela[dia]) {
        if (k === 0 && ini <= agora) continue;
        proximas.push({ dia, ini, num, k });
        if (proximas.length >= 6) break;
      }
    }
    const lista = proximas.map((p) => `<button type="button" class="lab-troca${p.num === estado.sel ? " is-sel" : ""}" data-lab-sel="${p.num}">
        <b>${p.k === 0 ? "" : p.k === 1 ? "amanhã " : `${a.dias[p.dia]} `}${hm(p.ini)}</b><span>P${p.num}</span><small>${a.planos[p.num].desc}</small></button>`).join("");
    return `<div class="lab-hoje-titulo">${a.dias[d]} · hoje</div>
      <div class="lab-barra lab-barra-hoje">${faixas.map((f) => bloco(a, f)).join("")}${marcaAgora()}</div>
      <div class="lab-hoje-marcas">${marcas}</div>
      <div class="lab-trocas-titulo">Próximas trocas</div>
      <div class="lab-trocas">${lista}</div>`;
  }

  // F · grade de calendário colorida — a mesma da aba "Planos e horários" (grade-horarios.js)
  function modeloGradeCor(a) {
    return `${GradeHorarios.markup(a, { sel: estado.sel, apagarOutros: estado.apagarOutros, attrSel: "data-lab-sel" })}
      <label class="lab-g-opcao"><input type="checkbox" data-lab-apagar ${estado.apagarOutros ? "checked" : ""}> Apagar os outros planos ao destacar</label>`;
  }

  // Dias com a mesma agenda que `d` (para "mesma agenda de…" e para acender juntos no modelo H).
  const diasIguais = (a, d) => gruposDeDias(a).find((g) => g.dias.includes(d)).dias;

  function faixaCartao(a, d, [ini, fim, num]) {
    const agoraAqui = d === hojeDia() && minAgora() >= ini && minAgora() < fim;
    return `<button type="button" class="lab-card${num === estado.sel ? " is-sel" : ""}${agoraAqui ? " is-agora" : ""}" data-lab-sel="${num}" style="${estiloCor(num)}">
        <span class="lab-card-hora">${hm(ini)} – ${hm(fim)}<small>${duracao(fim - ini)}</small></span>
        <span class="lab-card-plano"><i></i>P${num} · ${a.planos[num].desc}</span>
        ${agoraAqui ? '<span class="lab-card-agora">Agora</span>' : ""}
      </button>`;
  }

  // G · agenda do dia: fileira de dias em cima, cartões do dia escolhido embaixo
  function modeloAgendaDia(a) {
    const d = estado.dia;
    const dias = a.ordem.map((x) => `<button type="button" class="lab-dia-chip${x === d ? " is-sel" : ""}" data-lab-dia="${x}">
        <b>${a.dias[x]}</b><small>${a.tabela[x].length} trocas</small>${x === hojeDia() ? "<em>hoje</em>" : ""}</button>`).join("");
    const iguais = diasIguais(a, d).filter((x) => x !== d);
    return `<div class="lab-dias-fileira">${dias}</div>
      <div class="lab-agenda-cab">${a.dias[d]}${iguais.length ? `<small>mesma agenda de ${iguais.map((x) => a.dias[x]).join(", ")}</small>` : "<small>agenda só deste dia</small>"}</div>
      <div class="lab-cards">${a.tabela[d].map((f) => faixaCartao(a, d, f)).join("")}</div>`;
  }

  // H · dias iguais juntos (print "Working hours"): escolher um dia acende todos com a mesma agenda
  function modeloTipoDia(a) {
    const d = estado.dia;
    const iguais = diasIguais(a, d);
    const dias = a.ordem.map((x) => `<button type="button" class="lab-pilula${iguais.includes(x) ? " is-on" : ""}" data-lab-dia="${x}">${a.dias[x]}</button>`).join("");
    const linhas = a.tabela[d].map(([ini, fim, num]) => `<button type="button" class="lab-faixa${num === estado.sel ? " is-sel" : ""}" data-lab-sel="${num}" style="${estiloCor(num)}">
        <span class="lab-faixa-campo"><small>De</small><b>${hm(ini)}</b></span>
        <span class="lab-faixa-seta">→</span>
        <span class="lab-faixa-campo"><small>Até</small><b>${hm(fim)}</b></span>
        <span class="lab-faixa-plano"><i></i>P${num} · ${a.planos[num].desc}</span>
      </button>`).join("");
    return `<div class="lab-pilulas">${dias}</div>
      <p class="lab-pilulas-nota">${iguais.length > 1 ? `${iguais.length} dias com esta mesma agenda` : "Só este dia tem esta agenda"} · clique em outro dia para ver a agenda dele</p>
      <div class="lab-faixas">${linhas}</div>`;
  }

  // J · tabela "Início de planos": linhas = horários de troca (de todos os dias), colunas = grupos
  // de dias com a mesma agenda; célula = plano que começa ali, ou traço se o anterior continua.
  function modeloInicios(a) {
    const grupos = gruposDeDias(a);
    const horarios = [...new Set(grupos.flatMap((g) => g.faixas.map(([ini]) => ini)))].sort((x, y) => x - y);
    const agora = minAgora();
    const cab = grupos.map((g) => `<th class="${g.dias.includes(hojeDia()) ? "is-hoje" : ""}">${g.rotulo}${g.dias.includes(hojeDia()) ? " · hoje" : ""}</th>`).join("");
    const linhas = horarios.map((h) => `<tr><td class="lab-ini-hora">${hm(h)}</td>${grupos.map((g) => {
      const f = g.faixas.find(([ini]) => ini === h);
      if (!f) return '<td><span class="lab-ini-segue">—</span></td>';
      const [ini, fim, num] = f;
      const ehAgora = g.dias.includes(hojeDia()) && agora >= ini && agora < fim;
      return `<td><button type="button" class="lab-ini-plano${ehAgora ? " is-agora" : ""}" data-lab-sel="${num}" style="${estiloCor(num)}" title="${hm(ini)}–${hm(fim)}"><b>P${num}</b><span>${a.planos[num].desc}</span></button></td>`;
    }).join("")}</tr>`).join("");
    return `<table class="lab-inicios"><thead><tr><th>Início</th>${cab}</tr></thead><tbody>${linhas}</tbody></table>`;
  }

  const RENDER = { inicios: modeloInicios, atual: modeloAtual, agrupado: modeloAgrupado, tabela: modeloTabela, calendario: modeloCalendario, hoje: modeloHoje, gradeCor: modeloGradeCor, gradeEnxuta: (a) => GradeHorarios.markup(a, { sel: estado.sel, attrSel: "data-lab-sel", enxuta: true }), agendaDia: modeloAgendaDia, tipoDia: modeloTipoDia };

  function render() {
    if (!estado) return;
    const a = PainelControlador.agenda();
    const modelo = MODELOS.find((m) => m.id === estado.modelo);
    const rolagemAntes = GradeHorarios.lerRolagem(document.getElementById("labModal"));
    const chips = Object.values(a.planos).map((p) => `<button type="button" class="lab-chip${p.num === estado.sel ? " is-sel" : ""}" data-lab-sel="${p.num}" title="${nomePlano(a, p.num)}">${p.num}${p.num === a.emCurso ? "<span></span>" : ""}</button>`).join("");
    el().innerHTML = `
      <div class="config-modal lab-modal" role="dialog" aria-modal="true" aria-labelledby="labTitulo">
        <div class="config-modal-header">
          <div class="lab-titulo"><strong id="labTitulo">Modelos do "Quando roda"</strong><span>Experimento para comparar formatos · mesmos dados de exemplo em todos</span></div>
          <button type="button" class="widget-icon-btn" data-lab-fechar title="Fechar (Esc)" aria-label="Fechar">✕</button>
        </div>
        <div class="lab-abas" role="tablist">${MODELOS.map((m) => `<button type="button" role="tab" class="lab-aba${m.id === estado.modelo ? " is-ativa" : ""}" aria-selected="${m.id === estado.modelo}" data-lab-modelo="${m.id}">${m.nome}</button>`).join("")}</div>
        <div class="config-modal-body lab-corpo">
          <p class="lab-nota">${modelo.nota}</p>
          <div class="lab-destaque"><span>Destacar plano</span><div class="lab-chips">${chips}</div><small>${nomePlano(a, estado.sel)}</small></div>
          <div class="lab-palco lab-palco-${modelo.id}">${RENDER[modelo.id](a)}</div>
        </div>
      </div>`;
    GradeHorarios.aplicarRolagem(el(), rolagemAntes); // grade F: mantém a rolagem entre cliques
  }

  document.addEventListener("click", (e) => {
    const abrirBtn = e.target.closest("[data-lab-abrir]");
    if (abrirBtn) return abrir(Number(abrirBtn.dataset.labAbrir) || null);
    if (!estado) return;
    const modelo = e.target.closest("[data-lab-modelo]");
    if (modelo) { estado.modelo = modelo.dataset.labModelo; return render(); }
    const sel = e.target.closest("[data-lab-sel]");
    if (sel) {
      estado.sel = Number(sel.dataset.labSel);
      const grupo = e.target.closest("[data-lab-grupo]");
      if (grupo) estado.grupo = Number(grupo.dataset.labGrupo);
      return render();
    }
    const grupo = e.target.closest("[data-lab-grupo]");
    if (grupo) { estado.grupo = Number(grupo.dataset.labGrupo); return render(); }
    const dia = e.target.closest("[data-lab-dia]");
    if (dia) { estado.dia = Number(dia.dataset.labDia); return render(); }
    const apagar = e.target.closest("[data-lab-apagar]");
    if (apagar) { estado.apagarOutros = apagar.checked; return render(); }
    if (e.target.closest("[data-lab-fechar]") || e.target.id === "labModal") fechar();
  });
  // Esc fecha só o laboratório (captura: roda antes do Esc do modal de Planos, que está embaixo)
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !estado) return;
    e.stopImmediatePropagation();
    fechar();
  }, true);

  return { abrir, fechar };
})();
