# Cockpit — protótipo (Antares / dataprom)

Protótipo navegável do **Épico #125012 — Cockpit Operacional Semafórico**: uma tela em
grade onde o usuário adiciona, move, redimensiona, configura e remove widgets (Mapa,
Dispositivos, Alertas, Subáreas e Corredores) pra montar seu próprio painel operacional.
Mesma identidade visual e mesma convenção de projeto do `croqui-prototipo` — site estático,
sem build, sem backend. Layout e configuração de cada card ficam no `localStorage` do
navegador (simula "atrelado ao perfil do usuário").

## Cobertura das histórias

| História | O que cobre no protótipo |
|---|---|
| #125012 (Épico) | Grid com adicionar/mover/redimensionar/remover, múltiplas instâncias (exceto Mapa), 1ª tela vazia |
| #125167 — Widget de Mapa | Instância única, filtros Subáreas/Corredores/Equipamentos (dropdown + busca + Todas/Limpar), busca livre com destaque+zoom, status ao vivo |
| #125168 — Widget de Dispositivos | Card Totais / Lista Detalhada, config (nome/cor/filtros), integração com o Mapa |
| #125169 — Widget de Alertas | Totais por severidade / Lista Detalhada com busca+paginação, "Ver tudo" (fora de escopo aqui), integração com o Mapa |
| #128628 — Widget de Regiões | Totais Subáreas+Corredores / Lista em abas, integração com o Mapa |

"Tempo real" é simulado: a cada ~6s um equipamento aleatório troca de status (e abre/fecha
um alerta de comunicação), refletindo nos widgets já abertos sem ação do operador.

## Rodar local

```powershell
powershell -ExecutionPolicy Bypass -File .\_serve.ps1
# abre http://localhost:8746/
```

Ou pelo [Painel de Protótipos](../prototipos-painel) (`node server.mjs`, porta 8700), que
descobre esta pasta sozinho por ter `_serve.ps1`.

## Fora de escopo (herdado do Épico)

Compartilhamento de tela entre usuários, mais de uma tela por usuário, widgets de série
temporal, exportação PDF/PNG, tela detalhada de Alertas (o botão "Ver tudo" só mostra um
toast) — mesmos recortes do `00 - epic - Cockpit.md`.
