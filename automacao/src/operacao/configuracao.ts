export interface ConfiguracaoBanco {
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly user: string;
  readonly password: string;
  readonly schema: string;
  readonly max: number;
}

function inteiro(
  valor: string | undefined,
  padrao: number,
  maximo: number,
  nome: string,
): number {
  if (!valor) return padrao;
  const numero = Number(valor);
  if (!/^\d+$/.test(valor) || numero < 1 || numero > maximo)
    throw new Error(`${nome} invalido`);
  return numero;
}

export function carregarBanco(
  env: NodeJS.ProcessEnv,
): ConfiguracaoBanco | undefined {
  const dados = [
    env.AUTOMACAO_DB_NAME,
    env.AUTOMACAO_DB_USER,
    env.AUTOMACAO_DB_PASSWORD,
  ];
  if (dados.every((valor) => !valor)) return undefined;
  if (dados.some((valor) => !valor))
    throw new Error(
      "AUTOMACAO_DB_NAME, AUTOMACAO_DB_USER e AUTOMACAO_DB_PASSWORD devem ser informados juntos",
    );
  if (
    [
      env.POSTGRES_DB,
      env.N8N_DB_NAME,
      "postgres",
      "template0",
      "template1",
    ].includes(env.AUTOMACAO_DB_NAME)
  ) {
    throw new Error("Banco da automacao deve ser separado do CRM e do n8n");
  }
  const schema = env.AUTOMACAO_DB_SCHEMA || "public";
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schema))
    throw new Error("AUTOMACAO_DB_SCHEMA invalido");
  return {
    host: env.AUTOMACAO_DB_HOST || "postgres",
    port: inteiro(env.AUTOMACAO_DB_PORT, 5432, 65535, "AUTOMACAO_DB_PORT"),
    database: env.AUTOMACAO_DB_NAME!,
    user: env.AUTOMACAO_DB_USER!,
    password: env.AUTOMACAO_DB_PASSWORD!,
    schema,
    max: inteiro(env.AUTOMACAO_DB_POOL_MAX, 3, 10, "AUTOMACAO_DB_POOL_MAX"),
  };
}
