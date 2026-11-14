package com.synapse.crm.app.core;

import static com.synapse.crm.app.seguranca.ApoioAutenticacao.EMAIL_ANA;
import static com.synapse.crm.app.seguranca.ApoioAutenticacao.EMAIL_BRUNO;
import static com.synapse.crm.app.seguranca.ApoioAutenticacao.EMAIL_GESTOR;
import static com.synapse.crm.app.seguranca.ApoioAutenticacao.SENHA_ATENDENTE;
import static com.synapse.crm.app.seguranca.ApoioAutenticacao.SENHA_GESTOR;
import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

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
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import com.synapse.crm.app.PostgresIT;
import com.synapse.crm.app.seguranca.ApoioAutenticacao;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("dev")
class LembretesIT extends PostgresIT {
    @Autowired private TestRestTemplate http;
    @Autowired private JdbcTemplate jdbc;

    private UUID ana;
    private UUID bruno;
    private UUID leadAna;
    private UUID leadBruno;
    private UUID lembreteBruno;

    @BeforeEach
    void preparar() {
        ana = usuario(EMAIL_ANA);
        bruno = usuario(EMAIL_BRUNO);
        leadAna = lead("E13 lembrete Ana " + UUID.randomUUID(), ana);
        leadBruno = lead("E13 lembrete Bruno " + UUID.randomUUID(), bruno);
        lembreteBruno = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO lembrete (id, lead_id, atendente_id, texto, data_hora)
                VALUES (?, ?, ?, 'Privado do Bruno', ?)
                """, lembreteBruno, leadBruno, bruno, java.sql.Timestamp.from(Instant.parse("2026-08-05T14:00:00Z")));
    }

    @Test
    @DisplayName("CRUD persiste, conclui e remove lembrete sem aceitar origem automatica")
    void crudCompleto() {
        ResponseEntity<String> criada = chamar(EMAIL_ANA, SENHA_ATENDENTE, HttpMethod.POST,
                "/api/v1/lembretes", Map.of("leadId", leadAna, "texto", "Retornar proposta",
                        "dataHora", "2026-08-05T13:00:00Z"));
        assertThat(criada.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(criada.getBody()).contains("Retornar proposta").contains("\"origemAutomatica\":false");
        String id = criada.getBody().split("\"id\":\"")[1].split("\"")[0];

        ResponseEntity<String> atualizada = chamar(EMAIL_ANA, SENHA_ATENDENTE, HttpMethod.PUT,
                "/api/v1/lembretes/" + id, Map.of("texto", "Proposta retornada",
                        "dataHora", "2026-08-05T15:00:00Z", "status", "CONCLUIDO"));
        assertThat(atualizada.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(atualizada.getBody()).contains("Proposta retornada").contains("CONCLUIDO");

        assertThat(chamar(EMAIL_ANA, SENHA_ATENDENTE, HttpMethod.DELETE,
                "/api/v1/lembretes/" + id, null).getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM lembrete WHERE id = ?", Integer.class,
                UUID.fromString(id))).isZero();
    }

    @Test
    void criaLembretePessoalSemVinculoEProtegeDeOutroAtendente() {
        String texto = "Lembrete pessoal " + UUID.randomUUID();
        var criado = chamar(EMAIL_ANA, SENHA_ATENDENTE, HttpMethod.POST, "/api/v1/lembretes",
                Map.of("texto", texto, "dataHora", "2026-08-05T13:00:00Z"));
        assertThat(criado.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(criado.getBody()).contains(texto);
        assertThat(chamar(EMAIL_BRUNO, SENHA_ATENDENTE, HttpMethod.GET,
                "/api/v1/lembretes", null).getBody()).doesNotContain(texto);
    }

    @Test
    void atribuicaoExigeGestaoEResponsavelAtivo() {
        var dados = Map.of("leadId", leadAna, "responsavelId", bruno, "texto", "Responsável escolhido",
                "dataHora", "2026-08-05T13:00:00Z");
        assertThat(chamar(EMAIL_ANA, SENHA_ATENDENTE, HttpMethod.POST, "/api/v1/lembretes", dados).getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);
        var desconhecido = Map.of("responsavelId", UUID.randomUUID(), "texto", "Responsável inexistente",
                "dataHora", "2026-08-05T13:00:00Z");
        assertThat(chamar(EMAIL_GESTOR, SENHA_GESTOR, HttpMethod.POST, "/api/v1/lembretes", desconhecido).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
        var criado = chamar(EMAIL_GESTOR, SENHA_GESTOR, HttpMethod.POST, "/api/v1/lembretes", dados);
        assertThat(criado.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(criado.getBody()).contains(bruno.toString());
        String id = criado.getBody().split("\"id\":\"")[1].split("\"")[0];
        var alteracao = Map.of("responsavelId", ana, "texto", "Responsável alterado",
                "dataHora", "2026-08-05T13:00:00Z", "status", "PENDENTE");
        assertThat(chamar(EMAIL_BRUNO, SENHA_ATENDENTE, HttpMethod.PUT, "/api/v1/lembretes/" + id, alteracao).getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(chamar(EMAIL_GESTOR, SENHA_GESTOR, HttpMethod.PUT, "/api/v1/lembretes/" + id, alteracao).getBody())
                .contains(ana.toString());
    }

    @Test
    void exclusaoReversivelSomeDaListaEExigeAutorEChave() {
        String rota = "/api/v1/lembretes/" + lembreteBruno;
        String chave = UUID.randomUUID().toString();
        String exclusao = rota + "?chaveExclusao=" + chave;
        String restauracao = rota + "/restaurar?chaveExclusao=";
        assertThat(chamar(EMAIL_BRUNO, SENHA_ATENDENTE, HttpMethod.DELETE, exclusao, null).getStatusCode())
                .isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(chamar(EMAIL_BRUNO, SENHA_ATENDENTE, HttpMethod.DELETE, exclusao, null).getStatusCode())
                .isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(chamar(EMAIL_BRUNO, SENHA_ATENDENTE, HttpMethod.GET,
                "/api/v1/lembretes?leadId=" + leadBruno + "&incluirResumo=true", null).getBody())
                .doesNotContain(lembreteBruno.toString()).contains("\"pendentes\":0");
        assertThat(chamar(EMAIL_GESTOR, SENHA_GESTOR, HttpMethod.POST, restauracao + chave, null).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(chamar(EMAIL_BRUNO, SENHA_ATENDENTE, HttpMethod.POST,
                restauracao + UUID.randomUUID(), null).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(chamar(EMAIL_BRUNO, SENHA_ATENDENTE, HttpMethod.POST, restauracao + chave, null).getStatusCode())
                .isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(chamar(EMAIL_BRUNO, SENHA_ATENDENTE, HttpMethod.GET,
                "/api/v1/lembretes?leadId=" + leadBruno, null).getBody()).contains(lembreteBruno.toString());

        String novaChave = UUID.randomUUID().toString();
        assertThat(chamar(EMAIL_BRUNO, SENHA_ATENDENTE, HttpMethod.DELETE,
                rota + "?chaveExclusao=" + novaChave, null).getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(chamar(EMAIL_BRUNO, SENHA_ATENDENTE, HttpMethod.POST, restauracao + chave, null).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
        jdbc.update("UPDATE lembrete SET excluido_em = statement_timestamp() - interval '31 seconds' WHERE id = ?", lembreteBruno);
        assertThat(chamar(EMAIL_BRUNO, SENHA_ATENDENTE, HttpMethod.POST, restauracao + novaChave, null).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    @DisplayName("RN-CRM-04: atendente NAO lista, altera, remove nem cria no lead do colega")
    void negativoPrivacidadeDoAtendente() {
        String listaAna = chamar(EMAIL_ANA, SENHA_ATENDENTE, HttpMethod.GET,
                "/api/v1/lembretes?status=PENDENTE", null).getBody();
        assertThat(listaAna).doesNotContain(lembreteBruno.toString()).doesNotContain("Privado do Bruno");

        var corpo = Map.of("texto", "Tentativa", "dataHora", "2026-08-05T16:00:00Z",
                "status", "CONCLUIDO");
        assertThat(chamar(EMAIL_ANA, SENHA_ATENDENTE, HttpMethod.PUT,
                "/api/v1/lembretes/" + lembreteBruno, corpo).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(chamar(EMAIL_ANA, SENHA_ATENDENTE, HttpMethod.DELETE,
                "/api/v1/lembretes/" + lembreteBruno, null).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(chamar(EMAIL_ANA, SENHA_ATENDENTE, HttpMethod.POST, "/api/v1/lembretes",
                Map.of("leadId", leadBruno, "texto", "Invadir agenda",
                        "dataHora", "2026-08-05T17:00:00Z")).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);

        assertThat(jdbc.queryForObject("SELECT texto FROM lembrete WHERE id = ?", String.class,
                lembreteBruno)).isEqualTo("Privado do Bruno");
    }

    @Test
    @DisplayName("gestor ve todos e a coluna de origem identifica o atendente")
    void gestorVeTodosComOrigem() {
        String lista = chamar(EMAIL_GESTOR, SENHA_GESTOR, HttpMethod.GET,
                "/api/v1/lembretes", null).getBody();
        assertThat(lista).contains(lembreteBruno.toString()).contains("Bruno Atendente");
    }

    @Test
    void buscaEOrigemFiltramNaOrigemSemExporLembreteDeOutroAtendente() {
        jdbc.update("UPDATE lembrete SET origem_automatica = TRUE WHERE id = ?", lembreteBruno);
        String rota = "/api/v1/lembretes?leadId=" + leadBruno + "&atendenteId=" + bruno;
        assertThat(chamar(EMAIL_GESTOR, SENHA_GESTOR, HttpMethod.GET,
                rota + "&busca=pRiVaDo&origemAutomatica=true", null).getBody()).contains(lembreteBruno.toString());
        assertThat(chamar(EMAIL_GESTOR, SENHA_GESTOR, HttpMethod.GET,
                rota + "&busca=pRiVaDo&origemAutomatica=false", null).getBody()).doesNotContain(lembreteBruno.toString());
        assertThat(chamar(EMAIL_GESTOR, SENHA_GESTOR, HttpMethod.GET,
                rota + "&busca=E13", null).getBody()).contains(lembreteBruno.toString());
        assertThat(chamar(EMAIL_ANA, SENHA_ATENDENTE, HttpMethod.GET,
                rota + "&busca=privado&origemAutomatica=true", null).getBody()).doesNotContain(lembreteBruno.toString());
    }

    @Test
    void resumoContaPendentesAutorizadosMesmoComFiltroDeConcluidos() {
        jdbc.update("UPDATE lembrete SET origem_automatica = TRUE WHERE id = ?", lembreteBruno);
        String rota = "/api/v1/lembretes?leadId=" + leadBruno + "&status=CONCLUIDO&incluirResumo=true";
        var gestor = chamar(EMAIL_GESTOR, SENHA_GESTOR, HttpMethod.GET, rota, null);
        assertThat(gestor.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(gestor.getBody()).contains("\"lembretes\":[]", "\"pendentes\":1", "\"automaticos\":1");
        var colega = chamar(EMAIL_ANA, SENHA_ATENDENTE, HttpMethod.GET, rota, null);
        assertThat(colega.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(colega.getBody()).contains("\"pendentes\":0", "\"automaticos\":0");
    }

    private ResponseEntity<String> chamar(String email, String senha, HttpMethod metodo, String url, Object corpo) {
        String token = ApoioAutenticacao.login(http, email, senha).accessToken();
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        headers.setContentType(MediaType.APPLICATION_JSON);
        return http.exchange(url, metodo, new HttpEntity<>(corpo, headers), String.class);
    }

    private UUID usuario(String email) {
        return jdbc.queryForObject("SELECT id FROM usuario WHERE email = ?", UUID.class, email);
    }

    private UUID lead(String nome, UUID dono) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO lead (id, nome, atendente_responsavel_id, status_basico) VALUES (?, ?, ?, 'EM_ATENDIMENTO')",
                id, nome, dono);
        return id;
    }
}
