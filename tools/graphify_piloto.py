"""Gera um grafo local a partir de uma revisão Git da Matriz."""

import argparse
import io
import json
import os
import shutil
import stat
import subprocess
from pathlib import Path, PurePosixPath
from zipfile import ZipFile


FLUXOS = [
    ("Envio de mensagens", "Do caso de uso ao despacho pela Meta", [
        "EnviarMensagemUseCase", "PublicadorDaOutbox", "PublicadorDaOutboxOperacoes",
        "PublicadorDaOutboxTransacoes", "CanalGateway", "SeletorDeCanalGateway", "MetaCloudApiAdapter",
    ]),
    ("Entrada de webhooks", "Recebimento, tradução e processamento de eventos", [
        "WebhookCanalController", "WebhookZApiController", "WebhookEvolutionController",
        "MetaCloudWebhookTradutor", "ProcessadorDeWebhookEntrada",
        "ProcessadorDeWebhookEntradaOperacoes", "RestricaoDeNumerosWhatsApp",
    ]),
    ("Filtro de números", "Pontos que aplicam a lista de números permitidos", [
        "RestricaoDeNumerosWhatsApp", "TelefoneCanonico", "WebhookCanalController",
        "WebhookZApiController", "WebhookEvolutionController",
        "ProcessadorDeWebhookEntradaOperacoes", "PublicadorDaOutboxOperacoes",
    ]),
]


def e_codigo_de_producao(caminho: PurePosixPath) -> bool:
    partes = caminho.parts
    if partes[0] == "backend":
        return partes[2:5] == ("src", "main", "java") and caminho.suffix == ".java"
    return (
        partes[:2] == ("frontend", "src")
        and caminho.suffix in (".ts", ".tsx")
        and not caminho.stem.endswith((".test", ".spec"))
        and not {"__tests__", "__mocks__", "__fixtures__"}.intersection(partes)
    )


def gerar_atlas(grafo: Path, sha: str) -> None:
    dados = json.loads(grafo.read_text(encoding="utf-8"))
    arquivos_por_no = {no["id"]: no.get("source_file") for no in dados["nodes"]}
    arquivos = {
        arquivo for arquivo in arquivos_por_no.values()
        if arquivo and e_codigo_de_producao(PurePosixPath(arquivo))
        and (grafo.parents[1] / arquivo).is_file()
    }
    fluxos = []
    for titulo, descricao, nomes in FLUXOS:
        caminhos = sorted(
            (arquivo for arquivo in arquivos if PurePosixPath(arquivo).stem in nomes),
            key=lambda arquivo: (nomes.index(PurePosixPath(arquivo).stem), arquivo),
        )
        selecionados = set(caminhos)
        ligacoes = {}
        for aresta in dados["links"]:
            origem = arquivos_por_no[aresta["source"]]
            destino = arquivos_por_no[aresta["target"]]
            if origem == destino or origem not in selecionados or destino not in selecionados:
                continue
            referencias = ligacoes.setdefault((origem, destino), [])
            referencias.append({
                "tipo": aresta["relation"], "confianca": aresta.get("confidence"),
            })
        fluxos.append({
            "titulo": titulo, "descricao": descricao, "arquivos": caminhos,
            "faltantes": [nome for nome in nomes if all(PurePosixPath(c).stem != nome for c in caminhos)],
            "ligacoes": [{"origem": a, "destino": b, "referencias": refs} for (a, b), refs in ligacoes.items()],
        })
    painel = {
        "sha": sha, "arquivos": len(arquivos), "nos": len(dados["nodes"]),
        "ligacoes": len(dados["links"]), "fluxos": fluxos,
    }
    modelo = Path(__file__).with_name("graphify_atlas.html").read_text(encoding="utf-8")
    json_seguro = json.dumps(painel, ensure_ascii=False).replace("<", "\\u003c")
    grafo.with_name("index.html").write_text(modelo.replace("__DADOS_DO_GRAFO__", json_seguro), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ref", default="HEAD", help="Revisão Git a analisar")
    parser.add_argument("--destino", type=Path, help="Diretório fora do repositório (padrão: cache por SHA)")
    parser.add_argument("--graphify", default="graphify", help="Executável do Graphify")
    parser.add_argument("--localizar", action="store_true", help="Imprime o caminho do grafo da revisão")
    args = parser.parse_args()

    repo = Path(__file__).resolve().parents[1]
    sha = subprocess.check_output(
        ["git", "rev-parse", "--verify", "--end-of-options", f"{args.ref}^{{commit}}"],
        cwd=repo,
        text=True,
    ).strip()
    cache = Path(os.getenv("LOCALAPPDATA") or os.getenv("XDG_CACHE_HOME") or Path.home() / ".cache")
    destino = (args.destino or cache / "Synapse" / "graphify-matriz" / sha).resolve()
    if destino.is_relative_to(repo):
        parser.error("O destino deve ficar fora do repositório.")
    grafo = destino / "graphify-out" / "graph.json"
    revisao = destino / "REVISAO.txt"
    disponivel = grafo.is_file() and revisao.is_file() and revisao.read_text(encoding="utf-8").strip() == sha
    if args.localizar:
        if not disponivel:
            raise SystemExit(f"Grafo indisponível para {sha}.")
        print(grafo)
        return

    if disponivel:
        gerar_atlas(grafo, sha)
        print(f"Atlas: {grafo.with_name('index.html')}")
        return

    graphify = shutil.which(args.graphify)
    if graphify is None:
        parser.error("Instale graphifyy ou informe o executável em --graphify.")
    arquivo = subprocess.check_output(
        ["git", "archive", "--format=zip", sha, "backend", "frontend/src"], cwd=repo
    )
    destino.mkdir(parents=True, exist_ok=False)

    with ZipFile(io.BytesIO(arquivo)) as snapshot:
        for item in snapshot.infolist():
            if item.is_dir() or stat.S_ISLNK(item.external_attr >> 16):
                continue
            if e_codigo_de_producao(PurePosixPath(item.filename)):
                snapshot.extract(item, destino)

    ambiente = dict(os.environ, GRAPHIFY_BACKEND="none", GRAPHIFY_OUT="graphify-out")
    subprocess.run([graphify, "update", "."], cwd=destino, env=ambiente, check=True)
    if not grafo.is_file():
        raise SystemExit("Graphify terminou sem gerar graph.json.")
    gerar_atlas(grafo, sha)
    revisao.write_text(f"{sha}\n", encoding="utf-8")
    print(f"Revisão: {sha}\nGrafo: {grafo}\nAtlas: {grafo.with_name('index.html')}")


if __name__ == "__main__":
    main()
