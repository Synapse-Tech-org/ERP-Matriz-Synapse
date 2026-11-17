export function explicarResultado(resultado: string): string {
  const textos: Record<string, string> = {
    ENVIADO_E_REGISTRADO: "Aceito pelo provedor e registrado no CRM. Entrega e leitura ainda nao comprovadas.",
    ENVIADO_REGISTRO_CRM_PENDENTE: "O provedor aceitou o envio, mas o registro no CRM falhou. Recuperar apenas o registro; nao reenviar a mensagem.",
    ENVIO_INCERTO: "Nao foi possivel comprovar o resultado do envio. Conferir o provedor antes de qualquer nova tentativa.",
    JANELA_LIVRE_FECHADA: "Sem envio: passou a janela de mensagem livre aplicada ao atendimento.",
    LIMITE_DA_RODADA: "Sem envio: o limite de tentativas desta rodada foi atingido.",
    SEM_HISTORICO_DO_CLIENTE: "Sem envio: falta mensagem do cliente ou historico suficiente.",
    ULTIMA_MENSAGEM_NAO_ENVIADA: "Sem envio: a ultima mensagem nao tem status enviado, entregue ou lido.",
    ULTIMA_MENSAGEM_NAO_E_DA_EQUIPE: "Sem envio: a ultima mensagem e do cliente, nao da equipe ou IA.",
    ULTIMA_MENSAGEM_JA_E_FOLLOWUP: "Sem novo envio: a ultima mensagem ja foi reconhecida como follow-up.",
    RECUSA_REGISTRADA: "Sem envio: ha recusa de follow-up registrada para o lead.",
    DESTINATARIO_FORA_DA_LISTA_PERMITIDA: "Sem envio: destinatario fora da lista permitida. Bloqueio esperado do teste, nao falha do WhatsApp.",
    ENCERRADO_SEM_RESPOSTA: "O atendimento foi finalizado pela regra de prazo sem resposta.",
  };
  if (textos[resultado]) return textos[resultado];
  const causas: Record<string, string> = {
    RESERVA_CONFLITANTE: "O CRM informou conflito na chave de envio. Conferir a reserva e o atendimento associado; nao reenviar.",
    WAMID_OUTRO_ATENDIMENTO: "O CRM informou que o ID do provedor ja pertence a outro atendimento.",
    ATENDIMENTO_NAO_ENCONTRADO: "O CRM informou que o atendimento nao existe ou nao esta acessivel para esta chamada.",
    WAMID_OBRIGATORIO: "O CRM rejeitou o registro porque o ID do provedor nao foi informado.",
    CHAVE_ENVIO_INVALIDA: "O CRM rejeitou uma chave de envio vazia ou maior que 200 caracteres.",
    TIPO_OBRIGATORIO: "O CRM rejeitou o registro porque o tipo da mensagem nao foi informado.",
    CONTEUDO_OBRIGATORIO: "O CRM rejeitou uma mensagem TEXTO sem conteudo.",
    MIDIA_OBRIGATORIA: "O CRM rejeitou uma mensagem de midia sem referencia de midia.",
    OPCOES_OBRIGATORIAS: "O CRM rejeitou uma mensagem interativa sem opcoes.",
  };
  for (const [codigo, descricao] of Object.entries(causas)) {
    if (resultado.endsWith("_" + codigo)) return descricao;
  }
  if (resultado.includes("NUMERO_NAO_PERMITIDO"))
    return "Envio bloqueado: o numero nao pertence a lista permitida carregada pelo executor.";
  if (resultado.includes("HTTP_401") || resultado.includes("HTTP_403"))
    return "Falha de autenticacao ou permissao na integracao indicada. Conferir a credencial sem repetir envios aceitos.";
  if (resultado.includes("HTTP_404"))
    return "A integracao retornou recurso nao encontrado. Conferir rota/base e existencia do recurso.";
  if (resultado.includes("HTTP_400"))
    return "A integracao rejeitou os dados da requisicao. O codigo nao informa sozinho qual campo foi recusado.";
  if (/FALHA|INCERTO|PENDENTE|INTERROMPID/.test(resultado))
    return "Falha ou resultado pendente. O codigo e os comprovantes abaixo delimitam o que pode ser recuperado sem duplicar envio.";
  return "Atendimento avaliado. Consulte o codigo para identificar a decisao da rodada.";
}
