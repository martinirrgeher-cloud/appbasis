import { Hono } from "hono";

import {
  createIdentityHttpHandlers,
  type IdentityHttpService,
} from "@appbasis/identity/http";

export interface GeneratedAppDependencies {
  identity: IdentityHttpService;
  secureCookies?: boolean;
}

export function createGeneratedApp(dependencies: GeneratedAppDependencies) {
  const app = new Hono();
  const identityHttp = createIdentityHttpHandlers({
    identity: dependencies.identity,
    secureCookies: dependencies.secureCookies ?? true,
  });

  app.get("/api/health", (context) =>
    context.json({ status: "ok", appId: "ulc-linz" }),
  );
  app.post("/api/auth/sign-in", (context) =>
    identityHttp.signIn(context.req.raw),
  );
  app.get("/api/auth/session", (context) =>
    identityHttp.session(context.req.raw),
  );
  app.post("/api/auth/change-required-password", (context) =>
    identityHttp.changeRequiredPassword(context.req.raw),
  );

  return app;
}
