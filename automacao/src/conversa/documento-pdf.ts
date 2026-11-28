import { execFile } from "node:child_process";

// Recebe bytes ja obtidos e autorizados pelo ingresso de midia, nunca uma URL.
export async function extrairTextoPdf(bytes:Buffer):Promise<string> {
  if (bytes.length>8*1024*1024) throw new Error("PDF_EXCEDE_LIMITE");
  if (bytes.subarray(0,5).toString("ascii")!=="%PDF-") throw new Error("DOCUMENTO_NAO_PDF");
  return new Promise((resolve,reject)=>{
    const filho=execFile("pdftotext",["-enc","UTF-8","-","-"],
      {encoding:"utf8",timeout:10000,killSignal:"SIGKILL",maxBuffer:512*1024},(erro,saida)=>{
        if (erro) return reject(new Error(erro.code==="ENOENT"?"EXTRATOR_PDF_INDISPONIVEL":"PDF_NAO_EXTRAIDO"));
        const texto=saida.trim();
        if (!texto) return reject(new Error("PDF_SEM_TEXTO"));
        resolve(texto);
      });
    // Arquivos invalidos podem fechar stdin antes de o Node terminar de escrever.
    filho.stdin?.on("error",()=>{}).end(bytes);
  });
}
