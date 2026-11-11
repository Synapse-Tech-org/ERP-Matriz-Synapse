package com.synapse.crm.relatorios.application.atendimentos;

import java.util.List;

import com.synapse.crm.relatorios.domain.atendimentos.FiltroRelatorioAtendimentos;
import com.synapse.crm.relatorios.domain.atendimentos.RelatorioAtendimentos;

public interface RelatorioAtendimentosRepositorio {
    RelatorioAtendimentos consultar(FiltroRelatorioAtendimentos filtro, int pagina, int tamanho, String fuso);
    List<RelatorioAtendimentos.Linha> listar(FiltroRelatorioAtendimentos filtro, int limite, long deslocamento);
}
