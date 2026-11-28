import { createClient } from "redis";
import { createHash } from "node:crypto";

export function chaveBuffer(instancia:string, atendimento:string) {
  if (!instancia.trim() || !atendimento.trim()) throw new Error("BUFFER_SEM_ESCOPO");
  const hash=createHash("sha256").update(JSON.stringify([instancia,atendimento])).digest("hex");
  return "automacao:conversa:v1:"+hash;
}

export async function conectarBuffer(env:NodeJS.ProcessEnv, instancia:string,onErro:()=>void) {
  if (!instancia.trim()) throw new Error("BUFFER_SEM_INSTANCIA");
  const cliente=createClient({url:env.AUTOMACAO_REDIS_URL || "redis://redis:6379",
    disableOfflineQueue:true,socket:{connectTimeout:5000,reconnectStrategy:false}});
  cliente.on("error",onErro);
  await cliente.connect();
  return {
    async adicionar(atendimento:string, evento:{id:string;texto:string}) {
      if (!evento.id || !evento.texto) throw new Error("BUFFER_EVENTO_INVALIDO");
      const chave=chaveBuffer(instancia,atendimento);
      await cliente.multi().rPush(chave,JSON.stringify(evento)).expire(chave,3600).exec();
    },
    async ler(atendimento:string) {
      return cliente.lRange(chaveBuffer(instancia,atendimento),0,99);
    },
    async confirmar(atendimento:string,lote:string[]) {
      if (!lote.length || lote.length>100) throw new Error("BUFFER_LOTE_INVALIDO");
      // Nunca apagar mensagens chegadas durante o processamento nem outro lote.
      return Number(await cliente.eval(`
        for i=1,#ARGV do
          if redis.call('LINDEX',KEYS[1],i-1) ~= ARGV[i] then return 0 end
        end
        redis.call('LTRIM',KEYS[1],#ARGV,-1)
        return 1`, {keys:[chaveBuffer(instancia,atendimento)],arguments:lote}))===1;
    },
    fechar:()=>cliente.close()
  };
}
