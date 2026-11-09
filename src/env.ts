import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";

export interface Env {
  /** Owner token: the password on the /authorize page. */
  MCP_BEARER: string;
  LOSEIT_EMAIL: string;
  LOSEIT_PASSWORD: string;
  /** Shared secret nginx on the origin requires in X-Origin-Secret. */
  ORIGIN_SECRET: string;
  OAUTH_KV: KVNamespace;
  OAUTH_PROVIDER: OAuthHelpers;
}
