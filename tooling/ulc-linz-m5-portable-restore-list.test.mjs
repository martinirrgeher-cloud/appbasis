import assert from "node:assert/strict";
import test from "node:test";

import {
  assertExactProviderDefaultAclInventory,
  createPortableRestoreList,
  filterExactProviderDefaultAclToc,
} from "./ulc-linz-m5-portable-restore-list.mjs";

const inventory = [
  {
    owner_role: "cloud_admin",
    schema_name: "public",
    object_type: "S",
    acl: "neon_superuser=r*w*U*/cloud_admin",
  },
  {
    owner_role: "cloud_admin",
    schema_name: "public",
    object_type: "r",
    acl: "neon_superuser=a*r*w*d*D*x*t*m*/cloud_admin",
  },
];

const toc = [
  "; Archive created at 2026-08-27 04:07:54 UTC",
  "10; 1259 100 TABLE public appbasis_permission cloud_admin",
  "20; 0 0 ACL public TABLE appbasis_permission cloud_admin",
  "30; 826 200 DEFAULT ACL public DEFAULT PRIVILEGES FOR SEQUENCES cloud_admin",
  "31; 826 201 DEFAULT ACL public DEFAULT PRIVILEGES FOR TABLES cloud_admin",
  "40; 0 0 ACL public SEQUENCE appbasis_permission_id_seq cloud_admin",
  "",
].join("\n");

test("filters only the exact Neon provider default ACL TOC entries", async () => {
  let closed = false;
  const output = await createPortableRestoreList(
    { databaseUrl: "postgresql://backup:secret@example.invalid/app", tocText: toc },
    {
      databaseFactory: () => ({
        client: {
          unsafe: async () => inventory,
          end: async () => { closed = true; },
        },
      }),
    },
  );
  assert.equal(closed, true);
  assert.match(output, /ACL public TABLE appbasis_permission/);
  assert.match(output, /ACL public SEQUENCE appbasis_permission_id_seq/);
  assert.doesNotMatch(output, /DEFAULT ACL/);
});

test("fails closed when production default ACL inventory drifts", () => {
  assert.throws(
    () => assertExactProviderDefaultAclInventory([...inventory, {
      owner_role: "app_owner",
      schema_name: "public",
      object_type: "r",
      acl: "backup=r/app_owner",
    }]),
    /inventory is unexpected/,
  );
  assert.throws(
    () => assertExactProviderDefaultAclInventory([
      inventory[0],
      { ...inventory[1], acl: "neon_superuser=r/cloud_admin" },
    ]),
    /inventory is unexpected/,
  );
});

test("fails closed on missing extra or differently owned DEFAULT ACL TOC entries", () => {
  assert.throws(
    () => filterExactProviderDefaultAclToc(toc.replace(/\n31;[^\n]+/, "")),
    /exact provider default ACL entries/,
  );
  assert.throws(
    () => filterExactProviderDefaultAclToc(`${toc}50; 826 202 DEFAULT ACL public DEFAULT PRIVILEGES FOR FUNCTIONS cloud_admin\n`),
    /unexpected default ACL entry/,
  );
  assert.throws(
    () => filterExactProviderDefaultAclToc(toc.replace("TABLES cloud_admin", "TABLES app_owner")),
    /unexpected default ACL entry/,
  );
});
