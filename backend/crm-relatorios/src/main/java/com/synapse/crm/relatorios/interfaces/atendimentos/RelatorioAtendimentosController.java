package com.synapse.crm.relatorios.interfaces.atendimentos;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.synapse.crm.relatorios.application.atendimentos.ConsultarRelatorioAtendimentosUseCase;
import com.synapse.crm.relatorios.application.atendimentos.ExportarRelatorioAtendimentosUseCase;
import com.synapse.crm.relatorios.domain.atendimentos.FiltroRelatorioAtendimentos;
import com.synapse.crm.relatorios.domain.atendimentos.RelatorioAtendimentos;

@RestController
@RequestMapping("/api/v1/relatorios/atendimentos")
@SecurityRequirement(name = "bearerAuth")
class RelatorioAtendimentosController {
    private static final int LIMITE_EXPORTACAO = 5_000;
    private final ConsultarRelatorioAtendimentosUseCase consultar;
    private final ExportarRelatorioAtendimentosUseCase exportar;

    RelatorioAtendimentosController(ConsultarRelatorioAtendimentosUseCase consultar,
            ExportarRelatorioAtendimentosUseCase exportar) {
        this.consultar = consultar;
        this.exportar = exportar;
    }

    @GetMapping
    @Operation(
            summary = "Consultar histórico paginado de atendimentos e indicadores do período",
            description = "Retorna os atendimentos visíveis e os indicadores do recorte por período, cliente, status, etapa ou responsável.")
    RelatorioAtendimentos consultar(@ModelAttribute Filtros filtros,
            @RequestParam(defaultValue = "0") int pagina,
            @RequestParam(defaultValue = "20") int tamanho) {
        return consultar.executar(filtros.entrada(), pagina, tamanho);
    }

    @GetMapping("/exportacao")
    @Operation(
            summary = "Exportar CSV do mesmo recorte de atendimentos, até 5.000 linhas",
            description = "Exporta os registros autorizados que correspondem aos filtros da lista. Retorna 422 se o recorte ultrapassar 5.000 registros.")
    ResponseEntity<byte[]> exportar(@ModelAttribute Filtros filtros) {
        var linhas = exportar.executar(filtros.entrada(), LIMITE_EXPORTACAO + 1);
        if (linhas.size() > LIMITE_EXPORTACAO) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Reduza o período ou refine os filtros.");
        }
        var csv = new StringBuilder("\ufeffProtocolo;Cliente;Empresa;Atendente;Etapa;Status;Início;Término;Duração (s);CSAT\r\n");
        for (var linha : linhas) {
            csv.append(Stream.of(linha.id(), linha.cliente(), linha.empresa(), linha.atendente(), linha.etapa(),
                    linha.status(), linha.iniciadoEm(), linha.finalizadoEm(), linha.duracaoSegundos(), linha.csat())
                    .map(RelatorioAtendimentosController::celulaCsv).collect(Collectors.joining(";"))).append("\r\n");
        }
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"atendimentos.csv\"")
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .body(csv.toString().getBytes(StandardCharsets.UTF_8));
    }

    private static String celulaCsv(Object valor) {
        String texto = Objects.toString(valor, "");
        String inicio = texto.stripLeading();
        if (texto.startsWith("\t") || texto.startsWith("\r") || texto.startsWith("\n")
                || (!inicio.isEmpty() && "=+-@".indexOf(inicio.charAt(0)) >= 0)) {
            texto = "'" + texto;
        }
        return "\"" + texto.replace("\"", "\"\"") + "\"";
    }

    record Filtros(FiltroRelatorioAtendimentos.Periodo periodo,
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate inicio,
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fim,
            String busca, FiltroRelatorioAtendimentos.Status status, UUID etapa, UUID atendente) {
        FiltroRelatorioAtendimentos.Entrada entrada() {
            return new FiltroRelatorioAtendimentos.Entrada(periodo, inicio, fim, busca, status, etapa, atendente);
        }
    }

    @ExceptionHandler(IllegalArgumentException.class)
    ProblemDetail filtroInvalido(IllegalArgumentException erro) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, erro.getMessage());
    }
}
