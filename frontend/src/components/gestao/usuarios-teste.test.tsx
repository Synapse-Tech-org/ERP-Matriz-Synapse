import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TextosSchema } from "@/lib/config/schema";
import { TextosProvider } from "@/lib/config/textos-provider";
import { ErroDeApi } from "@/lib/api/errors";
import type { UsuarioEquipe } from "@/lib/equipe/types";
import { DialogoUsuario } from "./dialogo-usuario";
import { VisaoGeralIntegranteV2 } from "./visao-geral-integrante-v2";
import { DialogoClassificacaoTeste } from "./dialogo-classificacao-teste";

const textos=TextosSchema.parse(JSON.parse(readFileSync(resolve(process.cwd(),"../backend/crm-app/src/main/resources/textos.json"),"utf8")));
const criar={mutate:vi.fn(),isPending:false,error:null};
const editar={mutate:vi.fn(),reset:vi.fn(),isPending:false,isError:false,error:null};
const classificar={mutate:vi.fn(),isPending:false,isError:false,error:null as unknown};
vi.mock("@/lib/equipe/use-equipe",()=>({useCriarUsuario:()=>criar,useEditarUsuario:()=>editar,useClassificarUsuarioTeste:()=>classificar}));
const usuario:UsuarioEquipe={id:"id-tecnico",nome:"Pessoa sintetica",email:"pessoa@example.invalid",papel:"ATENDENTE",ativo:true,statusPresenca:"OFFLINE",usuarioTeste:false};
function montar(elemento:React.ReactNode) {
  return render(<QueryClientProvider client={new QueryClient()}><TextosProvider textos={textos}>{elemento}</TextosProvider></QueryClientProvider>);
}
beforeEach(()=>{vi.clearAllMocks();classificar.isPending=false;classificar.isError=false;classificar.error=null;});

describe("classificacao explicita de teste",()=>{
  it("ADM marca criacao; payload preserva booleano e dados comuns",()=>{
    montar(<DialogoUsuario textos={textos.gestao} funcoesPermitidas={["ATENDENTE"]} podeAlterarFuncao podeClassificarTeste onFechar={vi.fn()}/>);
    fireEvent.change(screen.getByLabelText(textos.gestao.formulario.nome),{target:{value:"Pessoa sintetica"}});
    fireEvent.change(screen.getByLabelText(textos.gestao.formulario.email),{target:{value:"pessoa@example.invalid"}});
    fireEvent.change(document.querySelector('input[type="password"]')!,{target:{value:"senha-sintetica-123"}});
    fireEvent.click(screen.getByRole("switch",{name:textos.usuariosTeste.rotulo}));
    fireEvent.click(screen.getByRole("button",{name:textos.gestao.formulario.salvar}));
    expect(criar.mutate).toHaveBeenCalledWith(expect.objectContaining({usuarioTeste:true,papel:"ATENDENTE"}),expect.anything());
  });
  it("nao ADM nao recebe controle nem envia classificacao implicita",()=>{
    montar(<DialogoUsuario textos={textos.gestao} funcoesPermitidas={["ATENDENTE"]} podeAlterarFuncao onFechar={vi.fn()}/>);
    expect(screen.queryByRole("switch",{name:textos.usuariosTeste.rotulo})).not.toBeInTheDocument();
  });
  it("alterar switch nao grava; exige confirmar; Cancelar preserva conta",()=>{
    const fechar=vi.fn();
    montar(<DialogoClassificacaoTeste usuario={usuario} onFechar={fechar} onSalvo={vi.fn()}/>);
    expect(screen.getByRole("button",{name:textos.usuariosTeste.confirmar})).toBeDisabled();
    fireEvent.click(screen.getByRole("switch",{name:textos.usuariosTeste.rotulo}));
    expect(classificar.mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:textos.gestao.formulario.cancelar}));
    expect(fechar).toHaveBeenCalledOnce();
    expect(classificar.mutate).not.toHaveBeenCalled();
  });
  it("confirmacao envia UUID e classificacao corretos",()=>{
    montar(<DialogoClassificacaoTeste usuario={usuario} onFechar={vi.fn()} onSalvo={vi.fn()}/>);
    fireEvent.click(screen.getByRole("switch",{name:textos.usuariosTeste.rotulo}));
    fireEvent.click(screen.getByRole("button",{name:textos.usuariosTeste.confirmar}));
    expect(classificar.mutate).toHaveBeenCalledWith({id:usuario.id,usuarioTeste:true},expect.anything());
  });
  it("conflito apresenta apenas identificadores tecnicos e preserva a selecao",()=>{
    classificar.isError=true;
    classificar.error=new ErroDeApi(409,{codigo:"USUARIO_TESTE_COM_VINCULOS",vinculos:[{recurso:"mensagem.remetente_id",registroId:"id-mensagem"}]},"conflito");
    montar(<DialogoClassificacaoTeste usuario={usuario} onFechar={vi.fn()} onSalvo={vi.fn()}/>);
    expect(screen.getByRole("alert")).toHaveTextContent(textos.usuariosTeste.comVinculos);
    expect(screen.getByRole("alert")).toHaveTextContent("mensagem.remetente_id: id-mensagem");
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked","false");
  });
  it("gravacao pendente desabilita confirmacao para impedir clique duplicado",()=>{
    classificar.isPending=true;
    montar(<DialogoClassificacaoTeste usuario={usuario} onFechar={vi.fn()} onSalvo={vi.fn()}/>);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-disabled","true");
    expect(screen.getByRole("button",{name:textos.usuariosTeste.confirmar})).toBeDisabled();
  });
});

describe("diálogos V2 de Gestão", () => {
  it("exige dados e senha inicial antes de criar com uma função permitida", () => {
    montar(<DialogoUsuario layoutV2 textos={textos.gestao} funcoesPermitidas={["ATENDENTE", "OPERADOR"]} podeAlterarFuncao onFechar={vi.fn()} />);
    const salvar = screen.getByRole("button", { name: textos.gestao.v2.criarUsuario });
    expect(salvar).toBeDisabled();
    expect(screen.queryByRole("radio", { name: /^Gestor/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(textos.gestao.formulario.nome), { target: { value: "Pessoa de teste" } });
    fireEvent.change(screen.getByLabelText(textos.gestao.formulario.email), { target: { value: "pessoa@example.invalid" } });
    expect(salvar).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(textos.gestao.v2.senhaExemplo), { target: { value: "senha-sintetica-123" } });
    fireEvent.click(screen.getByRole("radio", { name: /^Operador/ }));
    fireEvent.click(salvar);
    expect(criar.mutate).toHaveBeenCalledWith(expect.objectContaining({ papel: "OPERADOR", senha: "senha-sintetica-123" }), expect.anything());
  });

  it("edita dados mantendo a função e grava a troca de função somente no painel", () => {
    const { unmount } = montar(<DialogoUsuario layoutV2 existente={usuario} textos={textos.gestao} funcoesPermitidas={["ATENDENTE", "OPERADOR"]} podeAlterarFuncao onFechar={vi.fn()} />);
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(textos.gestao.v2.senhaExemplo)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(textos.gestao.formulario.nome), { target: { value: "Nome alterado" } });
    fireEvent.click(screen.getByRole("button", { name: textos.gestao.v2.salvarDados }));
    expect(editar.mutate).toHaveBeenCalledWith({ id: usuario.id, dados: { nome: "Nome alterado", email: usuario.email, papel: "ATENDENTE" } }, expect.anything());
    unmount();
    editar.mutate.mockClear();
    const onSujoChange = vi.fn();
    montar(<VisaoGeralIntegranteV2 usuario={usuario} textos={textos.gestao} funcoes={["ATENDENTE", "OPERADOR"]}
      podeAlterarFuncao quantidadeExcecoes={0} podeAlterarIa={false} onIa={vi.fn()} onSujoChange={onSujoChange} />);
    fireEvent.click(screen.getByRole("radio", { name: /^Operador/ }));
    expect(onSujoChange).toHaveBeenCalledWith(true);
    expect(editar.mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: textos.gestao.v2.salvarFuncao }));
    expect(editar.mutate).toHaveBeenCalledWith({ id: usuario.id, dados: { nome: usuario.nome, email: usuario.email, papel: "OPERADOR" } }, expect.anything());
  });
});
