"""Testes do verificador de seguranca do Compose; nao dependem de Docker."""
from copy import deepcopy
import unittest

from validar_automacao import validar


def compose_base():
    return {
        "services": {
            "automacao": {
                "image": "ghcr.io/synapse-auto/erp-matriz-synapse-automacao:abcdef1",
                "environment": {
                    "AUTOMACAO_HABILITADA": "false",
                    "AUTOMACAO_FOLLOWUP_HABILITADO": "false",
                    "AUTOMACAO_HOST": "0.0.0.0",
                    "AUTOMACAO_PORT": "3100",
                },
                "networks": {"synapse-internal": {"aliases": ["synapse-automacao-internal"]}},
                "healthcheck": {"test": ["CMD", "node", "healthcheck.mjs"]},
                "deploy": {
                    "replicas": 0,
                    "labels": {"traefik.enable": "false"},
                    "update_config": {"order": "stop-first", "failure_action": "rollback"},
                    "rollback_config": {"order": "stop-first"},
                    "resources": {"limits": {"cpus": "1.0", "memory": 805306368}},
                },
            },
            "backend": {
                "image": "ghcr.io/synapse-auto/erp-matriz-synapse-backend:abcdef1",
                "environment": {"AUTOMACAO_URL": "http://synapse-n8n-internal:5678"},
            },
            "n8n": {},
        }
    }


class SegurancaDaAutomacaoTest(unittest.TestCase):
    def test_aceita_base_desligada_e_privada(self):
        validar(compose_base())

    def test_rejeita_regressoes_de_seguranca(self):
        casos = [
            ("replica_ativa", lambda a, s: a["deploy"].update(replicas=1)),
            ("geral_ativa", lambda a, s: a["environment"].update(AUTOMACAO_HABILITADA="true")),
            ("followup_ativo", lambda a, s: a["environment"].update(AUTOMACAO_FOLLOWUP_HABILITADO="true")),
            ("porta_publicada", lambda a, s: a.update(ports=[{"published": "3100"}])),
            ("rede_compartilhada", lambda a, s: a["networks"].update({"dokploy-network": {}})),
            ("traefik_ativo", lambda a, s: a["deploy"]["labels"].update({"traefik.enable": "true"})),
            ("router_publico", lambda a, s: a["deploy"]["labels"].update({"traefik.http.routers.a.rule": "Host(`x`)"})),
            ("sem_limite_cpu", lambda a, s: a["deploy"]["resources"]["limits"].update(cpus="0")),
            ("sobreposicao", lambda a, s: a["deploy"]["update_config"].update(order="start-first")),
            ("tag_divergente", lambda a, s: a.update(image="ghcr.io/synapse-auto/erp-matriz-synapse-automacao:outra")),
            ("credencial_n8n", lambda a, s: a["environment"].update(N8N_DB_PASSWORD="nao-copiar")),
            ("crm_redirecionado", lambda a, s: s["backend"]["environment"].update(AUTOMACAO_URL="http://synapse-automacao-internal:3100")),
            ("n8n_removido", lambda a, s: s.pop("n8n")),
        ]
        for nome, alterar in casos:
            with self.subTest(nome=nome):
                compose = deepcopy(compose_base())
                alterar(compose["services"]["automacao"], compose["services"])
                with self.assertRaises(AssertionError):
                    validar(compose)


if __name__ == "__main__":
    unittest.main()
