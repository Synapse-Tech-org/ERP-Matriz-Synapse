// Valores de reserva ficam aqui para nao espalhar literais pelo executor.
// Campo ausente pode usar padrao; falha de API nunca pode autorizar envio.
export const PADROES_FOLLOWUP = Object.freeze({
  intervaloMinutos: 2,
  tamanhoPagina: 100,
  limiteEnvios: 10,
  encerrarAposMinutos: 30,
  janelaLivreMinutos: 1430,
  retencaoDias: 90,
  timeoutHttpMs: 15000,
  titulo: "Follow-up de atendimento",
  nomeContato: "cliente",
  botaoSimId: "ev06_followup_sim",
  botaoNaoId: "ev06_followup_nao",
  botaoSimTitulo: "Sim",
  botaoNaoTitulo: "Nao",
  statusPermitidos: ["EM_IA", "EM_ATENDIMENTO"],
});

export const CHAVES_CRM_FOLLOWUP = Object.freeze({
  limiteEnvios: "followup.limite_envios_por_rodada",
  encerrarAposMinutos: "followup.encerrar_pos_followup_minutos",
  janelaLivreMinutos: "followup.janela_texto_livre_minutos",
  botaoSimId: "followup.botao_sim_id",
  botaoNaoId: "followup.botao_nao_id",
  botaoSimTitulo: "followup.botao_sim_titulo",
  botaoNaoTitulo: "followup.botao_nao_titulo",
});
