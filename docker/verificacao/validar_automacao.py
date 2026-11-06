"""Valida o JSON interpolado pelo Docker Compose, sem acessar bancos ou servicos."""
import json
import sys


def validar(compose):
    servicos = compose["services"]
    automacao = servicos["automacao"]
    ambiente = automacao["environment"]
    deploy = automacao["deploy"]
    assert deploy["replicas"] == 0, "automacao deve iniciar sem replicas por padrao"
    assert ambiente["AUTOMACAO_HABILITADA"] == "false", "chave geral deve iniciar desligada"
    assert ambiente["AUTOMACAO_FOLLOWUP_HABILITADO"] == "false", "follow-up deve iniciar desligado"
    assert ambiente["AUTOMACAO_HOST"] == "0.0.0.0"
    assert str(ambiente["AUTOMACAO_PORT"]) == "3100"
    assert not automacao.get("ports"), "nao publicar portas da automacao no host"
    assert set(automacao["networks"]) == {"synapse-internal"}, "rede privada por filho"
    assert "synapse-automacao-internal" in automacao["networks"]["synapse-internal"]["aliases"]
    labels = deploy["labels"]
    if isinstance(labels, list):
        labels = dict(item.split("=", 1) for item in labels)
    assert str(labels["traefik.enable"]).lower() == "false", "sem rota publica nesta etapa"
    assert not any("traefik.http." in chave for chave in labels)
    assert deploy["update_config"]["order"] == "stop-first"
    assert deploy["rollback_config"]["order"] == "stop-first"
    assert deploy["update_config"]["failure_action"] == "rollback"
    assert float(deploy["resources"]["limits"]["cpus"]) == 1.0
    assert int(deploy["resources"]["limits"]["memory"]) == 768 * 1024 * 1024
    assert automacao["healthcheck"]["test"] == ["CMD", "node", "healthcheck.mjs"]
    assert automacao["image"].endswith(":" + servicos["backend"]["image"].rsplit(":", 1)[1])
    assert servicos["backend"]["environment"]["AUTOMACAO_URL"] == "http://synapse-n8n-internal:5678"
    assert "n8n" in servicos, "nao substituir o n8n dos fluxos ainda nao migrados"
    assert not any("PASSWORD" in nome or nome.startswith("N8N_DB_") for nome in ambiente)


if __name__ == "__main__":
    validar(json.load(sys.stdin))
    print("automacao: defaults desligados, rede privada, tag conjunta e n8n preservado")
