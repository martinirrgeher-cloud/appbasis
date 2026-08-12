CREATE TABLE "appbasis_identity_operation" (
	"operation_id" text PRIMARY KEY NOT NULL,
	"operation_key" text NOT NULL,
	"kind" text NOT NULL,
	"identity_id" text,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "appbasis_identity_operation_operation_key_unique" UNIQUE("operation_key")
);
