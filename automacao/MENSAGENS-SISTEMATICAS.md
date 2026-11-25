# Mensagens sistematicas: primeira entrega de homologacao

Aniversario, festiva e fidelizacao sao independentes. As mensagens, as datas e as faixas vem dos endpoints internos do CRM. Migrar a mensagem de reativacao da Data Table da Femina para uma regra de 90 dias no CRM e tarefa de configuracao antes da virada. Nao existe leitura de Data Tables no executor. Darwin, lembretes e confirmacao de consulta nao participam deste job.

## Contrato das regras

O executor le parametros de GET /internal/v1/automation-config a cada rodada. Chaves novas sao um contrato de consumo: este patch nao cadastra campos nem controles no CRM.

- fidelizacao.excluir_finalizados: ausente = true. Aplica-se somente a fidelizacao.
- sistematicas.somente_horario_comercial: ausente = false. Pode enviar qualquer dia/hora. Quando true, sistematicas.expediente precisa conter uma lista JSON de intervalos no fuso da instancia, por exemplo [{"dia":1,"inicio":"09:00","fim":"18:00"}]. Domingo = 0. Fim exclusivo. Intervalos faltantes ou invalidos nunca liberam envio.
- sistematicas.meta.template_nome, sistematicas.meta.template_idioma, sistematicas.meta.parametro_texto: exigidos para Meta. Na Estrutural o original usa interno_aniversario, pt_BR e texto. Os adaptadores de Z-API e Evolution enviam texto; nao tentam usar um template Meta.
- A inatividade vem da ultimaInteracaoEm do CRM, ou da criacao quando nula. Vale a maior faixa atingida na consulta; nao dispara todas as faixas atrasadas de uma vez. Cada faixa tem reserva propria no ciclo da ultima entrada do cliente (ou criacao). Registrar uma saida reinicia o prazo mas nao desbloqueia a mesma faixa.
- Aniversario: por lead e ano. Festiva: por lead, mensagem e dia. O CRM tem a palavra final sobre teto diario e intervalo. Sem atendimento para registrar, nao envia nem abre um novo por conta propria.

## Como homologar, sem expor outros contatos

Por padrao o executor nao inicia. Somente o servico automacao precisa receber AUTOMACAO_HABILITADA=true, AUTOMACAO_SISTEMATICAS_HABILITADAS=true e AUTOMACAO_NUMEROS_TESTE (lista de numeros internacionais completos separados por virgulas, sem '+' nem pontuacao). Mantem as configuracoes existentes do banco tecnico, CRM e canal. O fuso vem de SYNAPSE_TIMEZONE ou TZ. Nao alterar WHATSAPP_RESTRICAO_NUMEROS_HABILITADA: ela afeta webhooks do CRM. AUTOMACAO_RESTRICAO_NUMEROS_HABILITADA e true por padrao; false libera os candidatos elegiveis de ambos os modulos. Lista vazia com restricao ligada bloqueia todos. A Stack repassa essas envs ao container. Na aba Environment da homologacao, adicione as chaves ausentes ou edite seus valores, sem duplicar linhas.

Hora cheia: carregar configuracao, selecionar candidatos, personalizar, reservar no CRM, gravar tentativa no banco tecnico, enviar pelo canal escolhido, salvar o ID de aceite e registrar no atendimento. Timeout nao autoriza nova mensagem. Registro pendente e repetido sem repetir WhatsApp. Aceite nao prova entrega no aparelho.

A V11 do banco de automacao e aplicada pelo preparador da aplicacao. O painel lista as rodadas como Mensagens sistematicas. Homologar com credenciais da instancia de teste e destinatario controlado, conferir painel, CRM e aparelho. Antes de qualquer virada: verificar registros do n8n para nao repetir ocorrencias antigas, desligar o agendamento equivalente e aprovar o publico de producao. Nao habilitar os dois executores em paralelo para o mesmo publico.
