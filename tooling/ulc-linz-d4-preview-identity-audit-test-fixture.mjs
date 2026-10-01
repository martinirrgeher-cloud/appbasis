// A structural sample of pg_get_constraintdef's normalized output. The real
// PostgreSQL 18 E2E test additionally validates the server's actual deparser.
export const CANONICAL_PG_CHECK = `CHECK (
  ((provisioning_owner IS NULL) AND (actor_principal_id IS NULL) AND (reason IS NULL))
  OR
  (((kind)::text = 'provision'::text)
    AND (provisioning_owner IS NOT NULL)
    AND (actor_principal_id IS NOT NULL)
    AND (reason IS NOT NULL)
    AND (char_length(provisioning_owner) >= 1)
    AND (char_length(provisioning_owner) <= 120)
    AND ((provisioning_owner)::text = btrim(provisioning_owner))
    AND (char_length(actor_principal_id) >= 1)
    AND (char_length(actor_principal_id) <= 200)
    AND ((actor_principal_id)::text = btrim(actor_principal_id))
    AND (char_length(reason) >= 1)
    AND (char_length(reason) <= 500)
    AND ((reason)::text = btrim(reason)))
)`;

export function canonicalIdentityDiscriminator() {
  return {
    column_name: "kind",
    data_type: "text",
    not_null: true,
    has_default: false,
    generated: "",
    identity: "",
  };
}

export function canonicalIdentityColumns() {
  return ["provisioning_owner", "actor_principal_id", "reason"].map(
    (column_name) => ({
      column_name,
      data_type: "text",
      not_null: false,
      has_default: false,
      generated: "",
      identity: "",
    }),
  );
}

export function canonicalIdentityConstraints() {
  return [{ definition: CANONICAL_PG_CHECK, validated: true }];
}
