import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import { authorize, same } from "./authorize.js";
import type { Env } from "./env.js";

// Injected at build time from the "define" block in wrangler config (see wrangler.example.jsonc).
declare const __ORIGIN__: string;
declare const __UPSTREAM__: string;
const ORIGIN = __ORIGIN__;
const UPSTREAM = __UPSTREAM__;

const publicApp = new Hono<{ Bindings: Env }>();
publicApp.get("/", (c) => c.text("loseit-mcp gateway — MCP endpoint: /mcp"));
publicApp.get("/health", (c) => c.json({ ok: true }));
publicApp.all("/authorize", (c) => authorize(c.req.raw, c.env));

/** Reached only with a valid OAuth token (or the owner bearer). Forwards to the droplet. */
const mcpHandler = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext & { props?: unknown }): Promise<Response> {
    if (!ctx.props) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const url = new URL(request.url);
    const headers = new Headers();
    for (const name of ["accept", "content-type", "mcp-session-id", "mcp-protocol-version", "last-event-id"]) {
      const v = request.headers.get(name);
      if (v) headers.set(name, v);
    }
    // Never forward the caller's OAuth token; the origin gets Lose It credentials instead.
    headers.set("Authorization", "Basic " + btoa(`${env.LOSEIT_EMAIL}:${env.LOSEIT_PASSWORD}`));
    headers.set("X-Origin-Secret", env.ORIGIN_SECRET);
    const hasBody = !["GET", "HEAD"].includes(request.method);
    const upstream = await fetch(`${UPSTREAM}${url.pathname}${url.search}`, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      redirect: "manual",
    });
    // Pass the (possibly streaming) response straight back, minus hop-by-hop headers.
    const out = new Headers(upstream.headers);
    for (const h of ["connection", "keep-alive", "transfer-encoding", "content-encoding", "content-length"]) out.delete(h);
    return new Response(upstream.body, { status: upstream.status, headers: out });
  },
};

export default new OAuthProvider<Env>({
  apiRoute: "/mcp",
  apiHandler: mcpHandler,
  defaultHandler: { fetch: (request, e, ctx) => publicApp.fetch(request, e, ctx) },
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/oauth/token",
  clientRegistrationEndpoint: "/oauth/register",
  scopesSupported: ["mcp"],
  accessTokenTTL: 60 * 60,
  refreshTokenTTL: 60 * 60 * 24 * 90,
  resourceMetadata: {
    resource: `${ORIGIN}/mcp`,
    authorization_servers: [ORIGIN],
    resource_name: "Lose It MCP",
  },
  resolveExternalToken: async ({ token, env: e }) =>
    await same(token, e.MCP_BEARER) ? { props: { owner: true, legacy: true }, audience: `${ORIGIN}/mcp` } : null,
});
