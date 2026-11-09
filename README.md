# loseit-mcp-gateway

Puts an OAuth 2.1 login in front of a self-hosted [loseit-mcp](https://github.com/mxbrunet/loseit-mcp) server, so
Lose It! works as a custom connector in claude.ai, and installs that server in a locked-down way. Two pieces:

| Piece | What it does |
|---|---|
| Cloudflare Worker (`src/`) | OAuth login (consent page whose password is your owner token), then proxies `/mcp` to your server with your Lose It login added from Worker secrets |
| `deploy/droplet/` | Installs loseit-mcp as a no-login, memory-capped systemd service on `127.0.0.1:8001`, and gates its nginx location with a secret header |

```
Claude ──OAuth──▶ Worker (loseit.<you>) ──secret header + Basic auth──▶ nginx ──▶ loseit-mcp (localhost:8001)
```

Your Lose It password lives only as a Cloudflare secret; the server never writes it to disk. The origin returns 403 to
anything without the shared `X-Origin-Secret` header.

> **Unofficial and fragile.** Lose It has no public API. The server speaks the web app's private protocol, which is tied
> to build identifiers that Lose It rotates. When tools start failing, see [docs/LOSEIT.md](docs/LOSEIT.md) to refresh them.
> On the build I tested, food search, the diary and `whoami` worked and `get_weight_history` did not; food and weight writes
> were verified only as dry runs.

Tools (from the origin): `search_food`, `describe_food`, `get_diary`, `log_food`, `log_custom_food`, `delete_entry`,
`log_weight`, `get_weight_history`, `server_status`, `whoami`.

## Setup

You need a Cloudflare account with a domain, and a small Linux server with nginx (a 1 GB VPS is enough; CloudPanel was used).

**1. The server**

1. `apt-get install python3.12-venv`, then as root run
   `ORIGIN_HOST=loseit-origin.example.com STRONG_NAME=<hex> POLICY_HASH=<hex> bash deploy/droplet/install-loseit.sh`.
   Get the two identifiers from [docs/LOSEIT.md](docs/LOSEIT.md).
2. Create a **DNS-only** record for the origin host, issue a Let's Encrypt certificate, and reverse-proxy the host to
   `http://127.0.0.1:8001`.
3. Put a 64-hex secret (`openssl rand -hex 32`) in `/root/.loseit_origin_secret` and run
   `python3 deploy/droplet/patch-nginx.py /etc/nginx/sites-enabled/<origin-host>.conf`. It adds the header check, tests nginx,
   reloads, and rolls back on a bad config. Only the proxied location is gated, so certificate renewals keep working.

**2. The Worker**

1. `npm install`, `cp wrangler.jsonc wrangler.local.jsonc`, create a KV namespace (`npx wrangler kv namespace create LOSEIT_OAUTH_KV`),
   and fill in the id, your hostname, `__ORIGIN__` (this Worker) and `__UPSTREAM__` (the origin host).
2. `npx wrangler deploy --config wrangler.local.jsonc`
3. Secrets: `MCP_BEARER` (your owner token, `openssl rand -hex 32`), `ORIGIN_SECRET` (the same 64-hex value as above),
   `LOSEIT_EMAIL`, `LOSEIT_PASSWORD`.
4. Check: `OWNER_TOKEN=<token> python scripts/oauth_flow_test.py https://<worker-host>`. The origin needs an MCP session
   handshake, so the bare `tools/call` steps may show a 400 while auth itself passes.

**3. Connect Claude**: claude.ai Settings, Connectors, Add custom connector, `https://<worker-host>/mcp`, paste the owner token.

## Security

Anyone with the owner token can read and change your food log and weight. The shared secret and owner token are
separate on purpose; rotate either with `wrangler secret put` (and re-run the nginx patch for the origin secret).

## License

MIT, see [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).
