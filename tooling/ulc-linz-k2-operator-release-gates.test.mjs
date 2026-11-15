import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const doc = readFileSync(new URL("../apps/ulc-linz/docs/K2-P01-OPERATOR-RELEASE-GATES.md", import.meta.url), "utf8");
test("seven separate operator decisions default to BLOCKED", () => {
  for (let n=1;n<=7;n++) assert.match(doc, new RegExp("\\| D0"+n+" \\|[^\\n]*\\| BLOCKED \\|"));
});
test("prior pilots and all four preceding draft packages are explicitly scoped",()=>{
  for (const s of ["43645974462","43647364218","#633","#634","#635","#636"]) assert.ok(doc.includes(s),s);
});
test("retention never implicitly authorizes R2 deletion",()=>{
  assert.match(doc,/21 Tage nur Vorschlag/); assert.match(doc,/keine.*automatische R2-Lifecycle-Löschung/);
});
test("media evidence is independent of database restore",()=>{
  assert.match(doc,/isolierter Medien-Restore/);assert.match(doc,/kein.*Medien-.*DSGVO-Nachweis/);
});
test("role and row-level security checks remain separate gates",()=>{
  assert.match(doc,/RLS/);assert.match(doc,/Cross-Org/);assert.match(doc,/--no-owner --no-acl/);
});
test("no promotion, deploy, production or daily backup is authorized",()=>{
  for(const s of ["APPBASIS_ULC_K2_BACKUP_ENABLED","keine Secret-Änderung","keine Echtdatenfreigabe","kein Deployment","gesondert"])assert.ok(doc.includes(s),s);
});
test("restore deletion reconciliation is a stop gate",()=>{
  assert.match(doc,/bereits gelöschte Personendaten/);assert.match(doc,/Re-Deletion/);
});
