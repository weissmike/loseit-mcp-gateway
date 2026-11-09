# Lose It! notes

Lose It publishes no API. [mxbrunet/loseit-mcp](https://github.com/mxbrunet/loseit-mcp) speaks the private GWT-RPC
protocol of the web app, which is tied to two build identifiers that change whenever Lose It ships a new web build:

- `LOSEIT_STRONG_NAME`: the GWT *permutation*, sent as the `X-GWT-Permutation` header.
- `LOSEIT_POLICY_HASH`: the serialization policy of the `LoseItService` RPC interface, inside the request body.

## Symptom

Tools return "Lose It's private API did not respond as expected ... refresh the GWT build identifiers", with an
`IncompatibleRemoteServiceException` in the detail. `whoami` still works because login is a separate endpoint.

## Refreshing them (about 10 minutes, no login needed)

1. Fetch `https://d3hsih69yn4d89.cloudfront.net/web/web.nocache.js`. It maps browser and locale to a permutation:
   five 32-hex values are listed and selected by calls like `k([Mb,Yb],rc)`. The Chrome/Safari (`webkit`) one is what a
   normal browser uses; take that one for `LOSEIT_STRONG_NAME`.
2. Download `https://d3hsih69yn4d89.cloudfront.net/web/<STRONG_NAME>.cache.js` (about 850 KB).
3. In that file, find the `LoseItService` proxy. Its constructor looks like `Fvd.call(this,Vh(),null,'<32-HEX>',Serializer)`,
   and the class that sets `'web/service'` instantiates it. That 32-hex string is `LOSEIT_POLICY_HASH`.
   The identifiers are minified and change per build: search for `'web/service'` and follow the proxy class it creates.
4. Update the two `Environment=` lines in the systemd unit and run `systemctl restart loseit-mcp`.

## Known gaps on the build tested (Nov 2026)

- `get_diary`, `search_food`, `whoami` and the dry runs of the write tools worked after refreshing.
- `get_weight_history` failed for every date ("response too large to decode"), which indicates a protocol change for
  that call. Weight can be read from Google Health instead if your scale writes there.
- Real food and weight writes were verified only as dry runs.

## Why a separate server

The Python server needs an always-on host. The gateway Worker handles OAuth and keeps your Lose It credentials
as Cloudflare secrets (sent per request as `Authorization: Basic`), so the password is never written to the
server's disk. The origin refuses any request without the shared `X-Origin-Secret` header.
