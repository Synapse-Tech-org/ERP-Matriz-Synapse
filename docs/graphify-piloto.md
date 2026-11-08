# Piloto Graphify na Matriz

Use o grafo para localizar classes, chamadas e dependências antes de investigar um fluxo. Confira os caminhos sugeridos no código, especialmente as relações marcadas como `INFERRED` e as ligações que dependem de injeção do Spring, configuração ou eventos assíncronos.

## Gerar o grafo local

Com Python 3.10+ e Git disponíveis, no Windows, a partir da raiz do repositório:

```powershell
$ambiente = Join-Path $env:LOCALAPPDATA 'Synapse/graphify-0.9.104'
python -m venv $ambiente
& "$ambiente/Scripts/python.exe" -m pip install graphifyy==0.9.104

$destino = Join-Path $env:LOCALAPPDATA ('Synapse/graphify-matriz-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
& "$ambiente/Scripts/python.exe" tools/graphify_piloto.py `
  --ref HEAD --destino $destino --graphify "$ambiente/Scripts/graphify.exe"
```

O script copia para um diretório novo apenas os arquivos Java de `src/main/java` dos módulos do backend e os arquivos TypeScript de `frontend/src` da revisão selecionada, excluindo os padrões usuais de teste do frontend. O conteúdo vem do commit Git. Documentos, arquivos `.env`, logs e alterações locais ficam fora do corpus. `GRAPHIFY_BACKEND=none` desativa o uso de LLM no Graphify.

Consulte `REVISAO.txt` para saber qual commit foi indexado. A pasta `graphify-out` da cópia contém o grafo e os artefatos gerados. Gere outro snapshot para analisar uma revisão nova. Mantenha as cópias e os grafos fora do Git.

## Consultar no Codex ou no terminal

No Codex, informe o caminho para o `graph.json` e peça que o agente comece com uma consulta por símbolo, cite os arquivos encontrados e confirme as ligações na fonte. No terminal, por exemplo:

```powershell
$grafo = Join-Path $destino 'graphify-out/graph.json'
$env:GRAPHIFY_QUERY_LOG_DISABLE = '1'
& "$ambiente/Scripts/graphify.exe" explain PublicadorDaOutboxOperacoes --graph $grafo
& "$ambiente/Scripts/graphify.exe" explain RestricaoDeNumerosWhatsApp --graph $grafo
```

Quando uma classe e seu construtor têm o mesmo nome, `explain` lista os IDs possíveis. Repita a consulta com o ID da classe, identificado pela linha da declaração.

## Resultado inicial

Na revisão `59fc322aa69c4e221479a57c363f251b1e43b0d0`, o Graphify analisou 1.536 arquivos e produziu 11.572 nós e 36.317 ligações. O HTML agrupa os nós por comunidade, enquanto o JSON mantém os símbolos individuais.

- A consulta sobre `RestricaoDeNumerosWhatsApp` localizou os controllers dos webhooks, o processador de entrada e o publicador da outbox. A leitura desses arquivos determina em qual etapa cada validação é aplicada.
- A busca de caminho dirigido entre `PublicadorDaOutboxOperacoes` e `MetaCloudApiAdapter` não encontrou ligação. O código passa pela interface `CanalGateway`, e a escolha do adaptador depende da configuração do Spring. Esse fluxo exige conferir a seleção do provedor no código.

O piloto verificou a geração e a utilidade das consultas como ponto de partida. Tempo de investigação e consumo de tokens não foram medidos.

Referência: [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify).
