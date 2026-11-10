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
                    "AUTOMACAO_DB_HOST": "postgres",
                    "AUTOMACAO_DB_POOL_MAX": "3",
                    "AUTOMACAO_DB_NAME": "",
                    "AUTOMACAO_DB_USER": "",
                    "AUTOMACAO_DB_PASSWORD": "",
                    "AUTOMACAO_CRM_URL": "http://synapse-backend-internal:8080",
                },
                "networks": {"synapse-internal": {"aliases": ["synapse-automacao-internal"]}, "dokploy-network": {}},
                "healthcheck": {"test": ["CMD", "node", "healthcheck.mjs"]},
                "deploy": {
                    "replicas": 0,
                    "labels": {
                        "traefik.enable": "false", "traefik.swarm.network": "dokploy-network",
                        "traefik.http.routers.ci-painel.rule": "Host(`automacao-desligada.invalid`) && (PathPrefix(`/painel/`) || Path(`/painel`) || Path(`/`))",
                        "traefik.http.routers.ci-painel.entrypoints": "websecure",
                        "traefik.http.routers.ci-painel.tls.certresolver": "letsencrypt",
                        "traefik.http.services.ci-painel.loadbalancer.server.port": "3100",
                    },
                    "update_config": {"order": "stop-first", "failure_action": "rollback"},
                    "rollback_config": {"order": "stop-first"},
                    "resources": {"limits": {"memory": 805306368}},
                },
            },
            "automacao-banco": {
                "image": "postgres:15-alpine",
                "command": ["sh", "/opt/automacao/provisionar.sh"],
                "networks": {"synapse-internal": {}},
                "configs": [{"source": n, "target": "/opt/automacao/" + destino} for n, destino in (
                    ("init-sh", "provisionar.sh"), ("init-sql", "provisionar.sql"),
                    ("clone-sh", "clonar-estrutura.sh"), ("marker-sql", "marcador.sql"),
                    ("migrar-sh", "aplicar-migracoes.sh"),
                    ("migracao-v1", "migrations/V1__registrar_base_de_execucoes.sql"),
                    ("migracao-v2", "migrations/V2__criar_faq_institucional.sql"),
                )],
                "deploy": {"replicas": 0, "restart_policy": {"condition": "none"}, "labels": {"traefik.enable": "false"}},
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
            ("rede_privada_ausente", lambda a, s: a["networks"].pop("synapse-internal")),
            ("traefik_ativo", lambda a, s: a["deploy"]["labels"].update({"traefik.enable": "true"})),
            ("router_publico", lambda a, s: a["deploy"]["labels"].update({"traefik.http.routers.a.rule": "Host(`x`)"})),
            ("limite_cpu_indevido", lambda a, s: a["deploy"]["resources"]["limits"].update(cpus="1")),
            ("sobreposicao", lambda a, s: a["deploy"]["update_config"].update(order="start-first")),
            ("tag_divergente", lambda a, s: a.update(image="ghcr.io/synapse-auto/erp-matriz-synapse-automacao:outra")),
            ("credencial_n8n", lambda a, s: a["environment"].update(N8N_DB_PASSWORD="nao-copiar")),
            ("crm_redirecionado", lambda a, s: s["backend"]["environment"].update(AUTOMACAO_URL="http://synapse-automacao-internal:3100")),
            ("n8n_removido", lambda a, s: s.pop("n8n")),
            ("preparador_ativo", lambda a, s: s["automacao-banco"]["deploy"].update(replicas=1)),
            ("preparador_em_loop", lambda a, s: s["automacao-banco"]["deploy"]["restart_policy"].update(condition="on-failure")),
            ("preparador_publico", lambda a, s: s["automacao-banco"]["deploy"]["labels"].update({"traefik.enable": "true"})),
            ("senha_admin_no_painel", lambda a, s: a["environment"].update(POSTGRES_PASSWORD="indevido")),
            ("depends_on_swarm", lambda a, s: a.update(depends_on=["automacao-banco"])),
            ("credencial_nova_obrigatoria", lambda a, s: a["environment"].update(AUTOMACAO_DB_NAME="novo")),
        ]
        for nome, alterar in casos:
            with self.subTest(nome=nome):
                compose = deepcopy(compose_base())
                alterar(compose["services"]["automacao"], compose["services"])
                with self.assertRaises(AssertionError):
                    validar(compose)

    def test_aceita_homologacao_explicita_sem_trocar_imagem_crm(self):
        compose = compose_base()
        a = compose["services"]["automacao"]
        a["deploy"]["replicas"] = 1
        a["deploy"]["labels"]["traefik.enable"] = "true"
        chave = "traefik.http.routers.ci-painel.rule"
        a["deploy"]["labels"][chave] = a["deploy"]["labels"][chave].replace("automacao-desligada.invalid", "painel.example.test")
        digest = "@sha256:" + "a" * 64
        a["image"] += digest
        a["environment"].update(AUTOMACAO_DB_NAME="automacao_ci", AUTOMACAO_DB_USER="automacao_app", AUTOMACAO_DB_PASSWORD="dummy-ci")
        compose["services"]["automacao-banco"]["deploy"]["replicas"] = 1
        validar(compose, homologacao=True, digest_automacao=digest)
        self.assertTrue(compose["services"]["backend"]["image"].endswith(":abcdef1"))
        a["environment"]["AUTOMACAO_DB_PASSWORD"] = ""
        with self.assertRaises(AssertionError):
            validar(compose, homologacao=True, digest_automacao=digest)

    def test_rejeita_colisao_de_dominio_ou_roteador(self):
        for chave, regra in [
            ("traefik.http.routers.crm.rule", "Host(`automacao-desligada.invalid`)"),
            ("traefik.http.routers.ci-painel.rule", "Host(`crm.example.test`)"),
        ]:
            with self.subTest(chave=chave):
                compose = compose_base()
                compose["services"]["backend"]["deploy"] = {"labels": {chave: regra}}
                with self.assertRaises(AssertionError):
                    validar(compose)


if __name__ == "__main__":
    unittest.main()
