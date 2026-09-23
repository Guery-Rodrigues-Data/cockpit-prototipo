/* ==========================================================================
   Cockpit — catálogo de alarmes do controlador semafórico
   Fonte: mapeamento real do backend (InfoAlarme por tipoAlarme), colado pelo Guery em
   22/09/2026. Isso é dado real do sistema, não exemplo — o campo `icone` é o nome do
   Material Symbols usado lá (não é um dos ICONS em SVG deste protótipo ainda).
   Criticidade no catálogo real só tem 3 níveis (ALTO/MEDIO/BAIXO) — não existe "Crítico".
   ========================================================================== */

const ALARMES_CATALOGO = {
  incompatibilidade: { nome: "Incompatibilidade", criticidade: "ALTO", icone: "warning", cor: "FF0000", descricao: "Dispositivo apresenta incompatibilidade de versão ou configuração", categoria: "HARDWARE" },
  comunicacao: { nome: "Comunicação", criticidade: "ALTO", icone: "signal_cellular_alt", cor: "FF4500", descricao: "Falha na comunicação com o dispositivo", categoria: "CONNECTIVITY" },
  grupoAvariado: { nome: "Grupo Defeituoso", criticidade: "MEDIO", icone: "error", cor: "FFA500", descricao: "Grupo de dispositivos apresenta defeito", categoria: "HARDWARE" },
  lampadaQueimada: { nome: "Lâmpada Queimada", criticidade: "BAIXO", icone: "lightbulb_outline", cor: "FFFF00", descricao: "Lâmpada do semáforo está queimada", categoria: "MAINTENANCE" },
  detectorAvariado: { nome: "Detector Defeituoso", criticidade: "MEDIO", icone: "sensors", cor: "FF6347", descricao: "Detector de veículos apresenta defeito", categoria: "HARDWARE" },
  portaAberta: { nome: "Porta Aberta", criticidade: "BAIXO", icone: "door_front", cor: "32CD32", descricao: "Porta do gabinete do controlador está aberta", categoria: "PHYSICAL" },
  reset: { nome: "Reset", criticidade: "BAIXO", icone: "refresh", cor: "1E90FF", descricao: "Dispositivo foi reinicializado", categoria: "SYSTEM" },
  controleManual: { nome: "Controle Manual", criticidade: "BAIXO", icone: "pan_tool", cor: "9370DB", descricao: "Semáforo está sob controle manual", categoria: "OPERATIONAL" },
  logIn: { nome: "Log In", criticidade: "BAIXO", icone: "login", cor: "20B2AA", descricao: "Evento de login no sistema", categoria: "SYSTEM" },
  erroRelogio: { nome: "Erro de Relógio", criticidade: "MEDIO", icone: "schedule", cor: "FF1493", descricao: "Relógio interno do dispositivo apresenta erro", categoria: "SYSTEM" },
  contactorAbertoHardware: { nome: "Contator de Hardware Aberto", criticidade: "ALTO", icone: "hardware", cor: "DC143C", descricao: "Contator de hardware está aberto ou defeituoso", categoria: "HARDWARE" },
  erroTabela: { nome: "Erro de Tabela", criticidade: "MEDIO", icone: "table_chart", cor: "B22222", descricao: "Erro na tabela de programação de tempos", categoria: "CONFIGURATION" },
  esperaGravacao: { nome: "Aguardando Escrita", criticidade: "BAIXO", icone: "pending", cor: "4682B4", descricao: "Sistema aguardando operação de escrita", categoria: "SYSTEM" },
  erroMemoriaRam: { nome: "Erro de Memória RAM", criticidade: "ALTO", icone: "memory", cor: "8B0000", descricao: "Erro na memória RAM do dispositivo", categoria: "HARDWARE" },
  gravacaoLocal: { nome: "Escrita Local", criticidade: "BAIXO", icone: "edit", cor: "228B22", descricao: "Operação de escrita local realizada", categoria: "SYSTEM" },
  acessoIncorreto: { nome: "Acesso Incorreto", criticidade: "MEDIO", icone: "security", cor: "FF8C00", descricao: "Tentativa de acesso incorreto ao dispositivo", categoria: "SECURITY" },
  erroMemoriaXicor: { nome: "Erro de Memória Xicor", criticidade: "ALTO", icone: "developer_board", cor: "800080", descricao: "Erro na memória não-volátil Xicor", categoria: "HARDWARE" },
  queimaTotalVermelho: { nome: "Queima Total do Vermelho", criticidade: "ALTO", icone: "local_fire_department", cor: "FF0000", descricao: "Todas as lâmpadas vermelhas estão queimadas", categoria: "MAINTENANCE" },
  contactorAbertoCH2: { nome: "Contator Aberto CH2", criticidade: "MEDIO", icone: "electrical_services", cor: "FF4500", descricao: "Contator do canal 2 está aberto", categoria: "HARDWARE" },
  alimentacaoBateriaNobreak: { nome: "Energia de Backup da Bateria", criticidade: "MEDIO", icone: "battery_alert", cor: "FFA500", descricao: "Sistema operando com energia de backup", categoria: "POWER" },
  bateriaDeterioradaNobreak: { nome: "Bateria de Backup Deteriorada", criticidade: "ALTO", icone: "battery_1_bar", cor: "FF6347", descricao: "Bateria de backup apresenta deterioração", categoria: "POWER" },
  portaAbertaNobreak: { nome: "Porta de Backup Aberta", criticidade: "BAIXO", icone: "meeting_room", cor: "32CD32", descricao: "Porta do sistema de backup está aberta", categoria: "PHYSICAL" },
  falhaUps: { nome: "Falha no No-break", criticidade: "ALTO", icone: "power_off", cor: "DC143C", descricao: "Sistema de no-break apresenta falha", categoria: "POWER" },
  falhaGps: { nome: "Falha no GPS", criticidade: "MEDIO", icone: "gps_off", cor: "FF1493", descricao: "Sistema GPS apresenta falha", categoria: "CONNECTIVITY" },
  falhaNtp: { nome: "Falha no NTP", criticidade: "MEDIO", icone: "access_time", cor: "9370DB", descricao: "Sincronização de horário NTP falhando", categoria: "CONNECTIVITY" },
  bateriaAusenteNobreak: { nome: "Bateria de Backup Ausente", criticidade: "ALTO", icone: "battery_unknown", cor: "8B0000", descricao: "Bateria de backup não está presente", categoria: "POWER" },
  falhaAcionarReles: { nome: "Falha na Ativação do Relé", criticidade: "ALTO", icone: "settings_input_component", cor: "B22222", descricao: "Falha na ativação do relé de controle", categoria: "HARDWARE" },
  testeInterno: { nome: "Teste Interno", criticidade: "BAIXO", icone: "science", cor: "4682B4", descricao: "Sistema executando teste interno", categoria: "SYSTEM" },
  tabelaConflitosDivergentes: { nome: "Entradas de Tabela Conflitantes", criticidade: "MEDIO", icone: "report_problem", cor: "FF8C00", descricao: "Entradas conflitantes na tabela de configuração", categoria: "CONFIGURATION" },
  falhaPCD: { nome: "Falha no PCD", criticidade: "ALTO", icone: "developer_board", cor: "8B0000", descricao: "Falha no Processador de Controle Digital", categoria: "HARDWARE" },
  desconhecido: { nome: "Alerta Desconhecido", criticidade: "UNKNOWN", icone: "help_outline", cor: "808080", descricao: "Tipo de alerta não reconhecido", categoria: "UNKNOWN" },
};
