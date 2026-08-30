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

const snapshotId = "00000003-0000001B-1";

test("filters only the exact Neon provider default ACL TOC entries on the exported snapshot", async () => {
  let closed = false;
  const queries = [];
  const sql = {
    unsafe: async (query) => {
      queries.push(query.trim());
      if (query.includes("pg_default_acl")) return inventory;
      return [];
    },
  };
  const output = await createPortableRestoreList(
    {
      databaseUrl: "postgresql://backup:secret@example.invalid/app",
      snapshotId,
      tocText: toc,
    },
    {
      databaseFactory: () => ({
        client: {
          begin: async (callback) => callback(sql),
          end: async () => { closed = true; },
        },
      }),
    },
  );
  assert.equal(closed, true);
  assert.equal(queries[0], "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
  assert.equal(queries[1], `SET TRANSACTION SNAPSHOT '${snapshotId}'`);
  assert.match(queries[2], /pg_default_acl/);
  assert.match(output, /ACL public TABLE appbasis_permission/);
  assert.match(output, /ACL public SEQUENCE appbasis_permission_id_seq/);
  assert.doesNotMatch(output, /DEFAULT ACL/);
});

test("rejects invalid snapshot IDs before connecting", async () => {
  let opened = false;
  await assert.rejects(
    () => createPortableRestoreList(
      {
        databaseUrl: "postgresql://backup:secret@example.invalid/app",
        snapshotId: "not-a-snapshot'; RESET ROLE; --",
        tocText: toc,
      },
      { databaseFactory: () => { opened = true; throw new Error("must not connect"); } },
    ),
    /snapshot ID is invalid/,
  );
  assert.equal(opened, false);
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

test("fails closed on missing extra duplicate or differently owned DEFAULT ACL TOC entries", () => {
  assert.throws(
    () => filterExactProviderDefaultAclToc(toc.replace(/\n31;[^\n]+/, "")),
    /exact provider default ACL entries/,
  );
  assert.throws(
    () => filterExactProviderDefaultAclToc(`${toc}50; 826 202 DEFAULT ACL public DEFAULT PRIVILEGES FOR FUNCTIONS cloud_admin\n`),
    /unexpected default ACL entry/,
  );
  assert.throws(
    () => filterExactProviderDefaultAclToc(`${toc}51; 826 203 DEFAULT ACL public DEFAULT PRIVILEGES FOR TABLES cloud_admin\n`),
    /exact provider default ACL entries/,
  );
  assert.throws(
    () => filterExactProviderDefaultAclToc(toc.replace("TABLES cloud_admin", "TABLES app_owner")),
    /unexpected default ACL entry/,
  );
});
