/* ==========================================================================
   Cockpit — corredores e áreas cadastrados (tabelas cockpit_corredores e
   cockpit_areas no Supabase, ver supabase/regioes.sql). São a única fonte de
   regiões: entram nas listas SUBAREAS / CORREDORES (vazias em data.js), marcados
   com `cadastrado: true`, e Mapa, Regiões e filtros os tratam como região comum.

   Quem pertence a quê é calculado pela geografia:
   - subárea: controlador dentro do polígono;
   - corredor: controlador a até `raioM` metros da linha (o mais próximo vence, já
     que o modelo guarda um corredor por equipamento).
   O cálculo vale para todo equipamento (controlador do banco ou de exemplo).
   ========================================================================== */

const RAIO_CORREDOR_PADRAO_M = 50;
const TABELA_CORREDORES = "cockpit_corredores";
const TABELA_AREAS = "cockpit_areas";

/* ---------- geometria ---------- */

// Ray casting; polígonos são listas de [lat, lng].
function pontoNoPoligono(lat, lng, poligono) {
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [latI, lngI] = poligono[i];
    const [latJ, lngJ] = poligono[j];
    if (lngI > lng !== lngJ > lng && lat < ((latJ - latI) * (lng - lngI)) / (lngJ - lngI) + latI) dentro = !dentro;
  }
  return dentro;
}

// Distância em metros de um ponto a uma polilinha, projetando lat/lng num plano local
// (erro desprezível na escala de um corredor urbano).
function distanciaAPolilinhaM(lat, lng, linha) {
  const kLat = 111320;
  const kLng = 111320 * Math.cos((lat * Math.PI) / 180);
  const p = [lng * kLng, lat * kLat];
  let menor = Infinity;
  for (let i = 0; i < linha.length - 1; i++) {
    const a = [linha[i][1] * kLng, linha[i][0] * kLat];
    const b = [linha[i + 1][1] * kLng, linha[i + 1][0] * kLat];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const t = dx === 0 && dy === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
    menor = Math.min(menor, Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)));
  }
  return menor;
}

// Extensão de uma polilinha em metros (mesma projeção local da distância acima).
function comprimentoPolilinhaM(linha) {
  let total = 0;
  for (let i = 0; i < linha.length - 1; i++) {
    const kLat = 111320;
    const kLng = 111320 * Math.cos((((linha[i][0] + linha[i + 1][0]) / 2) * Math.PI) / 180);
    total += Math.hypot((linha[i + 1][1] - linha[i][1]) * kLng, (linha[i + 1][0] - linha[i][0]) * kLat);
  }
  return total;
}

// Área de um polígono em m² (fórmula do cadarço no plano local).
function areaPoligonoM2(poligono) {
  const latMedia = poligono.reduce((soma, p) => soma + p[0], 0) / poligono.length;
  const kLat = 111320;
  const kLng = 111320 * Math.cos((latMedia * Math.PI) / 180);
  let soma = 0;
  for (let i = 0; i < poligono.length; i++) {
    const [latA, lngA] = poligono[i];
    const [latB, lngB] = poligono[(i + 1) % poligono.length];
    soma += lngA * kLng * (latB * kLat) - lngB * kLng * (latA * kLat);
  }
  return Math.abs(soma) / 2;
}

function regiaoDoPonto(lat, lng) {
  const sub = SUBAREAS.find((s) => pontoNoPoligono(lat, lng, s.poligono));
  let corredorId = null;
  let menor = Infinity;
  CORREDORES.forEach((c) => {
    if (!c.raioM) return;
    const d = distanciaAPolilinhaM(lat, lng, c.linha);
    if (d <= c.raioM && d < menor) {
      menor = d;
      corredorId = c.id;
    }
  });
  return { subareaId: sub ? sub.id : null, corredorId };
}

// Recalcula subárea/corredor de todos os equipamentos pela posição. Roda ao abrir o
// Cockpit e depois de cadastrar, renomear ou excluir região.
function reatribuirRegioes() {
  LiveState.getEquipamentos().forEach((eq) => Object.assign(eq, regiaoDoPonto(eq.lat, eq.lng)));
  LiveState.notificar();
}

function controladoresDaRegiao(tipo, id) {
  const campo = tipo === "corredor" ? "corredorId" : "subareaId";
  return LiveState.getEquipamentos().filter((e) => e.origem === "banco" && e[campo] === id).length;
}

/* ---------- leitura ---------- */

const pontosValidos = (lista, minimo) =>
  Array.isArray(lista) && lista.length >= minimo && lista.every((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));

async function buscarRegioesCadastradas() {
  const [linhasCorredores, linhasAreas] = await Promise.all([
    supabaseRequisitar(`${TABELA_CORREDORES}?select=id,nome,linha,raio_m&order=nome`),
    supabaseRequisitar(`${TABELA_AREAS}?select=id,nome,poligono&order=nome`),
  ]);
  return {
    corredores: linhasCorredores
      .filter((r) => pontosValidos(r.linha, 2))
      .map((r) => ({ id: r.id, nome: escaparHtml(r.nome), linha: r.linha, raioM: r.raio_m || RAIO_CORREDOR_PADRAO_M, cadastrado: true })),
    areas: linhasAreas
      .filter((r) => pontosValidos(r.poligono, 3))
      .map((r) => ({ id: r.id, nome: escaparHtml(r.nome), poligono: r.poligono, cadastrado: true })),
  };
}

// Substitui as regiões cadastradas pelas lidas do banco.
function aplicarRegioesCadastradas({ corredores, areas }) {
  SUBAREAS.splice(0, SUBAREAS.length, ...SUBAREAS.filter((s) => !s.cadastrado), ...areas);
  CORREDORES.splice(0, CORREDORES.length, ...CORREDORES.filter((c) => !c.cadastrado), ...corredores);
}

/* ---------- escrita (usada só pelo modo ?admin) ---------- */

function novoIdRegiao(prefixo) {
  return `${prefixo}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

// `id` opcional: o formulário do admin gera um por desenho, então salvar de novo depois de
// uma falha (que pode ter chegado ao banco) não cria região duplicada. O ignore-duplicates
// faz o POST repetido com o mesmo id virar no-op em vez de erro 409.
async function cadastrarCorredor({ id = novoIdRegiao("CR"), nome, linha, raioM }) {
  await supabaseRequisitar(TABELA_CORREDORES, {
    metodo: "POST",
    headers: { Prefer: "return=minimal, resolution=ignore-duplicates" },
    corpo: { id, nome, linha, raio_m: raioM },
  });
  CORREDORES.push({ id, nome: escaparHtml(nome), linha, raioM, cadastrado: true });
  return id;
}

async function cadastrarArea({ id = novoIdRegiao("SA"), nome, poligono }) {
  await supabaseRequisitar(TABELA_AREAS, {
    metodo: "POST",
    headers: { Prefer: "return=minimal, resolution=ignore-duplicates" },
    corpo: { id, nome, poligono },
  });
  SUBAREAS.push({ id, nome: escaparHtml(nome), poligono, cadastrado: true });
  return id;
}

async function renomearRegiao(tipo, id, nome) {
  const [tabela, lista] = tipo === "corredor" ? [TABELA_CORREDORES, CORREDORES] : [TABELA_AREAS, SUBAREAS];
  await supabaseRequisitar(`${tabela}?id=eq.${encodeURIComponent(id)}`, {
    metodo: "PATCH",
    headers: { Prefer: "return=minimal" },
    corpo: { nome },
  });
  const item = lista.find((r) => r.id === id);
  if (item) item.nome = escaparHtml(nome);
}

async function excluirRegiao(tipo, id) {
  const [tabela, lista] = tipo === "corredor" ? [TABELA_CORREDORES, CORREDORES] : [TABELA_AREAS, SUBAREAS];
  await supabaseRequisitar(`${tabela}?id=eq.${encodeURIComponent(id)}`, {
    metodo: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
  const idx = lista.findIndex((r) => r.id === id);
  if (idx >= 0) lista.splice(idx, 1);
}
