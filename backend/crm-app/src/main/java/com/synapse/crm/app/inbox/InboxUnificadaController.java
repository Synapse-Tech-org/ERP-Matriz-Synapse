package com.synapse.crm.app.inbox;

import java.util.UUID;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.TransientDataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.transaction.CannotCreateTransactionException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.synapse.crm.atendimento.application.painel.VisaoAtendimento;

@RestController
@RequestMapping("/api/v1/atendimentos/inbox")
@Tag(name = "Inbox unificada", description = "Conversas de clientes e equipe interna ordenadas por recência.")
@SecurityRequirement(name = "bearerAuth")
class InboxUnificadaController {
    private static final Logger LOG = LoggerFactory.getLogger(InboxUnificadaController.class);

    private final ListarInboxUnificadaUseCase listar;

    InboxUnificadaController(ListarInboxUnificadaUseCase listar) { this.listar = listar; }

    @GetMapping
    @Operation(summary = "Listar inbox unificada", description = "Retorna clientes visíveis e conversas internas das quais o usuário participa.")
    @ApiResponse(responseCode = "503", description = "Leitura temporariamente indisponível. Nenhuma página parcial é devolvida.")
    InboxUnificada listar(
            @Parameter(description = "Visão operacional; conversas internas aparecem em ATIVOS e TODOS.")
                    @RequestParam(defaultValue = "TODOS") VisaoAtendimento visao,
            @Parameter(description = "Quantidade por página, entre 1 e 100.")
                    @RequestParam(defaultValue = "50") int limite,
            @Parameter(description = "Cursor opaco devolvido pela página anterior.")
                    @RequestParam(required = false) String cursor,
            @Parameter(description = "Filtra os cartões pelo responsável. Em FINALIZADOS, filtra ciclos encerrados; em outras visões, filtra o cartão atual. Atendentes só podem informar o próprio ID nos finalizados.")
                    @RequestParam(required = false) UUID atendenteId) {
        return listar.executar(visao, limite, cursor, atendenteId);
    }

    @ExceptionHandler({TransientDataAccessException.class, DataAccessResourceFailureException.class,
            CannotCreateTransactionException.class})
    ProblemDetail indisponivel(RuntimeException erro) {
        LOG.warn("[INBOX_INDISPONIVEL] causa={}", erro.getClass().getSimpleName());
        ProblemDetail problema = ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE,
                "Não foi possível atualizar a lista de atendimentos. Tente novamente.");
        problema.setProperty("codigo", "INBOX_INDISPONIVEL");
        return problema;
    }
}
