# Atlas de código da Matriz

Use o grafo para localizar classes, chamadas e dependências antes de investigar um fluxo. Confira os caminhos sugeridos no código, especialmente as relações marcadas como `INFERRED` e as ligações que dependem de injeção do Spring, configuração ou eventos assíncronos.

## Gerar o grafo local

Com Python 3.10+ e Git disponíveis, no Windows, a partir da raiz do repositório:

```powershell
$ambiente = Join-Path $env:LOCALAPPDATA 'Synapse/graphify-0.9.104'
python -m venv $ambiente
& "$ambiente/Scripts/python.exe" -m pip install graphifyy==0.9.104

& "$ambiente/Scripts/python.exe" tools/graphify_piloto.py `
  --ref HEAD --graphify "$ambiente/Scripts/graphify.exe"
```

O script copia para um diretório novo apenas os arquivos Java de `src/main/java` dos módulos do backend e os arquivos TypeScript de `frontend/src` da revisão selecionada, excluindo os padrões usuais de teste do frontend. O conteúdo vem do commit Git. Documentos, arquivos `.env`, logs e alterações locais ficam fora do corpus. `GRAPHIFY_BACKEND=none` desativa o uso de LLM no Graphify.

Abra o `index.html` indicado pelo script. O atlas apresenta recortes de envio, webhooks e restrição de números. Selecione um arquivo para destacar suas relações e abrir a fonte da revisão indexada. Cada seta agrega ligações do Graphify entre dois arquivos. O sentido representa uma referência no código. A ordem visual dos cartões serve para navegação.

O cache padrão fica em `Synapse/graphify-matriz/<SHA>` sob `%LOCALAPPDATA%` no Windows e sob `$XDG_CACHE_HOME` ou `~/.cache` nos demais sistemas. A pasta `graphify-out` contém o atlas, o HTML geral, o relatório e o JSON. `REVISAO.txt` registra o commit após a geração. A mesma revisão reaproveita o grafo. Para usar outro destino, passe `--destino` tanto ao gerar quanto ao localizar. Mantenha as cópias e os grafos fora do Git.

## Consultar no Codex ou no terminal

O `AGENTS.md` orienta o Codex a localizar e consultar o grafo em investigações que cruzam módulos. `--localizar` retorna o arquivo somente quando a revisão bate com o registro do snapshot. No terminal:

```powershell
$grafo = & "$ambiente/Scripts/python.exe" tools/graphify_piloto.py --localizar --ref HEAD
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
