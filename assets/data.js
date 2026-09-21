/* ==========================================================================
   Cockpit — dados mock (Curitiba, mesma região do croqui-prototipo)
   Dados fixos (não gerados aleatoriamente) pra manter a demo estável entre
   recarregamentos — só o "tempo real" (ver liveState no map.js/app.js) mexe
   em status depois do load inicial.
   ========================================================================== */

const CENTRO_CURITIBA = [-25.4322, -49.2723];

const CATEGORIAS_EQUIPAMENTO = [
  { id: "semaforo", label: "Semáforos" },
  { id: "camera", label: "Câmeras" },
  { id: "radar", label: "Radares" },
  { id: "nobreak", label: "Nobreaks" },
  { id: "pluviometro", label: "Pluviômetros" },
];

const ICONES_CATEGORIA = {
  semaforo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="8" y="2" width="8" height="18" rx="4"/><circle cx="12" cy="6.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="11" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="15.5" r="1.3" fill="currentColor" stroke="none"/><path d="M12 20v2"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="7" width="14" height="11" rx="2"/><path d="M16 10.5 22 7v11l-6-3.5"/></svg>',
  radar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="0.8" fill="currentColor" stroke="none"/><path d="M12 3v2M21 12h-2M12 21v-2M3 12h2"/></svg>',
  nobreak: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M13 8 9 13h3l-1 4 4-5h-3z" fill="currentColor" stroke="none"/></svg>',
  pluviometro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 16a5 5 0 0 1-1-9.9A6 6 0 0 1 18 8a4 4 0 0 1-1 8H8Z"/><path d="M9 19v1M12 19v2M15 19v1"/></svg>',
};

const SEVERIDADES = ["Crítico", "Alto", "Médio", "Baixo"];
const SEVERIDADE_COR = { "Crítico": "var(--red)", "Alto": "var(--amber)", "Médio": "#2f6fed", "Baixo": "var(--ink-faint)" };

// Cores disponíveis pra customização de card (mesma paleta em todos os widgets configuráveis)
const CORES_CARD = [
  { id: "vermelho", label: "Vermelho", hex: "#e0342b" },
  { id: "azul", label: "Azul", hex: "#2f6fed" },
  { id: "verde", label: "Verde", hex: "#1f9d5c" },
  { id: "amarelo", label: "Amarelo", hex: "#e69b1f" },
  { id: "roxo", label: "Roxo", hex: "#7c4fd6" },
];

/* Sem regiões de exemplo: subáreas e corredores existem só quando cadastrados (modo ?admin,
   ver regioes.js) e são carregados do Supabase antes da tela montar. Subárea: { id "SA-…", nome,
   poligono [[lat,lng]…] }. Corredor: { id "CR-…", nome, linha [[lat,lng]…], raioM }. */
const SUBAREAS = [];
const CORREDORES = [];

/* subareaId / corredorId não são escritos aqui: reatribuirRegioes() (regioes.js) preenche pela
   posição do equipamento em relação às regiões cadastradas. Equipamento fora de qualquer região
   fica "solto", caso real e válido. */
const EQUIPAMENTOS = [
  { id: "SEM-1001", tipo: "semaforo", nome: "Sem. Sete de Setembro x XV de Novembro", lat: -25.4297, lng: -49.2711, online: true },
  { id: "SEM-1002", tipo: "semaforo", nome: "Sem. Marechal Deodoro x Cândido de Abreu", lat: -25.4258, lng: -49.2699, online: true },
  { id: "SEM-1003", tipo: "semaforo", nome: "Sem. Av. do Batel x Padre Anchieta", lat: -25.4392, lng: -49.2825, online: false },
  { id: "SEM-1004", tipo: "semaforo", nome: "Sem. Água Verde x Brasílio Itiberê", lat: -25.4498, lng: -49.2780, online: true },
  { id: "SEM-1005", tipo: "semaforo", nome: "Sem. Comendador Franco x Linha Verde", lat: -25.4380, lng: -49.2825, online: true },
  { id: "SEM-1006", tipo: "semaforo", nome: "Sem. Sete de Setembro x Brigadeiro Franco", lat: -25.4325, lng: -49.2650, online: true },
  { id: "SEM-1007", tipo: "semaforo", nome: "Sem. Rui Barbosa x Visc. de Nácar", lat: -25.4470, lng: -49.2750, online: false },
  { id: "SEM-1008", tipo: "semaforo", nome: "Sem. XV de Novembro x Ébano Pereira", lat: -25.4290, lng: -49.2735, online: true },

  { id: "CAM-2001", tipo: "camera", nome: "Câm. Praça Tiradentes", lat: -25.4285, lng: -49.2705, online: true },
  { id: "CAM-2002", tipo: "camera", nome: "Câm. Av. do Batel 1200", lat: -25.4405, lng: -49.2810, online: true },
  { id: "CAM-2003", tipo: "camera", nome: "Câm. Shopping Água Verde", lat: -25.4510, lng: -49.2790, online: false },
  { id: "CAM-2004", tipo: "camera", nome: "Câm. Linha Verde km 4", lat: -25.4420, lng: -49.2850, online: true },
  { id: "CAM-2005", tipo: "camera", nome: "Câm. Rui Barbosa 800", lat: -25.4380, lng: -49.2745, online: true },
  { id: "CAM-2006", tipo: "camera", nome: "Câm. Praça Osório", lat: -25.4305, lng: -49.2725, online: true },

  { id: "RAD-3001", tipo: "radar", nome: "Radar Rui Barbosa km 2", lat: -25.4440, lng: -49.2748, online: true },
  { id: "RAD-3002", tipo: "radar", nome: "Radar Sete de Setembro 3400", lat: -25.4350, lng: -49.2620, online: true },
  { id: "RAD-3003", tipo: "radar", nome: "Radar Linha Verde km 8", lat: -25.4550, lng: -49.2880, online: false },
  { id: "RAD-3004", tipo: "radar", nome: "Radar Cândido de Abreu", lat: -25.4230, lng: -49.2700, online: true },

  { id: "NOB-4001", tipo: "nobreak", nome: "Nobreak Gabinete Centro 04", lat: -25.4300, lng: -49.2740, online: true },
  { id: "NOB-4002", tipo: "nobreak", nome: "Nobreak Gabinete Batel 02", lat: -25.4398, lng: -49.2830, online: false },
  { id: "NOB-4003", tipo: "nobreak", nome: "Nobreak Gabinete Água Verde 01", lat: -25.4495, lng: -49.2800, online: true },
  { id: "NOB-4004", tipo: "nobreak", nome: "Nobreak Gabinete Bigorrilho 03", lat: -25.4365, lng: -49.2880, online: true },

  { id: "PLU-5001", tipo: "pluviometro", nome: "Pluviômetro Centro Cívico", lat: -25.4210, lng: -49.2705, online: true },
  { id: "PLU-5002", tipo: "pluviometro", nome: "Pluviômetro Água Verde", lat: -25.4530, lng: -49.2765, online: true },
  { id: "PLU-5003", tipo: "pluviometro", nome: "Pluviômetro Bigorrilho", lat: -25.4340, lng: -49.2905, online: false },
];

/* Alertas referenciam um equipamentoId existente. Nem todo equipamento offline tem
   alerta aberto (pode ter sido só reconectar) e nem todo alerta é de equipamento
   offline (ex.: bateria baixa, detecção anômala com o link ainda de pé). */
const ALERTAS = [
  { id: "ALR-9001", equipamentoId: "SEM-1003", descricao: "Falha de comunicação com o controlador", severidade: "Crítico", dataHora: "09/09/2026 08:12" },
  { id: "ALR-9002", equipamentoId: "SEM-1007", descricao: "Sem resposta do controlador há mais de 30 min", severidade: "Crítico", dataHora: "09/09/2026 07:44" },
  { id: "ALR-9003", equipamentoId: "CAM-2003", descricao: "Perda de sinal de vídeo", severidade: "Alto", dataHora: "09/09/2026 09:03" },
  { id: "ALR-9004", equipamentoId: "RAD-3003", descricao: "Falha de comunicação com o controlador", severidade: "Crítico", dataHora: "09/09/2026 06:58" },
  { id: "ALR-9005", equipamentoId: "NOB-4002", descricao: "Nobreak em operação por bateria (falta de rede elétrica)", severidade: "Alto", dataHora: "09/09/2026 08:40" },
  { id: "ALR-9006", equipamentoId: "PLU-5003", descricao: "Sem leitura há mais de 2 horas", severidade: "Médio", dataHora: "09/09/2026 07:15" },
  { id: "ALR-9007", equipamentoId: "SEM-1001", descricao: "Detecção de conflito de fases", severidade: "Alto", dataHora: "09/09/2026 09:21" },
  { id: "ALR-9008", equipamentoId: "NOB-4004", descricao: "Bateria abaixo de 40%", severidade: "Médio", dataHora: "09/09/2026 08:55" },
  { id: "ALR-9009", equipamentoId: "CAM-2005", descricao: "Ângulo da câmera fora do padrão cadastrado", severidade: "Baixo", dataHora: "09/09/2026 07:30" },
  { id: "ALR-9010", equipamentoId: "SEM-1006", descricao: "Tempo de verde divergente do plano vigente", severidade: "Médio", dataHora: "09/09/2026 09:10" },
  { id: "ALR-9011", equipamentoId: "RAD-3001", descricao: "Autoteste diário pendente de confirmação", severidade: "Baixo", dataHora: "09/09/2026 06:20" },
  { id: "ALR-9012", equipamentoId: "CAM-2004", descricao: "Cartão de armazenamento com 90% de uso", severidade: "Baixo", dataHora: "09/09/2026 08:05" },
];

/* ---------- Helpers de leitura (puros — não mexem em estado global) ---------- */

function equipamentoPorId(id) {
  return EQUIPAMENTOS.find((e) => e.id === id) || null;
}

function categoriaLabel(tipoId) {
  const c = CATEGORIAS_EQUIPAMENTO.find((c) => c.id === tipoId);
  return c ? c.label : tipoId;
}

function nomeSubarea(id) {
  const s = SUBAREAS.find((s) => s.id === id);
  return s ? s.nome : null;
}

function nomeCorredor(id) {
  const c = CORREDORES.find((c) => c.id === id);
  return c ? c.nome : null;
}
