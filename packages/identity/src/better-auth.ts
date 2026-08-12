import { schema } from "./schema/index";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { admin, username } from "better-auth/plugins";

export interface BetterAuthRuntimeOptions {
  database: Parameters<typeof drizzleAdapter>[0];
  secret: string;
  baseURL: string;
}

/**
 * Infrastructure composition boundary. No app or React component may import
 * Better Auth directly; server composition uses this package subpath.
 *
 * Better Auth's `role`/`admin` concepts authorize technical account
 * administration only. AppBasis business permissions remain separate and will
 * be enforced server-side by the future `packages/permissions` package.
 */
export function createBetterAuthRuntime(options: BetterAuthRuntimeOptions) {
  return betterAuth({
    baseURL: options.baseURL,
    secret: options.secret,
    database: drizzleAdapter(options.database, {
      provider: "pg",
      schema,
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
    },
    disabledPaths: [
      "/sign-up/email",
      "/sign-in/email",
      "/is-username-available",
    ],
    plugins: [
      username({
        minUsernameLength: 3,
        maxUsernameLength: 30,
        usernameValidator: (value) => /^[a-z0-9._]+$/.test(value),
      }),
      admin(),
    ],
    telemetry: {
      enabled: false,
    },
  });
}
