package com.synapse.crm.app.arquivobanco;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.UUID;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

import com.synapse.crm.atendimento.application.EnviarMensagemUseCase;
import com.synapse.crm.atendimento.application.midia.AnexoExcedeuLimiteException;
import com.synapse.crm.atendimento.application.midia.EnviarMidiaUseCase;
import com.synapse.crm.atendimento.application.midia.ResolverLeadDoAtendimentoUseCase;
import com.synapse.crm.atendimento.application.midia.TipoDeMidiaNaoPermitidoException;
import com.synapse.crm.atendimento.domain.midia.TiposDeMidiaPermitidos;
import com.synapse.crm.core.application.arquivobanco.AbrirArquivoBancoUseCase;
import com.synapse.crm.sharedkernel.midia.ClassificadorDeAnexoExterno;
import com.synapse.crm.sharedkernel.midia.LimiteDeAnexoRepositorio;

@Service
public class EnviarArquivoBancoAoClienteUseCase {

    private final AbrirArquivoBancoUseCase arquivos;
    private final ResolverLeadDoAtendimentoUseCase resolverLead;
    private final EnviarMidiaUseCase enviarMidia;
    private final LimiteDeAnexoRepositorio limites;

    public EnviarArquivoBancoAoClienteUseCase(
            AbrirArquivoBancoUseCase arquivos,
            ResolverLeadDoAtendimentoUseCase resolverLead,
            EnviarMidiaUseCase enviarMidia,
            LimiteDeAnexoRepositorio limites) {
        this.arquivos = arquivos;
        this.resolverLead = resolverLead;
        this.enviarMidia = enviarMidia;
        this.limites = limites;
    }

    @PreAuthorize("isAuthenticated() and @capacidades.permite('banco_arquivos.enviar')"
            + " and @capacidades.permite('clientes.acessar') and @capacidades.permite('atendimentos.responder')")
    public EnviarMensagemUseCase.Resultado executar(
            UUID arquivoId, UUID atendimentoId, String legenda, UUID chaveIdempotencia) {
        UUID leadId = resolverLead.executar(atendimentoId);
        var arquivo = arquivos.paraEnvio(arquivoId);
        byte[] conteudo;
        try (arquivo) {
            String mime = arquivo.mimeType();
            var categoria = ClassificadorDeAnexoExterno.categoriaDoMimeValidado(mime)
                    .orElseThrow(() -> new TipoDeMidiaNaoPermitidoException(mime));
            long limite = limites.limiteEmBytes(categoria)
                    .orElseGet(() -> TiposDeMidiaPermitidos.tetoDaMetaEmBytes(categoria));
            if (arquivo.tamanhoBytes() > limite) {
                throw new AnexoExcedeuLimiteException(arquivo.tamanhoBytes(), limite);
            }
            int tamanho = Math.toIntExact(arquivo.tamanhoBytes());
            conteudo = arquivo.conteudo().readNBytes(tamanho);
            if (conteudo.length != tamanho || arquivo.conteudo().read() != -1) {
                throw new IOException("Objeto do Banco de Arquivos com tamanho divergente");
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        // Uma cópia passa pelo envio de mídia existente. Restaurar ou expurgar o arquivo
        // da biblioteca depois desse clique não interfere na entrega nem no histórico do chat.
        return enviarMidia.executar(
                leadId, atendimentoId, conteudo, arquivo.nome(), legenda, null, false,
                "banco-arquivos:" + arquivoId + ":" + atendimentoId + ":" + chaveIdempotencia);
    }
}
