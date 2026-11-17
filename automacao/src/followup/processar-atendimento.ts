import { avaliarFollowup, mesmaConversa } from "./avaliar.js";
import { codigoFalha, FalhaAtendimento, type FaseAtendimento } from "./falhas.js";
import type {
  AtendimentoFollowup,
  ConsultaAtendimentos,
  ControleFollowup,
  CrmFollowup,
  ProvedorFollowup,
  RegrasDaRodada,
} from "./contratos.js";
export class ProcessarAtendimento {
  constructor(
    private readonly consulta: ConsultaAtendimentos,
    private readonly controle: ControleFollowup,
    private readonly crm: CrmFollowup,
    private readonly provedor: ProvedorFollowup,
    private readonly agora: () => number = Date.now,
  ) { }
  private async permaneceIgual(a: AtendimentoFollowup): Promise<boolean> {
    const atual = await this.consulta.obter(a.id);
    return Boolean(atual &&
      mesmaConversa(a, atual) &&
      !(await this.controle.recusou(a.leadId)));
  }
  async executar(
    a: AtendimentoFollowup,
    config: RegrasDaRodada,
    rodadaId: string,
    verificarCoordenacao: () => void = () => { },
  ): Promise<string> {
    let fase: FaseAtendimento = "AVALIAR_ATENDIMENTO";
    try {
      verificarCoordenacao();
      const decisao = avaliarFollowup(
        a,
        config,
        await this.controle.envios(a.id),
        await this.controle.recusou(a.leadId),
        this.agora(),
      );
      if (decisao.acao === "IGNORAR")
        return decisao.motivo;
      if (decisao.acao === "ENCERRAR") {
        if (!(await this.permaneceIgual(a)))
          return "CONVERSA_MUDOU_ANTES_DE_ENCERRAR";
        verificarCoordenacao();
        fase = "FINALIZAR_CRM";
        await this.crm.finalizar(a.id, "followup-encerrar:" + decisao.envio.id);
        await this.controle.encerrado(decisao.envio.id);
        return "ENCERRADO_SEM_RESPOSTA";
      }
      if (!/^[+()\d\s-]+$/.test(a.telefone))
        return "TELEFONE_INVALIDO";
      const pedido = {
        telefone: a.telefone.replace(/\D/g, ""),
        texto: decisao.texto,
        botoes: config.botoes,
      };
      fase = "VALIDAR_DESTINATARIO";
      try {
        this.provedor.validar(pedido);
      } catch (error) {
        // Fora da lista e uma decisao esperada do teste, nao uma falha operacional.
        // Apenas esta causa e ignorada; os demais erros continuam interrompendo.
        if (error instanceof Error && error.message === "NUMERO_NAO_PERMITIDO")
          return "DESTINATARIO_FORA_DA_LISTA_PERMITIDA";
        throw error;
      }
      fase = "REVALIDAR_CONVERSA";
      if (!(await this.permaneceIgual(a)))
        return "CONVERSA_MUDOU_ANTES_DE_RESERVAR";
      fase = "RESERVAR_CONTROLE_LOCAL";
      if (!(await this.controle.consumirLimite(rodadaId, config.limiteEnvios)))
        return "LIMITE_DA_RODADA";
      const reserva = await this.controle.reservar(a, decisao, config.botoes, rodadaId);
      if (!reserva) {
        await this.controle.liberarLimite(rodadaId);
        return "RESERVA_LOCAL_NEGADA";
      }
      verificarCoordenacao();
      fase = "RESERVAR_ENVIO_CRM";
      const autorizacao = await this.crm.reservar(
        a.leadId,
        decisao.regra.id,
        decisao.ciclo,
        reserva.chave,
        rodadaId,
      );
      if (!autorizacao.podeEnviar) {
        // Cooldown/teto podem liberar depois. Chave ja usada NAO libera outro envio.
        const adiar = [
          "COOLDOWN",
          "TETO_DIARIO",
          "AUTOMACAO_PROATIVA_DESLIGADA",
          "TIPO_DESLIGADO",
        ].includes(autorizacao.motivo);
        await this.controle.marcar(reserva.id, adiar ? "ADIADO" : "NEGADO", autorizacao.motivo);
        await this.controle.liberarLimite(rodadaId);
        return "CRM_NEGOU_" + autorizacao.motivo;
      }
      fase = "REVALIDAR_CONVERSA";
      if (!(await this.permaneceIgual(a))) {
        await this.controle.marcar(reserva.id, "CANCELADO", "CONVERSA_MUDOU_APOS_RESERVA");
        await this.controle.liberarLimite(rodadaId);
        return "CONVERSA_MUDOU_APOS_RESERVA";
      }
      // Persistir ANTES de chamar o provedor protege o intervalo entre envio e comprovante.
      // Uma queda aqui deixa EM_ENVIO visivel para conciliacao, nunca para reenvio automatico.
      await this.controle.marcar(reserva.id, "EM_ENVIO");
      // A trava pertence a uma conexao dedicada. Se ela caiu, nao inicie outro efeito.
      verificarCoordenacao();
      let provedorId: string;
      try {
        provedorId = await this.provedor.enviar(pedido);
      }
      catch (error) {
        await this.controle.marcar(reserva.id, "INCERTO", "RESULTADO_DO_PROVEDOR_NAO_COMPROVADO_" + codigoFalha(error));
        return "ENVIO_INCERTO";
      }
      fase = "PERSISTIR_COMPROVANTE";
      const comprovante = await this.controle.comprovar(reserva.id, provedorId);
      try {
        const mensagemId = await this.crm.registrar(comprovante);
        await this.controle.registrado(reserva.id, mensagemId);
        return "ENVIADO_E_REGISTRADO";
      }
      catch (error) {
        // A proxima rodada repete apenas o registro CRM, usando o mesmo ID do provedor.
        await this.controle.marcar(reserva.id, "ENVIADO", "REGISTRO_CRM_PENDENTE_" + codigoFalha(error));
        return "ENVIADO_REGISTRO_CRM_PENDENTE";
      }
    }
    catch (error) {
      throw new FalhaAtendimento(fase, error);
    }
  }
  async recuperarRegistros(): Promise<number> {
    let recuperados = 0;
    for (const envio of await this.controle.pendentes(100)) {
      try {
        const mensagem = await this.crm.registrar(envio);
        await this.controle.registrado(envio.id, mensagem);
        recuperados++;
      }
      catch (error) {
        // Falha continua pendente. Nao transforma um registro faltante em outro envio.
        await this.controle.marcar(envio.id, "ENVIADO", "REGISTRO_CRM_PENDENTE_" + codigoFalha(error));
      }
    }
    return recuperados;
  }
}
