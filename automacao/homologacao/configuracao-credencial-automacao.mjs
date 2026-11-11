// Monta apenas a credencial do banco NOVO da automacao, nunca CRM/n8n.
// O objeto retornado contem senha: nao escrever em logs, exports ou Git.
export function definirCredencialAutomacao(env) {
  for (const nome of ['AUTOMACAO_DB_NAME', 'AUTOMACAO_DB_USER', 'AUTOMACAO_DB_PASSWORD', 'POSTGRES_DB', 'N8N_DB_NAME']) {
    if (typeof env[nome] !== 'string' || !env[nome].trim()) throw new Error('VARIAVEL_AUSENTE: ' + nome);
  }
  for (const nome of ['AUTOMACAO_DB_NAME', 'AUTOMACAO_DB_USER']) {
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(env[nome])) throw new Error('IDENTIFICADOR_INVALIDO: ' + nome);
  }
  if ([env.POSTGRES_DB, env.N8N_DB_NAME, 'postgres', 'template0', 'template1'].includes(env.AUTOMACAO_DB_NAME)) {
    throw new Error('BANCO_DESTINO_PROTEGIDO');
  }
  if ([env.POSTGRES_USER, env.N8N_DB_USER].includes(env.AUTOMACAO_DB_USER)) throw new Error('USUARIO_DEVE_SER_EXCLUSIVO');
  const port = Number(env.AUTOMACAO_DB_PORT || 5432);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORTA_INVALIDA');
  return {
    name: 'HML PostgreSQL Automacao', type: 'postgres',
    data: {host:env.AUTOMACAO_DB_HOST || 'postgres', port, database:env.AUTOMACAO_DB_NAME,
      user:env.AUTOMACAO_DB_USER, password:env.AUTOMACAO_DB_PASSWORD, ssl:'disable', maxConnections:3},
  };
}
