// Vercel Function — proxy de LEITURA para a API de eventos do Antares (dev). Existe porque essa API só
// libera CORS para a origem dela e localhost:4200. O token Bearer do usuário chega no header
// X-Antares-Token (não em Authorization, que o middleware.js usa para a senha do site), é repassado e
// nunca é gravado nem logado. Só GET em dispositivos-eventos, com pagina/tamanho.

const BASE = "https://antares-revolution-dev.dataprom.com/api/monitoramentos/v1/dispositivos-eventos";
const TENANT = "682a03a0-cf99-48d1-b9c1-8778757c9a0c";

module.exports = async (req, res) => {
  const token = req.headers["x-antares-token"];
  if (!token) return res.status(400).json({ erro: "Falta o token (header X-Antares-Token)." });
  const num = (v, padrao, max) => Math.min(Math.max(parseInt(v, 10) || padrao, 0), max);
  const pagina = num(req.query.pagina, 0, 10000);
  const tamanho = Math.max(num(req.query.tamanho, 100, 500), 1);
  try {
    const resp = await fetch(`${BASE}?pagina=${pagina}&tamanho=${tamanho}`, {
      headers: { accept: "application/json", authorization: `Bearer ${token}`, "x-tenant-id": TENANT },
    });
    res.status(resp.status).setHeader("content-type", "application/json").send(await resp.text());
  } catch (e) {
    res.status(502).json({ erro: "Não consegui falar com a API do Antares." });
  }
};
