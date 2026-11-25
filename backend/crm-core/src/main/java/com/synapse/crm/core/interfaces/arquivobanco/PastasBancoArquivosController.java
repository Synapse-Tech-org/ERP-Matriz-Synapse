package com.synapse.crm.core.interfaces.arquivobanco;

import java.util.List;
import java.util.UUID;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.synapse.crm.core.application.arquivobanco.CriarPastaArquivoBancoUseCase;
import com.synapse.crm.core.application.arquivobanco.ListarPastasArquivoBancoUseCase;
import com.synapse.crm.core.application.arquivobanco.RenomearPastaArquivoBancoUseCase;
import com.synapse.crm.core.domain.arquivobanco.PastaArquivoBanco;

@RestController
@RequestMapping("/api/v1/banco-arquivos/pastas")
@Tag(name = "Banco de Arquivos")
@SecurityRequirement(name = "bearerAuth")
class PastasBancoArquivosController {
    private final ListarPastasArquivoBancoUseCase listar;
    private final CriarPastaArquivoBancoUseCase criar;
    private final RenomearPastaArquivoBancoUseCase renomear;

    PastasBancoArquivosController(ListarPastasArquivoBancoUseCase listar, CriarPastaArquivoBancoUseCase criar,
            RenomearPastaArquivoBancoUseCase renomear) {
        this.listar = listar;
        this.criar = criar;
        this.renomear = renomear;
    }

    @Operation(summary = "Listar pastas da biblioteca",
            description = "Lista as pastas da instância com a pasta permanente Geral no início.")
    @GetMapping
    List<PastaArquivoBanco> listar() {
        return listar.executar();
    }

    @Operation(summary = "Criar uma pasta da biblioteca",
            description = "Cria uma pasta com nome único para quem tem permissão de gerenciar pastas.")
    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    PastaArquivoBanco criar(@RequestBody NomeDePasta entrada) {
        return criar.executar(UUID.randomUUID(), entrada.nome());
    }

    @Operation(summary = "Renomear uma pasta da biblioteca",
            description = "Altera o nome de uma pasta personalizada e mantém o vínculo com seus arquivos.")
    @PatchMapping(path = "/{id}", consumes = MediaType.APPLICATION_JSON_VALUE)
    PastaArquivoBanco renomear(@PathVariable String id, @RequestBody NomeDePasta entrada) {
        return renomear.executar(id, entrada.nome());
    }

    record NomeDePasta(String nome) {}
}
