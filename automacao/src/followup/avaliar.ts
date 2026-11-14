import { PADROES_FOLLOWUP } from "./padroes.js";
import type {
  AtendimentoFollowup,
  DecisaoFollowup,
  EnvioRegistrado,
  RegrasDaRodada,
} from "./contratos.js";

export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function renderizar(texto: string, nome: string): string {
  const contato = nome.trim() || PADROES_FOLLOWUP.nomeContato;
  const substituir = (_todo: string, campo: string) =>
    campo.toLowerCase() === "primeiro_nome"
      ? contato.split(/\s+/)[0]!
      : contato;
  // O cadastro legado usa {nome}; aceitar tambem {{nome}} evita quebrar regras novas.
  return texto
    .replace(/\{\{\s*(nome|primeiro_nome)\s*\}\}/gi, substituir)
    .replace(/\{\s*(nome|primeiro_nome)\s*\}/gi, substituir);
}

export function mesmaConversa(
  a: AtendimentoFollowup,
  b: AtendimentoFollowup,
): boolean {
  // Duas mensagens diferentes podem ter o mesmo timestamp.
  return (
    a.id === b.id &&
    a.leadId === b.leadId &&
    a.status === b.status &&
    a.telefone === b.telefone &&
    a.nome === b.nome &&
    a.ultima?.id === b.ultima?.id &&
    a.ultima?.em === b.ultima?.em &&
    a.ultima?.texto === b.ultima?.texto &&
    a.ultima?.status === b.ultima?.status &&
    a.ultimaDoLead?.id === b.ultimaDoLead?.id
  );
}

export function avaliarFollowup(
  atendimento: AtendimentoFollowup,
  config: RegrasDaRodada,
  envios: EnvioRegistrado[],
  recusou: boolean,
  agora: number,
): DecisaoFollowup {
  const ignorar = (motivo: string): DecisaoFollowup => ({
    acao: "IGNORAR",
    motivo,
  });
  if (recusou) return ignorar("RECUSA_REGISTRADA");
  if (config.leadTeste && atendimento.leadId !== config.leadTeste)
    return ignorar("FORA_DO_LEAD_TESTE");
  if (!PADROES_FOLLOWUP.statusPermitidos.includes(atendimento.status))
    return ignorar("ATENDIMENTO_NAO_ATIVO");
  const { ultima, ultimaDoLead } = atendimento;
  if (!ultima || !ultimaDoLead) return ignorar("SEM_HISTORICO_DO_CLIENTE");
  if (!["ATENDENTE", "IA"].includes(ultima.remetente))
    return ignorar("ULTIMA_MENSAGEM_NAO_E_DA_EQUIPE");
  if (!["ENVIADO", "ENTREGUE", "LIDO"].includes(ultima.status))
    return ignorar("ULTIMA_MENSAGEM_NAO_ENVIADA");
  const base = Date.parse(ultima.em),
    lead = Date.parse(ultimaDoLead.em);
  if (
    !Number.isFinite(base) ||
    !Number.isFinite(lead) ||
    base > agora ||
    lead > base
  )
    return ignorar("DATAS_INVALIDAS");
  const ciclo = new Date(lead).toISOString();
  const anteriores = envios.filter((e) => e.ciclo === ciclo);
  // Reserva interrompida nao prova que a mensagem nao saiu. Nunca reenvie no escuro.
  if (
    anteriores.some((e) =>
      ["RESERVADO", "EM_ENVIO", "INCERTO"].includes(e.status),
    )
  )
    return ignorar("ENVIO_PENDENTE_OU_INCERTO");
  const texto = normalizarTexto(ultima.texto);
  const comprovado = anteriores.find(
    (e) =>
      e.status === "ENVIADO" &&
      e.enviadoEm &&
      normalizarTexto(e.texto) === texto,
  );
  const reconhecido =
    Boolean(comprovado) ||
    config.regras.some(
      (r) => normalizarTexto(renderizar(r.texto, atendimento.nome)) === texto,
    );
  if (reconhecido) {
    // O relogio comeca no comprovante, nunca na hora em que o worker reiniciou.
    if (
      comprovado &&
      !comprovado.encerradoEm &&
      comprovado.crmMensagemId === ultima.id &&
      config.encerrarAposMinutos > 0 &&
      agora - Date.parse(comprovado.enviadoEm!) >=
        config.encerrarAposMinutos * 60000
    ) {
      return { acao: "ENCERRAR", envio: comprovado };
    }
    return ignorar("ULTIMA_MENSAGEM_JA_E_FOLLOWUP");
  }
  if (config.exigeJanela && agora - lead >= config.janelaLivreMinutos * 60000)
    return ignorar("JANELA_LIVRE_FECHADA");
  const usadas = new Set(
    anteriores.filter((e) => e.status !== "ADIADO").map((e) => e.regraId),
  );
  const regra = [...config.regras]
    .sort((a, b) => a.tempoMinutos - b.tempoMinutos || a.id.localeCompare(b.id))
    .find((r) => !usadas.has(r.id) && agora - base >= r.tempoMinutos * 60000);
  if (!regra) return ignorar("SEM_REGRA_VENCIDA_NAO_ENVIADA");
  const mensagem = renderizar(regra.texto, atendimento.nome);
  if (/\{\{.*?\}\}|\{\s*[a-z_]+\s*\}/i.test(mensagem))
    return ignorar("VARIAVEL_DE_TEXTO_DESCONHECIDA");
  return { acao: "ENVIAR", regra, texto: mensagem, ciclo };
}
