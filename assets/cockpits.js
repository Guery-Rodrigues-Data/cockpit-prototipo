/* =====================================================================
   Cockpit — vários cockpits por usuário
   Desde a v1 o painel nasce modular (widgets movem e redimensionam) e o usuário pode ter MAIS DE UM cockpit. Hoje ele
   começa com um só ("Meu cockpit"), mas a estrutura e o seletor já existem.

   HIPÓTESE NÃO VALIDADA (ver perguntas abertas no Produto): onde a lista mora (aqui: localStorage do navegador, como o
   layout; no produto seria por perfil, no banco), se há limite de cockpits, se um cockpit pode ser compartilhado, e
   qual abre ao entrar (aqui: o último usado).

   O primeiro cockpit ("c1") usa a mesma chave de layout de antes, então nada do que já estava salvo se perde.
   Cada versão (versoes.js) tem a sua própria lista, como já tem o seu próprio layout.
   ===================================================================== */
const Cockpits = (function () {
  const CHAVE_LISTA = Versoes.chaveLayout("cockpitListaV1");
  const NOME_PADRAO = "Meu cockpit";
  const NOME_MAX = 40;

  function ler() {
    try {
      const salvo = JSON.parse(localStorage.getItem(CHAVE_LISTA) || "null");
      if (salvo && Array.isArray(salvo.itens) && salvo.itens.length) {
        if (!salvo.itens.some((c) => c.id === salvo.ativo)) salvo.ativo = salvo.itens[0].id;
        return salvo;
      }
    } catch (e) { /* sem localStorage ou JSON ruim: cai no padrão */ }
    return { ativo: "c1", itens: [{ id: "c1", nome: NOME_PADRAO }] };
  }
  let estado = ler();

  function gravar() {
    try { localStorage.setItem(CHAVE_LISTA, JSON.stringify(estado)); } catch (e) { /* segue na memória */ }
  }

  const itens = () => estado.itens.map((c) => ({ ...c }));
  const ativo = () => estado.itens.find((c) => c.id === estado.ativo);
  // c1 = chave antiga; os demais ganham o id no fim
  const chaveLayout = (base) => (estado.ativo === "c1" ? base : `${base}-${estado.ativo}`);

  const limparNome = (nome) => String(nome || "").trim().replace(/\s+/g, " ").slice(0, NOME_MAX);

  function criar(nome) {
    const limpo = limparNome(nome) || `Cockpit ${estado.itens.length + 1}`;
    const id = "c" + Date.now().toString(36);
    estado.itens.push({ id, nome: limpo });
    estado.ativo = id;
    gravar();
    location.reload(); // o layout do novo cockpit nasce vazio/padrão: recarregar monta a tela do zero
  }

  function trocar(id) {
    if (id === estado.ativo || !estado.itens.some((c) => c.id === id)) return;
    estado.ativo = id;
    gravar();
    location.reload();
  }

  function renomear(id, nome) {
    const c = estado.itens.find((x) => x.id === id);
    const limpo = limparNome(nome);
    if (!c || !limpo) return false;
    c.nome = limpo;
    gravar();
    return true;
  }

  function excluir(id) {
    if (estado.itens.length <= 1) return; // sempre sobra um
    estado.itens = estado.itens.filter((c) => c.id !== id);
    try { localStorage.removeItem(id === "c1" ? Versoes.chaveLayout("cockpitLayoutV1") : `${Versoes.chaveLayout("cockpitLayoutV1")}-${id}`); } catch (e) { /* ok */ }
    if (estado.ativo === id) estado.ativo = estado.itens[0].id;
    gravar();
    location.reload();
  }

  /* ---------- seletor no breadcrumb ---------- */

  let modo = { tipo: "lista" }; // "lista" | { tipo: "novo" } | { tipo: "renomear", id } | { tipo: "excluir", id }
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function renderPainel(painel) {
    const lista = itens();
    const linhas = lista
      .map((c) => {
        if (modo.tipo === "renomear" && modo.id === c.id) {
          return `<div class="cockpit-sel-linha is-editando"><input type="text" maxlength="${NOME_MAX}" value="${esc(c.nome)}" data-cockpit-input="renomear" data-id="${c.id}" aria-label="Nome do cockpit" />
            <button type="button" class="btn-primary" data-cockpit-acao="renomear-salvar" data-id="${c.id}">Salvar</button></div>`;
        }
        const confirmando = modo.tipo === "excluir" && modo.id === c.id;
        return `<div class="cockpit-sel-linha${c.id === estado.ativo ? " is-ativo" : ""}">
          <button type="button" class="cockpit-sel-nome" data-cockpit-acao="trocar" data-id="${c.id}">${esc(c.nome)}</button>
          <button type="button" class="cockpit-sel-mini" data-cockpit-acao="renomear" data-id="${c.id}" title="Renomear">Renomear</button>
          ${lista.length > 1 ? `<button type="button" class="cockpit-sel-mini is-perigo" data-cockpit-acao="${confirmando ? "excluir-confirmar" : "excluir"}" data-id="${c.id}">${confirmando ? "Confirmar?" : "Excluir"}</button>` : ""}
        </div>`;
      })
      .join("");
    const novo =
      modo.tipo === "novo"
        ? `<div class="cockpit-sel-linha is-editando"><input type="text" maxlength="${NOME_MAX}" placeholder="Nome do novo cockpit" data-cockpit-input="novo" aria-label="Nome do novo cockpit" />
            <button type="button" class="btn-primary" data-cockpit-acao="novo-salvar">Criar</button></div>`
        : `<button type="button" class="cockpit-sel-novo" data-cockpit-acao="novo">+ Novo cockpit</button>`;
    painel.innerHTML = `<div class="cockpit-sel-titulo">Meus cockpits</div>${linhas}${novo}`;
    const campo = painel.querySelector("input");
    if (campo) { campo.focus(); campo.select(); }
  }

  function montarSeletor() {
    // fica na barra branca de cima, junto do sino e do avatar
    const alvo = document.querySelector(".app-topbar-actions");
    if (!alvo || !Versoes.tem("cockpit.multiplos")) return;
    const wrap = document.createElement("div");
    wrap.className = "cockpit-sel";
    wrap.innerHTML = `<button type="button" class="cockpit-sel-btn" data-cockpit-acao="abrir" aria-haspopup="true" aria-expanded="false">
        <span class="cockpit-sel-atual">${esc(ativo().nome)}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
      </button>
      <div class="cockpit-sel-painel" hidden></div>`;
    alvo.insertBefore(wrap, alvo.firstChild);
    const painel = wrap.querySelector(".cockpit-sel-painel");
    const btn = wrap.querySelector(".cockpit-sel-btn");
    const abrir = (aberto) => {
      painel.hidden = !aberto;
      btn.setAttribute("aria-expanded", String(aberto));
      if (aberto) { modo = { tipo: "lista" }; renderPainel(painel); }
    };

    wrap.addEventListener("click", (e) => {
      const b = e.target.closest("[data-cockpit-acao]");
      if (!b) return;
      const id = b.dataset.id;
      switch (b.dataset.cockpitAcao) {
        case "abrir": return abrir(painel.hidden);
        case "trocar": return trocar(id);
        case "novo": modo = { tipo: "novo" }; return renderPainel(painel);
        case "novo-salvar": return criar(painel.querySelector('[data-cockpit-input="novo"]').value);
        case "renomear": modo = { tipo: "renomear", id }; return renderPainel(painel);
        case "renomear-salvar": {
          if (renomear(id, painel.querySelector('[data-cockpit-input="renomear"]').value)) {
            wrap.querySelector(".cockpit-sel-atual").textContent = ativo().nome;
            modo = { tipo: "lista" };
            renderPainel(painel);
          }
          return;
        }
        case "excluir": modo = { tipo: "excluir", id }; return renderPainel(painel);
        case "excluir-confirmar": return excluir(id);
      }
    });
    wrap.addEventListener("keydown", (e) => {
      if (e.key === "Escape") return abrir(false);
      if (e.key !== "Enter" || !e.target.matches("input")) return;
      const salvar = painel.querySelector('[data-cockpit-acao$="-salvar"]');
      if (salvar) salvar.click();
    });
    document.addEventListener("click", (e) => { if (!wrap.contains(e.target)) abrir(false); });
  }

  document.addEventListener("DOMContentLoaded", montarSeletor);

  return { ativo, itens, chaveLayout };
})();
