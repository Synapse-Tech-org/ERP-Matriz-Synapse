"""Valida o JSON interpolado pelo Docker Compose, sem acessar bancos ou servicos."""
import json
import sys
import re
import argparse


def labels_de(servico):
    labels = servico.get("deploy", {}).get("labels", {})
    return dict(item.split("=", 1) for item in labels) if isinstance(labels, list) else labels


def validar(compose, homologacao=False, digest_automacao=None):
    servicos = compose["services"]
    automacao = servicos["automacao"]
    ambiente = automacao["environment"]
    deploy = automacao["deploy"]
    assert deploy["replicas"] == (1 if homologacao else 0), "replicas inesperadas da automacao"
    assert ambiente["AUTOMACAO_HABILITADA"] == "false", "chave geral deve iniciar desligada"
    assert ambiente["AUTOMACAO_FOLLOWUP_HABILITADO"] == "false", "follow-up deve iniciar desligado"
    assert ambiente["AUTOMACAO_HOST"] == "0.0.0.0"
    assert str(ambiente["AUTOMACAO_PORT"]) == "3100"
    assert not automacao.get("ports"), "nao publicar portas da automacao no host"
    assert set(automacao["networks"]) == {"synapse-internal", "dokploy-network"}
    assert "synapse-automacao-internal" in automacao["networks"]["synapse-internal"]["aliases"]
    labels = labels_de(automacao)
    assert str(labels["traefik.enable"]).lower() == str(homologacao).lower(), "publicacao deve ser explicita"
    assert labels["traefik.swarm.network"] == "dokploy-network"
    regras = {k: v for k, v in labels.items() if k.endswith(".rule")}
    assert len(regras) == 1, "apenas uma rota para o painel"
    regra = next(iter(regras.values()))
    dominio = re.fullmatch(r'Host\(`([^`]+)`\) && \(PathPrefix\(`/painel/`\) \|\| Path\(`/painel`\) \|\| Path\(`/`\)\)', regra)
    assert dominio, "rota publica deve permitir somente painel e raiz"
    if homologacao:
        assert not dominio[1].endswith(".invalid"), "configurar dominio real de homologacao"
    else:
        assert dominio[1] == "automacao-desligada.invalid", "sem dominio publico por padrao"
    assert any(k.endswith(".entrypoints") and v == "websecure" for k, v in labels.items())
    assert any(k.endswith(".tls.certresolver") and v == "letsencrypt" for k, v in labels.items())
    assert any(k.endswith(".loadbalancer.server.port") and str(v) == "3100" for k, v in labels.items())
    for nome, servico in servicos.items():
        if nome == "automacao":
            continue
        outros = labels_de(servico)
        assert not (set(regras) & set(outros)), "identificador do roteador colide com outro servico"
        for chave, valor in outros.items():
            if chave.endswith(".rule"):
                assert dominio[1] not in re.findall(r'Host\(`([^`]+)`\)', valor), "dominio do painel colide com servico existente"
    assert deploy["update_config"]["order"] == "stop-first"
    assert deploy["rollback_config"]["order"] == "stop-first"
    assert deploy["update_config"]["failure_action"] == "rollback"
    assert "cpus" not in deploy["resources"]["limits"], "sem limite CPU nesta entrega"
    assert int(deploy["resources"]["limits"]["memory"]) == 768 * 1024 * 1024
    assert automacao["healthcheck"]["test"] == ["CMD", "node", "healthcheck.mjs"]
    tag = servicos["backend"]["image"].rsplit(":", 1)[1]
    if digest_automacao:
        assert re.fullmatch(r"@sha256:[0-9a-f]{64}", digest_automacao), "digest invalido"
    assert automacao["image"].endswith(":" + tag + (digest_automacao or "")), "override de imagem deve ser explicito"
    assert not re.search(r"[\s${}]", automacao["image"]), "imagem contem interpolacao nao resolvida"
    assert servicos["backend"]["environment"]["AUTOMACAO_URL"] == "http://synapse-n8n-internal:5678"
    assert "n8n" in servicos, "nao substituir o n8n dos fluxos ainda nao migrados"
    assert not {"POSTGRES_PASSWORD", "POSTGRES_USER", "N8N_DB_PASSWORD", "N8N_DB_USER"} & set(ambiente)
    assert ambiente["AUTOMACAO_DB_HOST"] == "postgres"
    assert str(ambiente["AUTOMACAO_DB_POOL_MAX"]) == "3"
    assert ambiente["AUTOMACAO_CRM_URL"] == "http://synapse-backend-internal:8080"
    dados_banco = [ambiente[n] for n in ("AUTOMACAO_DB_NAME", "AUTOMACAO_DB_USER", "AUTOMACAO_DB_PASSWORD")]
    if homologacao:
        assert all(dados_banco), "homologacao precisa de credenciais proprias completas"
        assert ambiente["AUTOMACAO_DB_NAME"] not in (ambiente.get("POSTGRES_DB"), ambiente.get("N8N_DB_NAME"), "postgres", "template0", "template1"), "destino protegido"
    else:
        assert not any(dados_banco), "nao exigir credenciais novas nos filhos desligados"
    preparador = servicos["automacao-banco"]
    assert preparador["image"] == "postgres:15-alpine"
    assert preparador["deploy"]["replicas"] == (1 if homologacao else 0)
    assert preparador["deploy"]["restart_policy"]["condition"] == "none", "tarefa sem loop de restart"
    assert str(labels_de(preparador)["traefik.enable"]).lower() == "false"
    assert set(preparador["networks"]) == {"synapse-internal"}
    assert not preparador.get("ports") and not preparador.get("volumes")
    assert "depends_on" not in automacao, "Swarm nao deve depender de depends_on"
    assert len(preparador["configs"]) == 14
    destinos = {item["target"] for item in preparador["configs"]}
    assert "/opt/automacao/aplicar-migracoes.sh" in destinos
    assert "/opt/automacao/migrations/V2__criar_faq_institucional.sql" in destinos
    assert preparador["command"] == ["sh", "/opt/automacao/provisionar.sh"]


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--homologacao", action="store_true")
    parser.add_argument("--digest-automacao")
    args = parser.parse_args()
    validar(json.load(sys.stdin), args.homologacao, args.digest_automacao)
    print("automacao: defaults protegidos, rota restrita, preparador isolado e n8n preservado")
