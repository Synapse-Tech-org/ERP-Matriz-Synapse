package com.synapse.crm.equipe.domain.usuario;

import java.time.Instant;

/** A declaração operacional não é evidência de sessão, nem altera o estado próprio ou o toggle da IA. */
public record PresencaOperacional(
        StatusPresenca presencaNoCrm,
        Estado statusEfetivo,
        Ajuste ajuste,
        Instant validoAte,
        boolean disponivelParaIa,
        Motivo motivoRodizio,
        boolean podeAlterar) {

    public enum Ajuste { ONLINE, OFFLINE, PAUSA }

    public enum Estado { ONLINE, OFFLINE, PAUSA, AUSENTE }

    public enum Motivo {
        APTO, INATIVO, PAPEL_INELEGIVEL, CONTA_DE_TESTE, FORA_DO_SETOR, DISTRIBUICAO_DESLIGADA,
        EM_PAUSA, OFFLINE_PELA_GESTAO, AUSENTE, SEM_PRESENCA_ONLINE
    }

    public static PresencaOperacional avaliar(
            Usuario usuario, Ajuste ajuste, Instant validoAte, boolean foraDoSetor, boolean podeAlterar) {
        StatusPresenca presenca = usuario.statusPresenca();
        Estado efetivo = ajuste == null ? Estado.valueOf(presenca.name()) : Estado.valueOf(ajuste.name());
        Motivo motivo;
        if (!usuario.ativo()) motivo = Motivo.INATIVO;
        else if (usuario.usuarioTeste()) motivo = Motivo.CONTA_DE_TESTE;
        else if (!usuario.papel().recebeAtendimento()) motivo = Motivo.PAPEL_INELEGIVEL;
        else if (foraDoSetor) motivo = Motivo.FORA_DO_SETOR;
        else if (!usuario.disponivelParaIa()) motivo = Motivo.DISTRIBUICAO_DESLIGADA;
        else if (ajuste == Ajuste.PAUSA) motivo = Motivo.EM_PAUSA;
        else if (ajuste == Ajuste.OFFLINE) motivo = Motivo.OFFLINE_PELA_GESTAO;
        else if (presenca == StatusPresenca.AUSENTE) motivo = Motivo.AUSENTE;
        else if (presenca != StatusPresenca.ONLINE) motivo = Motivo.SEM_PRESENCA_ONLINE;
        else motivo = Motivo.APTO;
        return new PresencaOperacional(
                presenca, efetivo, ajuste, validoAte, usuario.disponivelParaIa(), motivo, podeAlterar);
    }
}
