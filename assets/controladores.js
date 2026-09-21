/* ==========================================================================
   Cockpit — acesso ao Supabase (mesmo projeto do croqui-prototipo) e semáforos
   reais: lê a tabela `controladores` e devolve no formato de equipamento do Cockpit.
   O banco só guarda id, via e posição; status online/offline e alertas continuam
   simulados pelo LiveState. Se o banco não responder, o Cockpit segue com os
   semáforos de exemplo de data.js.
   ========================================================================== */

const SUPABASE_COCKPIT = {
  url: "https://ghresppjwfpdvyhuhvbo.supabase.co",
  chave: "sb_publishable_gKyKsZrrJCA-kNeVIx036g_cLTa_-bK", // publicável, segura por design (RLS controla o acesso)
  tamanhoPagina: 1000, // teto de linhas por request do PostgREST; acima disso é preciso paginar
  timeoutLeituraMs: 10000, // leitura no boot: sem resposta, cai nos dados de exemplo
  timeoutEscritaMs: 20000, // cadastro do modo ?admin: melhor esperar do que perder o desenho
};

// GET devolve o JSON; POST/PATCH/DELETE com `Prefer: return=minimal` devolvem null.
// Escrita tenta 2 vezes quando a rede falha ou o prazo estoura (nunca em erro HTTP). É
// seguro repetir: PATCH/DELETE dão o mesmo resultado e o POST usa ignore-duplicates com id
// gerado no cliente (ver regioes.js). Leitura tenta 1 vez, para o boot não ficar preso.
async function supabaseRequisitar(caminho, opcoes = {}) {
  const escrita = (opcoes.metodo || "GET") !== "GET";
  const tentativas = escrita ? 2 : 1;
  const timeoutMs = escrita ? SUPABASE_COCKPIT.timeoutEscritaMs : SUPABASE_COCKPIT.timeoutLeituraMs;
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await supabaseRequisitarUmaVez(caminho, opcoes, timeoutMs);
    } catch (erro) {
      const transitorio = erro.name === "AbortError" || erro instanceof TypeError;
      if (!transitorio) throw erro;
      if (tentativa >= tentativas) {
        throw new Error(
          erro.name === "AbortError"
            ? `O banco não respondeu em ${timeoutMs / 1000}s (${tentativa} ${tentativa === 1 ? "tentativa" : "tentativas"}). Confira a conexão e tente de novo.`
            : "Sem conexão com o banco. Confira a rede e tente de novo."
        );
      }
      await new Promise((r) => setTimeout(r, 600));
    }
  }
}

async function supabaseRequisitarUmaVez(caminho, { metodo = "GET", corpo, headers } = {}, timeoutMs) {
  const { url, chave } = SUPABASE_COCKPIT;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(`${url}/rest/v1/${caminho}`, {
      method: metodo,
      headers: {
        apikey: chave,
        Authorization: `Bearer ${chave}`,
        ...(corpo !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      signal: ctrl.signal,
    });
    const texto = await resp.text();
    if (!resp.ok) throw new Error(`Supabase respondeu ${resp.status}: ${texto.slice(0, 200)}`);
    return texto ? JSON.parse(texto) : null;
  } finally {
    clearTimeout(timer);
  }
}

// Textos vindos de tabelas com escrita pública caem em innerHTML nos widgets.
function escaparHtml(texto) {
  return String(texto).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function buscarControladores() {
  const linhas = [];
  const { tamanhoPagina } = SUPABASE_COCKPIT;
  for (let offset = 0; ; offset += tamanhoPagina) {
    const pagina = await supabaseRequisitar(
      `controladores?select=id,via,lat,lng&order=id&limit=${tamanhoPagina}&offset=${offset}`
    );
    linhas.push(...pagina);
    if (pagina.length < tamanhoPagina) break;
  }
  return linhas;
}

// Depende das regiões já aplicadas (regioes.js) para preencher subárea/corredor.
function montarSemaforos(linhas) {
  return linhas
    .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng))
    .map((c) => ({
      id: c.id,
      tipo: "semaforo",
      nome: "Sem. " + escaparHtml(c.via || c.id),
      lat: c.lat,
      lng: c.lng,
      ...regiaoDoPonto(c.lat, c.lng),
      online: true,
      origem: "banco", // marca quem tem subárea/corredor recalculados quando as regiões mudam
    }));
}
