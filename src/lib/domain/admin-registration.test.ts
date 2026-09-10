import { describe, expect, it } from "vitest";
import { inviteSchema, mayDelegate, unitSchema, type AdminGrant } from "./admin-registration";
const grant: AdminGrant = { unitId: "unit-a", role: "GERENTE_UBS", domains: ["administracao","protocolos"], operations: ["visualizar","criar","executar"] };
describe("administrative delegation", () => {
  it("permits only a subset in the same unit", () => expect(mayDelegate(grant,"unit-a","EXECUTOR",["protocolos"],["visualizar","executar"])).toBe(true));
  it.each([null,"unit-b"])("blocks broadening unit scope to %s", unit => expect(mayDelegate(grant,unit,"LEITOR",["protocolos"],["visualizar"])).toBe(false));
  it.each(["ADMIN_SISTEMA","GESTOR_ORGANIZACAO","GERENTE_UBS"] as const)("blocks role escalation to %s", role => expect(mayDelegate(grant,"unit-a",role,["protocolos"],["visualizar"])).toBe(false));
  it("rejects domains and operations the caller does not hold", () => {
    expect(mayDelegate(grant,"unit-a","EXECUTOR",["indicadores"],["visualizar"])).toBe(false);
    expect(mayDelegate(grant,"unit-a","EXECUTOR",["protocolos"],["publicar"])).toBe(false);
  });
  it("does not mistake administrative read access for invitation authority", () => expect(mayDelegate({...grant,role:"LEITOR"},"unit-a","LEITOR",["protocolos"],["visualizar"])).toBe(false));
  it("does not allow an organization manager to appoint system administrators", () => expect(mayDelegate({...grant,unitId:null,role:"GESTOR_ORGANIZACAO"},null,"ADMIN_SISTEMA",["protocolos"],["visualizar"])).toBe(false));
  it("requires permissions and valid invitation fields", () => expect(inviteSchema.safeParse({email:"invalid",domains:[],operations:[]}).success).toBe(false));
  it("requires seven CNES digits and a valid operation ID", () => expect(unitSchema.safeParse({name:"UBS",cnes:"123",operationId:"bad"}).success).toBe(false));
});
