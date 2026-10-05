/* ==========================================================================
   Cockpit — grade semanal de horários dos planos (aba "Planos e horários" do modal de Planos
   e modelo F do laboratório). Estilo agenda de calendário, a partir dos prints de referência
   (MediCare / Novainc / Synapse no Dribbble): dias em colunas, horas de cima para baixo, uma cor
   por plano com nome e horário dentro do bloco, coluna de hoje destacada e linha de agora.
   ========================================================================== */

const GradeHorarios = (() => {
  // Escala compacta: hora em que algum plano troca (em qualquer dia) fica alta; hora em que
  // nada troca a semana inteira fica baixa. Assim um plano longo sem troca (ex.: madrugada
  // 00–05) não vira um card enorme, e os dias continuam alinhados na mesma régua.
  const PX_HORA_TROCA = 48;
  const PX_HORA_CALMA = 18;
  const VAO = 8; // espaço em branco entre um plano e o seguinte
  // Modo "caber": a grade inteira (00–24h) ocupa a altura disponível, sem rolagem. As posições
  // saem em % da altura; a régua compacta continua (hora sem troca = 3/8 de uma hora com troca).
  // ALTURA_ESTIMADA só decide quanto texto cabe em cada bloco (o tamanho real vem do CSS).
  const VAO_CABER = 3;
  const ALTURA_ESTIMADA = 520;
  let escala = null; // { alturas[24], topos[25], caber } da última grade desenhada (relógio usa)
  const pad = (n) => String(n).padStart(2, "0");
  const hm = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
  const hojeDia = () => new Date().getDay();
  const minAgora = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

  // Uma cor por plano, espalhada pelo círculo de cores para planos vizinhos não ficarem
  // parecidos. Fundo claro, borda e texto escuros do mesmo tom.
  function estiloCor(num) {
    const h = Math.round((num * 137.508) % 360);
    return `--pl-fundo:hsl(${h} 70% 93%);--pl-borda:hsl(${h} 55% 45%);--pl-texto:hsl(${h} 45% 24%)`;
  }

  // agenda: { planos, tabela, dias, ordem } (PainelControlador.agenda()).
  // attrSel: atributo que o clique no bloco usa (o modal e o laboratório tratam cada um o seu).
  function montarEscala(tabela, caber) {
    const trocaNaHora = Array(24).fill(false);
    Object.values(tabela).forEach((faixas) => faixas.forEach(([ini]) => { if (ini < 1440) trocaNaHora[Math.floor(ini / 60)] = true; }));
    const alturas = trocaNaHora.map((t) => (t ? PX_HORA_TROCA : PX_HORA_CALMA));
    const topos = [0];
    alturas.forEach((a, h) => topos.push(topos[h] + a));
    return { alturas, topos, calma: trocaNaHora.map((t) => !t), caber };
  }
  // posição/altura em unidades da escala → CSS (px, ou % da altura no modo caber)
  const css = (esc, v) => (esc.caber ? `${(v / esc.topos[24]) * 100}%` : `${v}px`);
  // quantos px de tela uma medida da escala ocupa (para decidir o texto do bloco)
  const px = (esc, v) => (esc.caber ? (v / esc.topos[24]) * ALTURA_ESTIMADA : v);
  // minuto do dia → posição em px na escala compacta
  const y = (esc, min) => {
    const h = Math.min(23, Math.floor(min / 60));
    return esc.topos[h] + ((min - h * 60) / 60) * esc.alturas[h];
  };

  // Dias com exatamente a mesma agenda viram uma coluna só ("Seg a Qui"), na ordem Seg → Dom.
  function colunasAgrupadas(tabela, dias, ordem) {
    const grupos = [];
    for (const d of ordem) {
      const chave = tabela[d].map((f) => f.join("-")).join("|");
      const g = grupos.find((x) => x.chave === chave);
      if (g) g.dias.push(d);
      else grupos.push({ chave, dias: [d] });
    }
    return grupos.map((g) => {
      const pos = g.dias.map((d) => ordem.indexOf(d));
      const seguidos = pos.every((p, i) => i === 0 || p === pos[i - 1] + 1);
      const rotulo = g.dias.length === 1 ? dias[g.dias[0]]
        : seguidos ? `${dias[g.dias[0]]} a ${dias[g.dias[g.dias.length - 1]]}` : g.dias.map((d) => dias[d]).join(", ");
      return { dias: g.dias, rotulo, faixas: tabela[g.dias[0]] };
    });
  }

  // enxuta: menos coisa na tela — dias iguais numa coluna só, blocos cinza só com o número do
  // plano, e cor + horário apenas no plano escolhido (o resto aparece no title / ao passar o mouse).
  // verTodos: sem plano escolhido — todo bloco mostra número + horário; o plano rodando agora
  // (na coluna de hoje) fica em destaque.
  function markup(agenda, { sel = null, apagarOutros = false, attrSel = "data-plano-ver", enxuta = false, caber = false, verTodos = false } = {}) {
    const { planos, tabela, dias, ordem } = agenda;
    escala = montarEscala(tabela, caber);
    const vao = caber ? VAO_CABER : VAO;
    const colunas = enxuta
      ? colunasAgrupadas(tabela, dias, ordem)
      : ordem.map((d) => ({ dias: [d], rotulo: dias[d], faixas: tabela[d] }));
    const gridCols = `grid-template-columns:repeat(${colunas.length}, 1fr)`;
    const H = escala.topos[24];
    // no modo caber, hora sem troca fica baixa demais para rótulo: some (a hora aparece no title do bloco)
    const horas = escala.alturas.map((a, h) => (caber && escala.calma[h] && h ? "" : `<i class="${escala.calma[h] ? "is-calma" : ""}" style="top:${css(escala, escala.topos[h])}">${pad(h)}:00</i>`)).join("");
    const linhas = escala.alturas.map((a, h) => `<b class="${escala.calma[h] ? "is-calma" : ""}" style="top:${css(escala, escala.topos[h])};height:${css(escala, a)}"></b>`).join("");
    const ehHoje = (c) => c.dias.includes(hojeDia());
    const cab = colunas.map((c) => `<div class="gh-cab${ehHoje(c) ? " is-hoje" : ""}"><span>${c.rotulo}</span>${ehHoje(c) ? "<em>hoje</em>" : ""}</div>`).join("");
    const cols = colunas.map((c) => {
      const blocos = c.faixas.map(([ini, fim, num]) => {
        const topo = y(escala, ini), fatia = y(escala, fim) - topo;
        const alt = px(escala, fatia) - vao; // vao px em branco antes do próximo plano
        const agoraAqui = verTodos && ehHoje(c) && minAgora() >= ini && minAgora() < fim;
        const destaque = verTodos ? agoraAqui : num === sel;
        let conteudo;
        if (verTodos) conteudo = alt >= 34
          ? `<strong>P${num} · ${planos[num].desc}</strong><small>${hm(ini)} – ${hm(fim)}</small>${agoraAqui ? '<em class="gh-tag-agora">agora</em>' : ""}`
          : alt >= 14 ? `<strong>P${num} <span class="gh-hora">${hm(ini)}–${hm(fim)}</span></strong>${agoraAqui ? '<em class="gh-tag-agora">agora</em>' : ""}` : "";
        else if (enxuta && !destaque) conteudo = alt >= 14 ? `<strong>P${num}</strong>` : "";
        else conteudo = alt >= 36 ? `<strong>P${num} · ${planos[num].desc}</strong><small>${hm(ini)} – ${hm(fim)}</small>`
          : alt >= 14 ? `<strong>P${num} · ${hm(ini)}–${hm(fim)}</strong>` : "";
        const classes = `gh-bloco${alt < (verTodos ? 34 : 36) ? " is-curto" : ""}${verTodos ? " is-todos" : ""}${destaque ? " is-sel" : ""}${enxuta && !destaque && !verTodos ? " is-neutro" : ""}${apagarOutros && sel && !destaque ? " is-apagado" : ""}`;
        const pos = caber
          ? `top:calc(${css(escala, topo)} + ${vao / 2}px);height:max(3px, calc(${css(escala, fatia)} - ${vao}px))`
          : `top:${topo + vao / 2}px;height:${Math.max(6, alt)}px`;
        return `<button type="button" class="${classes}" ${attrSel}="${num}" style="${pos};${estiloCor(num)}"
          title="${c.rotulo} ${hm(ini)}–${hm(fim)} · Plano ${num} · ${planos[num].desc}">${conteudo}</button>`;
      }).join("");
      return `<div class="gh-col${ehHoje(c) ? " is-hoje" : ""}">${blocos}</div>`;
    }).join("");
    const agora = minAgora();
    return `<div class="gh${enxuta ? " is-enxuta" : ""}${caber ? " is-caber" : ""}${verTodos ? " is-todos" : ""}">
        <div class="gh-topo"><div></div><div class="gh-topo-dias" style="${gridCols}">${cab}</div></div>
        <div class="gh-rolagem">
          <div class="gh-corpo" style="${caber ? "" : `height:${H}px`}">
            <div class="gh-horas">${horas}</div>
            <div class="gh-grade" style="${gridCols}">${linhas}${cols}
              <span class="gh-agora" style="top:${css(escala, y(escala, agora))}"><em>${hm(agora)}</em></span>
            </div>
          </div>
        </div>
      </div>`;
  }

  // Guarda a rolagem antes de refazer o HTML e devolve depois; na primeira vez abre 2 h antes de agora.
  const lerRolagem = (raiz) => raiz?.querySelector(".gh-rolagem")?.scrollTop;
  function aplicarRolagem(raiz, anterior) {
    const r = raiz?.querySelector(".gh-rolagem");
    if (r && !escala?.caber) r.scrollTop = anterior != null ? anterior : escala ? Math.max(0, y(escala, Math.max(0, minAgora() - 120))) : 0;
  }

  // Relógio: anda a linha de agora sem refazer a grade.
  setInterval(() => {
    const agora = minAgora();
    if (!escala) return;
    document.querySelectorAll(".gh-agora").forEach((l) => {
      l.style.top = css(escala, y(escala, agora));
      l.querySelector("em").textContent = hm(agora);
    });
  }, 30000);

  return { markup, lerRolagem, aplicarRolagem };
})();
