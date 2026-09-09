// Vercel Edge Middleware — trava o site inteiro atrás de uma senha fixa (HTTP Basic Auth).
// Só atua no deploy da Vercel; rodando local com _serve.ps1 este arquivo nem é usado.
//
// Trocar a senha: mude USUARIO_PADRAO / SENHA_PADRAO aqui embaixo, OU defina
// SITE_USUARIO / SITE_SENHA nas Environment Variables do projeto na Vercel (têm prioridade
// e não ficam no Git).

const USUARIO_PADRAO = "dataprom";
const SENHA_PADRAO = "dat@taprom-2016";

export const config = {
  // roda em todas as rotas, menos o favicon
  matcher: ["/((?!favicon.ico).*)"],
};

export default function middleware(request) {
  const usuario = process.env.SITE_USUARIO || USUARIO_PADRAO;
  const senha = process.env.SITE_SENHA || SENHA_PADRAO;

  const header = request.headers.get("authorization") || "";
  const [tipo, credenciais] = header.split(" ");

  if (tipo === "Basic" && credenciais) {
    let decodificado = "";
    try {
      decodificado = atob(credenciais);
    } catch (e) {
      decodificado = "";
    }
    const idx = decodificado.indexOf(":");
    const u = decodificado.slice(0, idx);
    const p = decodificado.slice(idx + 1);
    if (u === usuario && p === senha) {
      return; // credenciais ok — libera a requisição
    }
  }

  return new Response("Acesso restrito.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Cockpit - prototipo dataprom", charset="UTF-8"',
      "content-type": "text/plain; charset=utf-8",
    },
  });
}
