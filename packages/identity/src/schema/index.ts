export * from "./appbasis";
export * from "./auth";

import * as appbasisSchema from "./appbasis";
import * as authSchema from "./auth";

export const schema = {
  ...authSchema,
  ...appbasisSchema,
};
