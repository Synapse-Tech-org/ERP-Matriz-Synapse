"""Gera um grafo local a partir de uma revisão Git da Matriz."""

import argparse
import io
import os
import shutil
import stat
import subprocess
from pathlib import Path, PurePosixPath
from zipfile import ZipFile


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


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ref", default="HEAD", help="Revisão Git a analisar")
    parser.add_argument("--destino", type=Path, required=True, help="Diretório novo fora do repositório")
    parser.add_argument("--graphify", default="graphify", help="Executável do Graphify")
    args = parser.parse_args()

    repo = Path(__file__).resolve().parents[1]
    destino = args.destino.resolve()
    if destino.is_relative_to(repo):
        parser.error("O destino deve ficar fora do repositório.")
    graphify = shutil.which(args.graphify)
    if graphify is None:
        parser.error("Instale graphifyy ou informe o executável em --graphify.")

    sha = subprocess.check_output(
        ["git", "rev-parse", "--verify", "--end-of-options", f"{args.ref}^{{commit}}"],
        cwd=repo,
        text=True,
    ).strip()
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

    (destino / "REVISAO.txt").write_text(f"{sha}\n", encoding="utf-8")
    ambiente = dict(os.environ, GRAPHIFY_BACKEND="none", GRAPHIFY_OUT="graphify-out")
    subprocess.run([graphify, "update", "."], cwd=destino, env=ambiente, check=True)
    grafo = destino / "graphify-out" / "graph.json"
    if not grafo.is_file():
        raise SystemExit("Graphify terminou sem gerar graph.json.")
    print(f"Revisão: {sha}\nGrafo: {grafo}")


if __name__ == "__main__":
    main()
