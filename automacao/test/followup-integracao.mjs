import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { PgBoss } from "pg-boss";
import { ControlePostgres } from "../dist/src/followup/controle-postgres.js";
import { AtendimentosPostgres } from "../dist/src/followup/atendimentos-postgres.js";
import { ProcessarAtendimento } from "../dist/src/followup/processar-atendimento.js";
import { ExecutarRodada } from "../dist/src/followup/rodada.js";
import { RepositorioExecucoesPostgres } from "../dist/src/operacao/postgres.js";
import { lerRegrasCrm } from "../dist/src/followup/configuracao-crm.js";

// Nao aceita URL externa nem le .env. banco-integracao.sh cria e destroi este fixture.
if (process.env.AUTOMACAO_TESTE_ISOLADO !== "true")
    throw Error("EXECUTAR_PELO_TESTE_DOCKER_ISOLADO");
const banco = {
    host: "127.0.0.1",
    port: 5432,
    database: "automacao_fixture",
    user: "automacao_fixture_app",
    password: "senha_destino_de_teste",
    max: 4,
    schema: "public",
};
const pool = new Pool(banco);
const admin = new Pool({
    host: "127.0.0.1",
    database: "crm_fixture",
    user: "postgres",
    password: "senha_admin_de_teste",
    max: 1,
});
const crmPool = new Pool({
    host: "127.0.0.1",
    database: "crm_fixture",
    user: "crm_leitor_fixture",
    password: "fixture",
    max: 2,
});
const painel = new RepositorioExecucoesPostgres(banco);
const boss = new PgBoss({
    schema: "fila_fixture",
    db: { executeSql: (sql, values) => pool.query(sql, values) },
});
boss.on("error", (e) => {
    throw e;
});
try {
    await admin.query(`CREATE ROLE crm_leitor_fixture LOGIN PASSWORD 'fixture';
    CREATE TABLE lead(id uuid PRIMARY KEY,nome text,telefone text);
    CREATE TABLE atendimento(id uuid PRIMARY KEY,lead_id uuid REFERENCES lead(id),status text);
    CREATE TABLE mensagem(id uuid PRIMARY KEY,atendimento_id uuid,remetente_tipo text,conteudo text,status_entrega text,enviado_em timestamptz);
    ALTER TABLE lead ENABLE ROW LEVEL SECURITY; ALTER TABLE lead FORCE ROW LEVEL SECURITY;
    ALTER TABLE atendimento ENABLE ROW LEVEL SECURITY; ALTER TABLE atendimento FORCE ROW LEVEL SECURITY;
    ALTER TABLE mensagem ENABLE ROW LEVEL SECURITY; ALTER TABLE mensagem FORCE ROW LEVEL SECURITY;
    CREATE POLICY servico ON lead USING (current_setting('app.papel',true)='SERVICO');
    CREATE POLICY servico ON atendimento USING (current_setting('app.papel',true)='SERVICO');
    CREATE POLICY servico ON mensagem USING (current_setting('app.papel',true)='SERVICO');
    GRANT SELECT ON lead,atendimento,mensagem TO crm_leitor_fixture;`);
    const consulta = new AtendimentosPostgres(crmPool);
    const controle = new ControlePostgres(pool);
    const regra = {
        id: randomUUID(),
        nome: "Fixture",
        tempoMinutos: 1,
        texto: "Ola {nome}",
    };
    const config = lerRegrasCrm(
        {
            parametros: [
                { chave: "followup.limite_envios_por_rodada", valor: "1" },
            ],
            exigeTemplateForaDaJanela: false,
        },
        [regra],
        { exigeJanela: false },
    );
    const ids = [];
    for (let i = 1; i <= 4; i++) {
        const id = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
        ids.push(id);
        await admin.query(
            "INSERT INTO lead VALUES($1,'Fixture','5561999990000');",
            [id],
        );
        await admin.query("INSERT INTO atendimento VALUES($1,$1,'EM_IA')", [
            id,
        ]);
        await admin.query(
            "INSERT INTO mensagem VALUES($1,$2,'LEAD','ola','ENVIADO',now()-interval '20 minutes')",
            [randomUUID(), id],
        );
        await admin.query(
            "INSERT INTO mensagem VALUES($1,$2,'IA','Bom dia','ENVIADO',now()-interval '10 minutes')",
            [randomUUID(), id],
        );
    }
    assert.equal(
        (await crmPool.query("SELECT count(*) FROM lead")).rows[0].count,
        "0",
        "RLS deve negar sem contexto",
    );
    assert.equal(
        (await consulta.listar(null, 1, ids[3])).length,
        1,
        "consulta paginada em contexto de servico",
    );
    assert.equal(
        (await crmPool.query("SELECT count(*) FROM lead")).rows[0].count,
        "0",
        "SET LOCAL nao pode vazar",
    );
    const a = await consulta.obter(ids[0]);
    assert.equal(a.nome, "Fixture");
    assert.equal(a.ultima.texto, "Bom dia");
    const decisao = {
        acao: "ENVIAR",
        regra,
        texto: "Ola Fixture",
        ciclo: new Date(a.ultimaDoLead.em).toISOString(),
    };
    const idRodada = randomUUID();
    await pool.query(
        "INSERT INTO automacao_infra.followup_rodada(id) VALUES($1)",
        [idRodada],
    );
    const disputas = await Promise.all(
        [1, 2].map(() =>
            controle.reservar(a, decisao, config.botoes, idRodada),
        ),
    );
    assert.equal(
        disputas.filter(Boolean).length,
        1,
        "reserva concorrente unica",
    );
    const reserva = disputas.find(Boolean);
    assert.equal(
        (
            await Promise.all(
                [1, 2].map(() => controle.consumirLimite(idRodada, 1)),
            )
        ).filter(Boolean).length,
        1,
    );
    await controle.liberarLimite(idRodada);
    assert.equal(await controle.consumirLimite(idRodada, 1), true);
    await controle.marcar(reserva.id, "EM_ENVIO");
    const comprovante = await controle.comprovar(
        reserva.id,
        "fixture-provider-1",
    );
    assert.equal(comprovante.texto, "Ola Fixture");
    assert.equal(
        (await controle.pendentes(100)).some((e) => e.id === reserva.id),
        true,
    );
    await controle.registrado(reserva.id, randomUUID());
    assert.equal(
        (await controle.pendentes(100)).some((e) => e.id === reserva.id),
        false,
    );
    assert.equal(
        await controle.reservar(a, decisao, config.botoes, idRodada),
        null,
    );
    await pool.query("INSERT INTO follow_up_opt_outs(lead_id) VALUES($1)", [
        ids[1],
    ]);
    assert.equal(await controle.recusou(ids[1]), true);
    const recusado = await consulta.obter(ids[1]);
    assert.equal(
        await controle.reservar(
            recusado,
            {
                ...decisao,
                ciclo: new Date(recusado.ultimaDoLead.em).toISOString(),
            },
            config.botoes,
            idRodada,
        ),
        null,
    );

    // Rodada completa: leitura SQL real, chamadas externas substituidas por portas de teste.
    let enviados = 0,
        registros = 0;
    const crm = {
        async configuracao() {
            return config;
        },
        async reservar() {
            return { podeEnviar: true, motivo: "" };
        },
        async registrar() {
            registros++;
            return randomUUID();
        },
        async finalizar() {
            throw Error("nao deveria encerrar este fixture");
        },
    };
    const processador = new ProcessarAtendimento(consulta, controle, crm, {
        validar() {},
        async enviar() {
            enviados++;
            return "fixture-provider-" + enviados;
        },
    });
    const rodada = new ExecutarRodada(
        pool,
        consulta,
        crm,
        processador,
        { intervaloMinutos: 1, pagina: 1, retencaoDias: 90 },
        () => false,
    );
    await pool.query(
        "UPDATE automacao_infra.followup_rodada SET iniciado_em=now()-interval '2 minutes',status='success',finalizado_em=now() WHERE id=$1",
        [idRodada],
    );
    const nova = randomUUID();
    await rodada.executar(nova);
    assert.equal(enviados, 1, "teto compartilhado da rodada");
    assert.equal(registros, 1);
    assert.equal(
        (
            await pool.query(
                "SELECT count(*) FROM automacao_infra.followup_etapa WHERE rodada_id=$1",
                [nova],
            )
        ).rows[0].count,
        "4",
        "pagina de 1 nao deve truncar candidatos",
    );
    assert.equal(
        (
            await pool.query(
                "SELECT cursor_id FROM automacao_infra.followup_rodada WHERE id=$1",
                [nova],
            )
        ).rows[0].cursor_id,
        ids[3],
    );
    await rodada.executar(nova);
    assert.equal(enviados, 1, "replay da rodada concluida nao envia");
    await pool.query(
        "UPDATE automacao_infra.followup_rodada SET iniciado_em=now()-interval '2 minutes' WHERE id=$1",
        [nova],
    );
    await rodada.executar(randomUUID());
    assert.equal(enviados, 2, "candidato excedente fica para a proxima rodada");
    await painel.preparar();
    const pagina = await painel.listar({ pagina: 0, tamanho: 20 });
    assert.ok(pagina.itens.some((e) => e.id === "fu_" + nova));
    const detalhe = await painel.detalhar("fu_" + nova);
    assert.ok(detalhe.etapas.some((e) => e.nome.includes("RECUSA_REGISTRADA")));
    assert.ok((await painel.resumo()).total >= 3);

    // O ponto de entrada real de pg-boss executa o handler. Nenhum cron de negocio e ativado aqui.
    await boss.start();
    await boss.createQueue("fixture");
    let resolver;
    const recebido = new Promise((resolve) => {
        resolver = resolve;
    });
    const idJob = await boss.send("fixture", { prova: true });
    await boss.work(
        "fixture",
        { pollingIntervalSeconds: 0.5 },
        async (jobs) => {
            assert.equal(jobs[0].id, idJob);
            resolver();
        },
    );
    let timeout;
    try {
        await Promise.race([
            recebido,
            new Promise((_, reject) => {
                timeout = setTimeout(
                    () => reject(Error("worker nao iniciou")),
                    15000,
                );
            }),
        ]);
    } finally {
        clearTimeout(timeout);
    }
    console.log(
        "OK: SQL real, RLS, paginacao, concorrencia, limite, recusa compartilhada, comprovante, retomada, painel e pg-boss",
    );
} finally {
    await boss.stop({ graceful: true });
    await painel.fechar();
    await crmPool.end();
    await admin.end();
    await pool.end();
}
