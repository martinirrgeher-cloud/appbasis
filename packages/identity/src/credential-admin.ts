/** Keep credential hashing aligned with the Better Auth runtime without importing the full server or Drizzle model. */
export { hashPassword as hashIdentityTemporaryPassword } from "better-auth/crypto";
