import { FalhaIntegracao, objeto, textoObrigatorio, type TransporteJson } from '../../followup/http.js';
import type { SessaoTecnica } from './sessao.js';

export interface ContextoAtendimento {
  leadId: string;
  atendimentoId: string;
  permiteIa: boolean;
}

export class ConsultaAtendimento {
  constructor(private readonly base: string, private readonly sessao: Pick<SessaoTecnica, 'obter'>,
    private readonly http: TransporteJson, private readonly tamanhoPagina: number) {}

  async resolver(telefone: string): Promise<ContextoAtendimento | null> {
    if (!/^[1-9]\d{7,14}$/.test(telefone)) throw new Error('TELEFONE_INVALIDO');
    const principal = telefone.replace(/^(55\d{2})([6-9]\d{7})$/, (_, ddd, assinante) => ddd + '9' + assinante);
    const numeros = [...new Set([principal, telefone])];
    const headers = { Authorization: 'Bearer ' + await this.sessao.obter() };
    for (const numero of numeros) {
      const r = await this.http.chamar(this.base + '/api/v1/leads/filtrar', headers, {
        criterio: { tipo: 'SIMPLES', campo: 'telefone', operador: 'CONTEM', valor: numero },
        pagina: 0, tamanho: this.tamanhoPagina,
      });
      const envelope = Array.isArray(r) ? {} : objeto(r);
      const itens = Array.isArray(r) ? r : envelope.leads ?? envelope.content ?? envelope.data ?? envelope.items;
      if (!Array.isArray(itens)) throw new Error('CRM_LEADS_INVALIDOS');
      // CONTEM nao e uma prova de identidade. Bloquear tambem dois leads com o mesmo telefone.
      const exatos = itens.map(objeto).filter(l => numeros.includes(String(l.telefone ?? l.phone ?? l.whatsapp).replace(/\D/g, '')));
      if (exatos.length > 1) throw new Error('CRM_LEAD_AMBIGUO');
      if (!exatos[0]) continue;
      const leadId = textoObrigatorio(exatos[0].id ?? exatos[0].leadId);
      let cartao;
      try {
        cartao = objeto(await this.http.chamar(this.base + '/api/v1/atendimentos/busca?leadId=' + encodeURIComponent(leadId), headers));
      } catch (e) {
        if (e instanceof FalhaIntegracao && e.status === 404) return null;
        throw e;
      }
      if (cartao.leadId !== leadId) throw new Error('CRM_ATENDIMENTO_DE_OUTRO_LEAD');
      const status = String(cartao.status ?? '').toUpperCase();
      const modo = String(cartao.modoAtendimento ?? cartao.modo ?? '').toUpperCase();
      const flag = cartao.iaAtiva ?? cartao.ia_ativa ?? cartao.emIa ?? cartao.em_ia;
      const bloqueado = ['FINALIZADO','FECHADO','CANCELADO','EM_ATENDIMENTO_HUMANO'].includes(status) || modo === 'HUMANO' || flag === false;
      const permiteIa = !bloqueado && (modo === 'IA' || flag === true || ['EM_IA','IA','BOT','AUTOMACAO','AUTOMACAO_IA'].includes(status));
      return { leadId, atendimentoId: textoObrigatorio(cartao.atendimentoId), permiteIa };
    }
    return null;
  }
}

export class TransferenciaCrm {
  constructor(private readonly base: string, private readonly token: string, private readonly http: TransporteJson) {}
  transferir(atendimentoId: string, atendenteId: string | null) {
    const url = this.base + '/internal/v1/atendimentos/' + encodeURIComponent(textoObrigatorio(atendimentoId));
    return this.http.chamar(url + (atendenteId ? '/transferir' : '/transferir-proximo-humano'),
      { 'X-Synapse-Token': this.token }, atendenteId ? { atendenteId } : {});
  }
}
