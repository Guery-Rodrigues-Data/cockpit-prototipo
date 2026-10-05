// Vercel Edge Middleware — trava o site inteiro atrás de usuário e senha (HTTP Basic Auth).
// Só atua no deploy da Vercel; rodando local com _serve.ps1 este arquivo nem é usado.
//
// Usuário e senha NÃO ficam no código: defina SITE_USUARIO e SITE_SENHA em Settings >
// Environment Variables do projeto na Vercel e faça um novo deploy. Sem essas variáveis o
// site fica fechado para todo mundo.

export const config = {
  // roda em todas as rotas, menos o favicon
  matcher: ["/((?!favicon.ico).*)"],
};

export default function middleware(request) {
  const usuario = process.env.SITE_USUARIO;
  const senha = process.env.SITE_SENHA;

  const header = request.headers.get("authorization") || "";
  const [tipo, credenciais] = header.split(" ");

  if (usuario && senha && tipo === "Basic" && credenciais) {
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
