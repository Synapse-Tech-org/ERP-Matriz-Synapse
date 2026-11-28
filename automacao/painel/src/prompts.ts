import { camposPerfil } from "../../src/conversa/agente/perfil";

export function editorPrompts(): HTMLElement {
  const bloco = document.createElement("details");
  const titulo = document.createElement("summary");
  titulo.textContent = "Prompts do agente de IA";
  const campos = document.createElement("div");
  bloco.append(titulo, campos);
  bloco.addEventListener("toggle", async () => {
    if (!bloco.open || campos.childNodes.length) return;
    campos.textContent = "Carregando...";
    try {
      const resposta = await fetch("/painel/api/prompts");
      if (!resposta.ok) throw new Error(String(resposta.status));
      const itens: {chave:string;valor:string}[] = await resposta.json();
      campos.replaceChildren();
      for (const item of itens) {
        const linha = document.createElement("form");
        const label = document.createElement("label");
        const perfil = camposPerfil[item.chave];
        label.textContent = perfil?.rotulo ?? item.chave;
        const campo = perfil?.opcoes ? document.createElement("select") : document.createElement("textarea");
        if (campo instanceof HTMLSelectElement) {
          campo.add(new Option("Usar padrão do atendimento",""));
          for (const opcao of perfil!.opcoes!) campo.add(new Option(opcao,opcao));
        } else {
          campo.rows = perfil?.limite === 100 ? 1 : 6;
          campo.maxLength = perfil?.limite ?? 32000;
        }
        campo.required = !perfil;
        campo.value = item.valor;
        label.append(campo);
        const salvar = document.createElement("button");
        salvar.textContent = "Salvar";
        const status = document.createElement("output");
        linha.append(label,salvar,status);
        linha.onsubmit = async evento => {
          evento.preventDefault();
          salvar.disabled = true;
          try {
            const r = await fetch("/painel/api/prompts/"+encodeURIComponent(item.chave), {
              method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({valor:campo.value})
            });
            status.textContent = r.ok ? "Salvo na automação" : "Alteração não salva: "+r.status;
          } catch { status.textContent = "Não foi possível confirmar a gravação."; }
          finally { salvar.disabled = false; }
        };
        campos.append(linha);
      }
    } catch { campos.textContent = "Não foi possível carregar os prompts. Atualize a página para tentar novamente."; }
  });
  return bloco;
}
