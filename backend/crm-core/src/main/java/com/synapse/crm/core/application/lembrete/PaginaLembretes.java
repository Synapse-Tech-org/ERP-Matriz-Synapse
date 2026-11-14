package com.synapse.crm.core.application.lembrete;

import java.util.List;

import com.synapse.crm.core.domain.lembrete.Lembrete;

public record PaginaLembretes(List<Lembrete> lembretes, int pagina, boolean temMais, Resumo resumo) {
    public PaginaLembretes(List<Lembrete> lembretes, int pagina, boolean temMais) {
        this(lembretes, pagina, temMais, null);
    }

    public record Resumo(long pendentes, long hoje, long semana, long automaticos) {}
}
