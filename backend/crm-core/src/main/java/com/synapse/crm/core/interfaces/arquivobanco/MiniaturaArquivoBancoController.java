package com.synapse.crm.core.interfaces.arquivobanco;

import java.util.UUID;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.synapse.crm.core.application.arquivobanco.GerarMiniaturaArquivoBancoUseCase;

@RestController
@RequestMapping("/api/v1/banco-arquivos")
@Tag(name = "Banco de Arquivos")
@SecurityRequirement(name = "bearerAuth")
class MiniaturaArquivoBancoController {
    private final GerarMiniaturaArquivoBancoUseCase gerar;

    MiniaturaArquivoBancoController(GerarMiniaturaArquivoBancoUseCase gerar) {
        this.gerar = gerar;
    }

    @Operation(summary = "Gerar miniatura raster do arquivo",
            description = "Retorna PNG de uma imagem ou da primeira página de um PDF. Sem raster seguro, retorna 204.")
    @GetMapping("/{id}/miniatura")
    ResponseEntity<byte[]> obter(@PathVariable UUID id) {
        return gerar.executar(id).map(png -> ResponseEntity.ok()
                        .cacheControl(CacheControl.noCache().cachePrivate())
                        .contentType(MediaType.IMAGE_PNG)
                        .header("X-Content-Type-Options", "nosniff")
                        .header("Content-Security-Policy", "sandbox; default-src 'none'")
                        .body(png))
                .orElseGet(() -> ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build());
    }
}
