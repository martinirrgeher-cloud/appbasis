import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";

// A person is an AppBasis record, not an authentication account. It may exist
// without a login and can remain after an identity is disabled.
export const person = pgTable("appbasis_person", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  contactEmail: text("contact_email"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const identitySecurityState = pgTable(
  "appbasis_identity_security_state",
  {
    identityId: text("identity_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "restrict" }),
    personId: text("person_id")
      .unique()
      .references(() => person.id, { onDelete: "set null" }),
    mustChangePassword: boolean("must_change_password").default(true).notNull(),
    passwordChangedAt: timestamp("password_changed_at"),
    // Audit timestamp only. Better Auth's `banned` field remains the
    // authoritative technical account status.
    disabledAt: timestamp("disabled_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
);

// Identity operations contain only stable reconciliation metadata. Provider
// payloads and credentials remain exclusively within the auth provider.
export const identityOperation = pgTable("appbasis_identity_operation", {
  operationId: text("operation_id").primaryKey(),
  operationKey: text("operation_key").notNull().unique(),
  kind: text("kind").notNull(),
  identityId: text("identity_id"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
