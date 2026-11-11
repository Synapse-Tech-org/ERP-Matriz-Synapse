import type { Pool } from "pg";
import type { ConsultaAtendimentos, CrmFollowup } from "./contratos.js";
import type { ProcessarAtendimento } from "./processar-atendimento.js";
import { FalhaIntegracao } from "./http.js";

export interface OpcoesRodada {
  intervaloMinutos: number;
  pagina: number;
  retencaoDias: number;
}

export class ExecutarRodada {
  constructor(
    private readonly pool: Pool,
    private readonly consulta: ConsultaAtendimentos,
    private readonly crm: CrmFollowup,
    private readonly processador: ProcessarAtendimento,
    private readonly config: OpcoesRodada,
    private readonly parando: () => boolean,
  ) {}

  async executar(id: string): Promise<void> {
    const trava = await this.pool.connect();
    let bloqueou = false;
    let perdeuConexao = false;
    const aoPerderConexao = () => {
      perdeuConexao = true;
    };
    trava.on("error", aoPerderConexao);
    const verificarCoordenacao = () => {
      if (perdeuConexao || this.parando())
        throw new FalhaIntegracao("COORDENACAO_INTERROMPIDA");
    };
    try {
      const lock = await trava.query<{ ok: boolean }>(
        "SELECT pg_try_advisory_lock(hashtextextended('synapse:followup:rodada',0)) AS ok",
      );
      bloqueou = lock.rows[0]?.ok === true;
      if (!bloqueou || this.parando()) return;
      const existente = await this.pool.query(
        "SELECT cursor_id,ultimo_id,status FROM automacao_infra.followup_rodada WHERE id=$1",
        [id],
      );
      const anterior = await this.pool.query(
        "SELECT id,iniciado_em FROM automacao_infra.followup_rodada ORDER BY iniciado_em DESC LIMIT 1",
      );
      const ultima = anterior.rows[0];
      // Uma tentativa antiga nao abre novo orcamento depois de uma rodada mais recente.
      if (
        existente.rows[0] &&
        (existente.rows[0].status === "success" || (ultima && ultima.id !== id))
      )
        return;
      if (
        !existente.rows[0] &&
        ultima &&
        Date.now() - ultima.iniciado_em.getTime() <
          this.config.intervaloMinutos * 60000
      )
        return;
      let cursor: string | null = existente.rows[0]?.cursor_id || null;
      const ate: string | null =
        existente.rows[0]?.ultimo_id || (await this.consulta.ultimoId());
      await this.pool.query(
        `INSERT INTO automacao_infra.followup_rodada(id,ultimo_id) VALUES($1,$2)
        ON CONFLICT(id) DO UPDATE SET status='running',finalizado_em=NULL`,
        [id, ate],
      );
      // Temos a trava exclusiva: outra rodada ainda marcada running perdeu seu processo.
      await this.pool.query(
        "UPDATE automacao_infra.followup_rodada SET status='crashed',finalizado_em=now(),motivo='PROCESSO_INTERROMPIDO' WHERE status='running' AND id<>$1",
        [id],
      );
      try {
        const config = await this.crm.configuracao();
        await this.pool.query(
          "UPDATE automacao_infra.followup_rodada SET padroes_utilizados=$2::jsonb WHERE id=$1",
          [id, JSON.stringify(config.padroesUtilizados)],
        );
        await this.processador.recuperarRegistros();
        while (ate) {
          verificarCoordenacao();
          const pagina = await this.consulta.listar(
            cursor,
            this.config.pagina,
            ate,
          );
          if (!pagina.length) break;
          // Dois workers de candidatos; o coordenador persiste o cursor so depois
          // de ambos terminarem. Um replay da dupla e protegido pela reserva unica.
          for (let i = 0; i < pagina.length; i += 2) {
            verificarCoordenacao();
            const dupla = pagina.slice(i, i + 2);
            const resultados = await Promise.allSettled(
              dupla.map(async (a) => {
                const inicio = Date.now();
                let resultado: string;
                try {
                  resultado = await this.processador.executar(
                    a,
                    config,
                    id,
                    verificarCoordenacao,
                  );
                } catch (error) {
                  resultado =
                    error instanceof FalhaIntegracao
                      ? "FALHA_" + error.codigo
                      : "FALHA_NO_PROCESSAMENTO";
                }
                await this.pool.query(
                  `INSERT INTO automacao_infra.followup_etapa(rodada_id,atendimento_id,resultado,duracao_ms)
                VALUES($1,$2,$3,$4) ON CONFLICT(rodada_id,atendimento_id) DO UPDATE
                SET resultado=EXCLUDED.resultado,duracao_ms=EXCLUDED.duracao_ms,atualizado_em=now()`,
                  [id, a.id, resultado, Date.now() - inicio],
                );
              }),
            );
            // Mesmo sob falha de banco, espere o outro worker antes de soltar a trava.
            if (resultados.some((r) => r.status === "rejected"))
              throw new Error("PERSISTENCIA_DA_ETAPA_FALHOU");
            cursor = dupla[dupla.length - 1]!.id;
            await this.pool.query(
              "UPDATE automacao_infra.followup_rodada SET cursor_id=$2 WHERE id=$1",
              [id, cursor],
            );
          }
        }
        verificarCoordenacao();
        await this.pool.query(
          `UPDATE automacao_infra.followup_rodada SET finalizado_em=now(),
          status=CASE WHEN EXISTS(SELECT 1 FROM automacao_infra.followup_etapa WHERE rodada_id=$1
          AND (resultado LIKE 'FALHA_%' OR resultado IN ('ENVIO_INCERTO','ENVIADO_REGISTRO_CRM_PENDENTE'))) THEN 'error' ELSE 'success' END
          WHERE id=$1`,
          [id],
        );
        // Limpa apenas o historico detalhado. Recusas, comprovantes e chaves nunca sao apagados aqui.
        await this.pool.query(
          `DELETE FROM automacao_infra.followup_rodada r
          WHERE r.status IN ('success','error') AND r.finalizado_em < now()-($1*interval '1 day')
          AND NOT EXISTS(SELECT 1 FROM public.follow_ups_temporary f WHERE f.execucao_id=r.id::text
            AND (f.status IN ('RESERVADO','EM_ENVIO','INCERTO') OR (f.status='ENVIADO' AND f.crm_mensagem_id IS NULL)))`,
          [this.config.retencaoDias],
        );
      } catch (error) {
        await this.pool.query(
          "UPDATE automacao_infra.followup_rodada SET status='error',finalizado_em=now(),motivo='RODADA_INTERROMPIDA' WHERE id=$1",
          [id],
        );
        throw error;
      }
    } finally {
      try {
        if (bloqueou && !perdeuConexao)
          await trava.query(
            "SELECT pg_advisory_unlock(hashtextextended('synapse:followup:rodada',0))",
          );
      } catch {
        // Descartar a conexao fecha sua sessao e libera qualquer trava restante.
        perdeuConexao = true;
      } finally {
        trava.release(perdeuConexao);
        trava.removeListener("error", aoPerderConexao);
      }
    }
  }
}
