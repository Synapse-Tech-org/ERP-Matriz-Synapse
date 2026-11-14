package com.synapse.crm.core.infrastructure.persistencia.mensagemprogramada;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import javax.sql.DataSource;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import com.synapse.crm.core.application.mensagemprogramada.FiltroMensagensProgramadas;
import com.synapse.crm.core.application.mensagemprogramada.MensagemProgramadaRepositorio;
import com.synapse.crm.core.application.mensagemprogramada.PaginaMensagensProgramadas;
import com.synapse.crm.core.domain.mensagemprogramada.MensagemProgramada;
import com.synapse.crm.core.domain.mensagemprogramada.StatusMensagemProgramada;
import com.synapse.crm.core.infrastructure.persistencia.TransacaoObrigatoria;
import com.synapse.crm.sharedkernel.persistencia.Pools;

@Repository
class MensagemProgramadaRepositorioJdbc implements MensagemProgramadaRepositorio {
    private static final String PERMITIDA = """
            AND NOT EXISTS(SELECT 1 FROM canal_transicao WHERE estado<>'ATIVA')
            AND NOT EXISTS(SELECT 1 FROM canal_transicao_programada b
              WHERE b.programada_id=mensagem_programada.id AND b.liberada_em IS NULL)
            """;
    private final JdbcTemplate jdbc;
    private final JdbcTemplate chat;
    MensagemProgramadaRepositorioJdbc(
            JdbcTemplate jdbc, @Qualifier(Pools.CHAT_DATA_SOURCE) DataSource chatDataSource) {
        this.jdbc = jdbc;
        this.chat = new JdbcTemplate(chatDataSource);
    }

    @Override
    public PaginaMensagensProgramadas listar(FiltroMensagensProgramadas filtro, boolean incluirResumo) {
        TransacaoObrigatoria.exigir("listar mensagens programadas");
        var recorte = new StringBuilder(" WHERE TRUE");
        List<Object> parametros = new ArrayList<>();
        if (filtro.inicio() != null) {
            recorte.append(" AND m.data_envio >= ?");
            parametros.add(Timestamp.from(filtro.inicio()));
        }
        if (filtro.fim() != null) {
            recorte.append(" AND m.data_envio <= ?");
            parametros.add(Timestamp.from(filtro.fim()));
        }
        if (filtro.leadId() != null) {
            recorte.append(" AND m.lead_id = ?");
            parametros.add(filtro.leadId());
        }
        if (filtro.atendenteId() != null) {
            recorte.append(" AND m.atendente_id = ?");
            parametros.add(filtro.atendenteId());
        }
        PaginaMensagensProgramadas.Resumo resumo = incluirResumo
                ? resumir(recorte.toString(), parametros) : null;
        var sql = new StringBuilder(BASE).append(recorte);
        if (filtro.status() != null) {
            sql.append(" AND m.status = CAST(? AS status_msg_prog)");
            parametros.add(filtro.status().name());
        }
        sql.append(incluirResumo && filtro.status() == StatusMensagemProgramada.ENVIADA
                ? " ORDER BY m.data_envio DESC, m.id DESC LIMIT ? OFFSET ?"
                : " ORDER BY m.data_envio, m.id LIMIT ? OFFSET ?");
        parametros.add(filtro.tamanho() + 1);
        parametros.add(Math.multiplyExact(filtro.pagina(), filtro.tamanho()));
        List<MensagemProgramada> itens = jdbc.query(sql.toString(), MensagemProgramadaRepositorioJdbc::mapear,
                parametros.toArray());
        boolean mais = itens.size() > filtro.tamanho();
        if (mais) itens = new ArrayList<>(itens.subList(0, filtro.tamanho()));
        return new PaginaMensagensProgramadas(itens, filtro.pagina(), mais, resumo);
    }

    private PaginaMensagensProgramadas.Resumo resumir(String recorte, List<Object> parametros) {
        return jdbc.queryForObject("""
                SELECT count(*) FILTER (WHERE m.status = 'AGENDADA') AS agendadas,
                       count(*) FILTER (WHERE m.status = 'ENVIADA') AS enviadas,
                       count(*) FILTER (WHERE m.status = 'CANCELADA') AS canceladas,
                       count(*) AS total
                  FROM mensagem_programada m JOIN lead l ON l.id = m.lead_id JOIN usuario u ON u.id = m.atendente_id
                """ + recorte, (linha, indice) -> new PaginaMensagensProgramadas.Resumo(
                        linha.getLong("agendadas"), linha.getLong("enviadas"),
                        linha.getLong("canceladas"), linha.getLong("total")), parametros.toArray());
    }

    @Override public MensagemProgramada criar(UUID leadId, UUID atendenteId, String conteudo, Instant dataEnvio) {
        TransacaoObrigatoria.exigir("criar mensagem programada"); UUID id=UUID.randomUUID();
        jdbc.update("INSERT INTO mensagem_programada(id,lead_id,atendente_id,conteudo,data_envio,status) VALUES(?,?,?,?,?,'AGENDADA')",
                id,leadId,atendenteId,conteudo,Timestamp.from(dataEnvio)); return porIdVisivel(id).orElseThrow();
    }
    @Override public Optional<MensagemProgramada> porIdVisivel(UUID id) { return jdbc.query(BASE+" WHERE m.id=?",MensagemProgramadaRepositorioJdbc::mapear,id).stream().findFirst(); }
    @Override public Optional<MensagemProgramada> atualizarAgendada(UUID id,String conteudo,Instant dataEnvio) {
        TransacaoObrigatoria.exigir("atualizar mensagem programada");
        int n=jdbc.update("UPDATE mensagem_programada SET conteudo=?,data_envio=? WHERE id=? AND status='AGENDADA'",conteudo,Timestamp.from(dataEnvio),id);
        return n==0?Optional.empty():porIdVisivel(id);
    }
    @Override
    public Optional<MensagemProgramada> anteciparAgendada(UUID id, Instant agora) {
        TransacaoObrigatoria.exigir("antecipar mensagem programada");
        int alteradas = jdbc.update("""
                UPDATE mensagem_programada SET data_envio = LEAST(data_envio, ?)
                 WHERE id = ? AND status = 'AGENDADA'
                """, Timestamp.from(agora), id);
        return alteradas == 0 ? Optional.empty() : porIdVisivel(id);
    }

    @Override public Optional<MensagemProgramada> cancelarAgendada(UUID id) {
        TransacaoObrigatoria.exigir("cancelar mensagem programada");
        int n=jdbc.update("UPDATE mensagem_programada SET status='CANCELADA' WHERE id=? AND status='AGENDADA'",id);
        return n==0?Optional.empty():porIdVisivel(id);
    }

    @Override
    public List<UUID> idsVencidos(Instant agora, int limite) {
        TransacaoObrigatoria.exigir("listar mensagens programadas vencidas");
        return chat.query(
                "SELECT id FROM mensagem_programada WHERE status='AGENDADA' AND data_envio<=? " + PERMITIDA + " ORDER BY data_envio,id LIMIT ?",
                (r, i) -> r.getObject(1, UUID.class), Timestamp.from(agora), limite);
    }

    @Override
    public Optional<MensagemProgramada> reservarVencida(UUID id, Instant agora) {
        TransacaoObrigatoria.exigir("reservar mensagem programada");
        return chat.query(
                        """
                        UPDATE mensagem_programada
                           SET status='ENVIADA'
                         WHERE id=? AND status='AGENDADA' AND data_envio<=?
                        """ + PERMITIDA + " RETURNING id,lead_id,atendente_id,conteudo,data_envio,status::text",
                        MensagemProgramadaRepositorioJdbc::mapearReservada,
                        id,
                        Timestamp.from(agora))
                .stream()
                .findFirst();
    }

    private static final String BASE="""
            SELECT m.id,m.lead_id,l.nome lead_nome,m.atendente_id,u.nome atendente_nome,
                   m.conteudo,m.data_envio,m.status::text
              FROM mensagem_programada m JOIN lead l ON l.id=m.lead_id JOIN usuario u ON u.id=m.atendente_id
            """;
    private static MensagemProgramada mapear(ResultSet r,int i)throws SQLException{return new MensagemProgramada(
            r.getObject("id",UUID.class),r.getObject("lead_id",UUID.class),r.getString("lead_nome"),
            r.getObject("atendente_id",UUID.class),r.getString("atendente_nome"),r.getString("conteudo"),
            r.getTimestamp("data_envio").toInstant(),StatusMensagemProgramada.valueOf(r.getString("status")));}

    private static MensagemProgramada mapearReservada(ResultSet r, int i) throws SQLException {
        return new MensagemProgramada(
                r.getObject("id", UUID.class),
                r.getObject("lead_id", UUID.class),
                null,
                r.getObject("atendente_id", UUID.class),
                null,
                r.getString("conteudo"),
                r.getTimestamp("data_envio").toInstant(),
                StatusMensagemProgramada.valueOf(r.getString("status")));
    }
}
