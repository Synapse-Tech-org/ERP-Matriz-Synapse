import { HttpJson, type TransporteJson } from "../../followup/http.js";
import { ModeloDeAtendimento } from "./modelo.js";

// Criar apenas ao montar o agente: outros modos nao exigem uma chave OpenAI.
export function modeloOpenAI(env:NodeJS.ProcessEnv, http:TransporteJson = new HttpJson(30000)) {
  const chave = env.OPENAI_API_KEY?.trim();
  if (!chave) throw new Error("OPENAI_API_KEY_AUSENTE");
  return new ModeloDeAtendimento(http,"https://api.openai.com/v1",chave);
}
