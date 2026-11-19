package com.synapse.crm.app.inbox;

import static com.synapse.crm.app.seguranca.ApoioAutenticacao.EMAIL_ADMINISTRADOR;
import static com.synapse.crm.app.seguranca.ApoioAutenticacao.EMAIL_ANA;
import static com.synapse.crm.app.seguranca.ApoioAutenticacao.EMAIL_GESTOR;
import static com.synapse.crm.app.seguranca.ApoioAutenticacao.SENHA_ADMINISTRADOR;
import static com.synapse.crm.app.seguranca.ApoioAutenticacao.SENHA_ATENDENTE;
import static com.synapse.crm.app.seguranca.ApoioAutenticacao.SENHA_GESTOR;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.UUID;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.support.TransactionTemplate;

import com.synapse.crm.app.PostgresIT;
import com.synapse.crm.app.seguranca.ApoioAutenticacao;

/** Contrato HTTP da composição: participação e visibilidade são verificadas no caminho real. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "synapse.datasource.chat.hikari.connection-init-sql=SET statement_timeout = '2s'")
@ActiveProfiles("dev")
class InboxUnificadaControllerIT extends PostgresIT {
    private static final String MARCADOR = "E63-inbox-";

    @Autowired private TestRestTemplate http;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private ObjectMapper json;

    private UUID conversa;
    private UUID grupo;
    private UUID ana;
    private UUID bruno;
    private UUID leadDoBruno;
    private UUID atendimentoDoBruno;

    @BeforeEach
    void preparar() {
        ana = usuario(EMAIL_ANA);
        bruno = usuario("bruno@dev.local");
        UUID gestor = usuario(EMAIL_GESTOR);
        leadDoBruno = UUID.randomUUID();
        atendimentoDoBruno = UUID.randomUUID();
        UUID canal = jdbc.queryForObject("SELECT id FROM canal ORDER BY id LIMIT 1", UUID.class);
        jdbc.update("INSERT INTO lead(id,nome,atendente_responsavel_id,status_basico) VALUES (?, ?, ?, 'EM_ATENDIMENTO')",
                leadDoBruno, MARCADOR + "lead", bruno);
        jdbc.update("INSERT INTO atendimento(id,lead_id,canal_id,atendente_id,status) VALUES (?, ?, ?, ?, 'EM_ATENDIMENTO')",
                atendimentoDoBruno, leadDoBruno, canal, bruno);
        conversa = UUID.randomUUID();
        jdbc.update("INSERT INTO chat_interno_conversa(id,tipo) VALUES (?, 'DIRETA')", conversa);
        jdbc.update("INSERT INTO chat_interno_participante(conversa_id,usuario_id) VALUES (?,?), (?,?)",
                conversa, ana, conversa, bruno);
        jdbc.update("INSERT INTO chat_interno_participante(conversa_id,usuario_id) VALUES (?,?)",
                conversa, gestor);
        jdbc.update("INSERT INTO chat_interno_mensagem(id,conversa_id,remetente_id,tipo,conteudo) VALUES (?, ?, ?, 'TEXTO', ?)",
                UUID.randomUUID(), conversa, bruno, MARCADOR + "mensagem");
        grupo = UUID.randomUUID();
        jdbc.update("INSERT INTO chat_interno_conversa(id,tipo,nome) VALUES (?, 'GRUPO', ?)",
                grupo, MARCADOR + "grupo");
        jdbc.update("INSERT INTO chat_interno_participante(conversa_id,usuario_id) VALUES (?,?), (?,?)",
                grupo, ana, grupo, bruno);
        jdbc.update("INSERT INTO chat_interno_mensagem(id,conversa_id,remetente_id,tipo,conteudo) VALUES (?, ?, ?, 'TEXTO', ?)",
                UUID.randomUUID(), grupo, ana, MARCADOR + "mensagem grupo");
    }

    @AfterEach
    void limpar() {
        jdbc.update("DELETE FROM chat_interno_conversa WHERE id = ?", conversa);
        jdbc.update("DELETE FROM chat_interno_conversa WHERE id = ?", grupo);
        jdbc.update("DELETE FROM mensagem WHERE atendimento_id = ?", atendimentoDoBruno);
        jdbc.update("DELETE FROM atendimento WHERE id = ?", atendimentoDoBruno);
        jdbc.update("DELETE FROM lead WHERE id = ?", leadDoBruno);
    }

    @Test
    @DisplayName("participante de gestão recebe item discriminado e campos de cliente não aparecem")
    void participanteDeGestao_recebeEquipeNaInbox() throws Exception {
        JsonNode corpo = json.readTree(listarComo(EMAIL_GESTOR, SENHA_GESTOR));
        JsonNode item = encontrar(corpo, conversa.toString());

        assertThat(item.path("tipo").asText()).isEqualTo("EQUIPE_INTERNA");
        assertThat(item.path("conversaId").asText()).isEqualTo(conversa.toString());
        assertThat(item.has("leadId")).isFalse();
        assertThat(item.has("atendimentoId")).isFalse();
    }

    @Test
    @DisplayName("não participante, mesmo gestor, não recebe conversa interna")
    void gestorNaoParticipante_naoVeConversa() throws Exception {
        jdbc.update("DELETE FROM chat_interno_participante WHERE conversa_id = ? AND usuario_id = ?",
                conversa, usuario(EMAIL_GESTOR));
        JsonNode corpo = json.readTree(listarComo(EMAIL_GESTOR, SENHA_GESTOR));
        assertThat(encontrarOpcional(corpo, conversa.toString())).isFalse();
        assertThat(encontrarOpcional(corpo, grupo.toString())).isFalse();

        JsonNode administrador = json.readTree(listarComo(EMAIL_ADMINISTRADOR, SENHA_ADMINISTRADOR));
        assertThat(encontrarOpcional(administrador, conversa.toString())).isFalse();
        assertThat(encontrarOpcional(administrador, grupo.toString())).isFalse();
    }

    @Test
    @DisplayName("atendente não pode pedir TODOS na inbox unificada")
    void atendenteNaoPodePedirTodosNaInbox() {
        String token = ApoioAutenticacao.login(http, EMAIL_ANA, SENHA_ATENDENTE).accessToken();
        ResponseEntity<String> resposta = ApoioAutenticacao.comToken(
                http, token, HttpMethod.GET,
                "/api/v1/atendimentos/inbox?visao=TODOS&limite=50", String.class);

        assertThat(resposta.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    @DisplayName("a inbox mantém a visibilidade do cliente e mistura equipe em TODOS e ATIVOS")
    void preservaVisibilidadeDeClienteEVisao() throws Exception {
        JsonNode todos = json.readTree(listarComo(EMAIL_GESTOR, SENHA_GESTOR));
        assertThat(ids(todos)).contains(atendimentoDoBruno.toString());

        String token = ApoioAutenticacao.login(http, EMAIL_GESTOR, SENHA_GESTOR).accessToken();
        String ativos = ApoioAutenticacao.comToken(http, token, HttpMethod.GET,
                "/api/v1/atendimentos/inbox?visao=ATIVOS&limite=50", String.class).getBody();
        JsonNode ativosJson = json.readTree(ativos);
        assertThat(encontrarOpcional(ativosJson, conversa.toString())).isTrue();
        assertThat(quantidade(ativosJson, conversa.toString())).isEqualTo(1);
    }

    @Test
    @DisplayName("atendente participante vê conversa direta e grupo em ATIVOS")
    void atendenteParticipanteVeEquipeEmAtivos() throws Exception {
        JsonNode corpo = json.readTree(listarComo(EMAIL_ANA, SENHA_ATENDENTE, "ATIVOS"));

        JsonNode direta = encontrar(corpo, conversa.toString());
        JsonNode equipeGrupo = encontrar(corpo, grupo.toString());
        assertThat(direta.path("tipo").asText()).isEqualTo("EQUIPE_INTERNA");
        assertThat(equipeGrupo.path("tipo").asText()).isEqualTo("EQUIPE_INTERNA");
        assertThat(quantidade(corpo, conversa.toString())).isEqualTo(1);
        assertThat(quantidade(corpo, grupo.toString())).isEqualTo(1);
    }

    @Test
    @DisplayName("ATIVOS com RLS: ciclo de colega só aparece após participação consentida; empate não perde cartões")
    void paginaClienteEEquipeSemPerdaNoMesmoHorario() throws Exception {
        String token = ApoioAutenticacao.login(http, EMAIL_ANA, SENHA_ATENDENTE).accessToken();
        assertThat(ids(json.readTree(paginaAtiva(token, 100, null).getBody())))
                .doesNotContain(atendimentoDoBruno.toString());
        jdbc.update("""
                INSERT INTO atendimento_participante (atendimento_id, usuario_id, origem)
                VALUES (?, ?, 'CONVITE')
                """, atendimentoDoBruno, ana);
        jdbc.update("UPDATE chat_interno_mensagem SET enviado_em = statement_timestamp() WHERE conversa_id IN (?,?)",
                conversa, grupo);
        jdbc.update("""
                INSERT INTO mensagem (atendimento_id, remetente_tipo, tipo, conteudo, status_entrega, enviado_em)
                SELECT ?, 'LEAD', 'TEXTO', 'teste de cursor', 'ENTREGUE', enviado_em
                FROM chat_interno_mensagem WHERE conversa_id = ?
                """, atendimentoDoBruno, grupo);

        var todos = json.readTree(paginaAtiva(token, 100, null).getBody());
        var esperados = new ArrayList<String>();
        todos.path("itens").forEach(item -> esperados.add(item.path("identificadorVisual").asText()));
        assertThat(esperados).contains(conversa.toString(), grupo.toString(), atendimentoDoBruno.toString());
        var paginados = new ArrayList<String>();
        String cursor = null;
        do {
            var resposta = paginaAtiva(token, 1, cursor);
            assertThat(resposta.getStatusCode()).isEqualTo(HttpStatus.OK);
            var pagina = json.readTree(resposta.getBody());
            pagina.path("itens").forEach(item -> paginados.add(item.path("identificadorVisual").asText()));
            cursor = pagina.path("proximoCursor").asText(null);
            assertThat(paginados).hasSizeLessThanOrEqualTo(esperados.size());
        } while (cursor != null);
        assertThat(paginados).containsExactlyElementsOf(esperados).doesNotHaveDuplicates();
    }

    @Test
    @DisplayName("statement_timeout real retorna 503 em vez de página parcial; a leitura volta após o desbloqueio")
    void timeoutDaFonteDeClientesNaoProduzListaParcial() throws Exception {
        String token = ApoioAutenticacao.login(http, EMAIL_ANA, SENHA_ATENDENTE).accessToken();
        assertThat(paginaAtiva(token, 50, null).getStatusCode()).isEqualTo(HttpStatus.OK);
        var transacao = new TransactionTemplate(new DataSourceTransactionManager(jdbc.getDataSource()));
        ResponseEntity<String> falha = transacao.execute(tx -> {
            tx.setRollbackOnly();
            jdbc.execute("SET LOCAL lock_timeout = '3s'");
            jdbc.execute("LOCK TABLE mensagem IN ACCESS EXCLUSIVE MODE");
            return paginaAtiva(token, 50, null);
        });
        assertThat(falha.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(falha.getHeaders().getContentType().toString()).startsWith("application/problem+json");
        JsonNode erro = json.readTree(falha.getBody());
        assertThat(erro.path("codigo").asText()).isEqualTo("INBOX_INDISPONIVEL");
        assertThat(erro.has("itens")).isFalse();
        assertThat(erro.has("proximoCursor")).isFalse();

        var depois = paginaAtiva(token, 50, null);
        assertThat(depois.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(encontrarOpcional(json.readTree(depois.getBody()), conversa.toString())).isTrue();
    }

    private ResponseEntity<String> paginaAtiva(String token, int limite, String cursor) {
        return ApoioAutenticacao.comToken(http, token, HttpMethod.GET,
                "/api/v1/atendimentos/inbox?visao=ATIVOS&limite=" + limite
                        + (cursor == null ? "" : "&cursor=" + cursor), String.class);
    }

    @Test
    @DisplayName("conversa interna não aparece em PENDENTES ou POTENCIAIS")
    void equipeFicaForaDosRecortesDeClientes() throws Exception {
        String token = ApoioAutenticacao.login(http, EMAIL_GESTOR, SENHA_GESTOR).accessToken();
        for (String visao : java.util.List.of("PENDENTES", "POTENCIAIS")) {
            String resposta = ApoioAutenticacao.comToken(http, token, HttpMethod.GET,
                    "/api/v1/atendimentos/inbox?visao=" + visao + "&limite=50", String.class).getBody();
            JsonNode corpo = json.readTree(resposta);
            assertThat(encontrarOpcional(corpo, conversa.toString())).isFalse();
            assertThat(encontrarOpcional(corpo, grupo.toString())).isFalse();
        }
    }

    @Test
    @DisplayName("cliente mantém os campos exigidos pelo card da inbox")
    void clienteMantemContratoDoCartao() throws Exception {
        jdbc.update("""
                UPDATE atendimento SET em_negociacao = TRUE, resultado_venda = 'NAO_VENDEU',
                    venda_registrada_em = CURRENT_TIMESTAMP, origem_resultado_venda = 'AUTOMACAO'
                WHERE id = ?
                """, atendimentoDoBruno);
        JsonNode corpo = json.readTree(listarComo(EMAIL_GESTOR, SENHA_GESTOR));
        JsonNode item = encontrar(corpo, atendimentoDoBruno.toString());

        assertThat(item.path("tipo").asText()).isEqualTo("CLIENTE");
        assertThat(item.path("leadNome").asText()).isEqualTo(MARCADOR + "lead");
        assertThat(item.path("nome").asText()).isEqualTo(MARCADOR + "lead");
        assertThat(item.path("leadId").asText()).isEqualTo(leadDoBruno.toString());
        assertThat(item.path("emNegociacao").asBoolean()).isTrue();
        assertThat(item.path("resultadoVenda").asText()).isEqualTo("NAO_VENDEU");
        assertThat(item.path("origemResultadoVenda").asText()).isEqualTo("AUTOMACAO");
        assertThat(item.path("vendaRegistradaEm").asText()).isNotBlank();
        assertThat(item.has("vendaRegistradaPorId")).isFalse();
        assertThat(item.has("valorVenda")).isFalse();
    }

    @Test
    @DisplayName("endpoint exige autenticação")
    void semToken_devolve401() {
        ResponseEntity<String> resposta = http.exchange("/api/v1/atendimentos/inbox?limite=10",
                HttpMethod.GET, new HttpEntity<>(new HttpHeaders()), String.class);
        assertThat(resposta.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    private String listarComo(String email, String senha) {
        return listarComo(email, senha, "TODOS");
    }

    private String listarComo(String email, String senha, String visao) {
        String token = ApoioAutenticacao.login(http, email, senha).accessToken();
        return ApoioAutenticacao.comToken(http, token, HttpMethod.GET,
                "/api/v1/atendimentos/inbox?visao=" + visao + "&limite=50", String.class).getBody();
    }

    private UUID usuario(String email) {
        return jdbc.queryForObject("SELECT id FROM usuario WHERE email = ?", UUID.class, email);
    }

    private JsonNode encontrar(JsonNode itens, String id) {
        return java.util.stream.StreamSupport.stream(itens.path("itens").spliterator(), false)
                .filter(item -> id.equals(item.path("conversaId").asText())
                        || id.equals(item.path("atendimentoId").asText()))
                .findFirst().orElseThrow();
    }

    private boolean encontrarOpcional(JsonNode itens, String id) {
        return java.util.stream.StreamSupport.stream(itens.path("itens").spliterator(), false)
                .anyMatch(item -> id.equals(item.path("conversaId").asText()));
    }

    private long quantidade(JsonNode itens, String id) {
        return java.util.stream.StreamSupport.stream(itens.path("itens").spliterator(), false)
                .filter(item -> id.equals(item.path("conversaId").asText()))
                .count();
    }

    private java.util.Set<String> ids(JsonNode itens) {
        return java.util.stream.StreamSupport.stream(itens.path("itens").spliterator(), false)
                .map(item -> item.path("atendimentoId").asText())
                .collect(java.util.stream.Collectors.toSet());
    }
}
