import {describe,expect,it} from "vitest";
import {safeSpreadsheetValue,toCsv} from "./export";
describe("authorized exports",()=>{
  it("neutralizes spreadsheet formulas",()=>expect(safeSpreadsheetValue("=HYPERLINK(\"x\")")).toBe("'=HYPERLINK(\"x\")"));
  it("emits UTF-8 CSV with escaped fields",()=>expect(toCsv(["name"],[{name:'UBS "Centro"'}])).toContain('"UBS ""Centro"""'));
});
