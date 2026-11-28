import type { ConfiguracaoProvedor } from '../followup/provedores.js';
import type { AdaptadorEntrada } from './entrada.js';
import { EntradaEvolution } from './evolution.js';
import { EntradaMeta } from './meta.js';
import { EntradaZApi } from './z-api.js';

// Recebe o canal ja escolhido pela configuracao da instancia; nao adivinha pelo JSON.
export function criarAdaptadorEntrada(canal: ConfiguracaoProvedor): AdaptadorEntrada {
  switch (canal.tipo) {
    case 'meta': return new EntradaMeta(canal.numero);
    case 'evolution': return new EntradaEvolution(canal.instancia);
    case 'z-api': return new EntradaZApi(canal.instancia);
  }
}
