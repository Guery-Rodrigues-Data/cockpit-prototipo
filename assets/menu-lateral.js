/* =====================================================================
   Cockpit — menu lateral (hambúrguer na barra branca de cima)
   Abre uma gaveta à esquerda com as páginas do sistema, para trocar de tela sem ocupar espaço fixo na tela.

   HIPÓTESE NÃO VALIDADA: as páginas e a ordem abaixo são EXEMPLO tirado dos projetos em andamento (Cockpit, Dashboard
   de Alertas, Croqui, Programação, Cadastro). Falta confirmar com o time qual é o menu real do Antares, se há
   agrupamento/permissão por perfil e se o menu fica sempre recolhido ou pode ser fixado. Só o Cockpit navega.
   ===================================================================== */
(function () {
  const PAGINAS = [
    { id: "cockpit", nome: "Cockpit", ativo: true },
    { id: "alertas", nome: "Dashboard de Alertas" },
    { id: "croqui", nome: "Croqui" },
    { id: "programacao", nome: "Programação de Controladores" },
    { id: "cadastro", nome: "Cadastro" },
  ];
  const ICONE_MENU =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';

  function montar() {
    const barra = document.querySelector(".app-topbar");
    if (!barra) return;

    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "topbar-icon-btn app-menu-btn";
    botao.title = "Menu";
    botao.setAttribute("aria-label", "Abrir o menu");
    botao.setAttribute("aria-expanded", "false");
    botao.innerHTML = ICONE_MENU;
    barra.insertBefore(botao, barra.firstChild);

    const veu = document.createElement("div");
    veu.className = "menu-lateral-veu";
    veu.hidden = true;
    const gaveta = document.createElement("nav");
    gaveta.className = "menu-lateral";
    gaveta.setAttribute("aria-label", "Páginas do sistema");
    gaveta.hidden = true;
    gaveta.innerHTML = `
      <div class="menu-lateral-topo">
        <strong>Menu</strong>
        <button type="button" class="topbar-icon-btn" data-menu="fechar" aria-label="Fechar o menu">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>
        </button>
      </div>
      ${PAGINAS.map((p) => `<button type="button" class="menu-lateral-item${p.ativo ? " is-ativo" : ""}" data-menu="${p.id}" ${p.ativo ? 'aria-current="page"' : ""}>${p.nome}</button>`).join("")}
      <p class="menu-lateral-nota">Páginas de exemplo. Só o Cockpit está neste protótipo.</p>`;
    document.body.append(veu, gaveta);

    const abrir = (sim) => {
      veu.hidden = !sim;
      gaveta.hidden = !sim;
      botao.setAttribute("aria-expanded", String(sim));
      if (sim) requestAnimationFrame(() => { veu.classList.add("is-aberto"); gaveta.classList.add("is-aberta"); });
      else { veu.classList.remove("is-aberto"); gaveta.classList.remove("is-aberta"); }
    };
    botao.addEventListener("click", () => abrir(gaveta.hidden));
    veu.addEventListener("click", () => abrir(false));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !gaveta.hidden) abrir(false); });
    gaveta.addEventListener("click", (e) => {
      const b = e.target.closest("[data-menu]");
      if (!b) return;
      if (b.dataset.menu === "fechar" || b.dataset.menu === "cockpit") return abrir(false);
      abrir(false);
      if (typeof notImplemented === "function") notImplemented(PAGINAS.find((p) => p.id === b.dataset.menu).nome);
    });
  }

  document.addEventListener("DOMContentLoaded", montar);
})();
