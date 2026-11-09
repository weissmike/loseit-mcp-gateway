"""Require an X-Origin-Secret header on the reverse-proxy location of a CloudPanel nginx vhost.

Usage (as root):
  1. clpctl site:add:reverse-proxy --domainName=<origin-host> --reverseProxyUrl=http://127.0.0.1:8001 ...
  2. clpctl lets-encrypt:install:certificate --domainName=<origin-host>   (record must be DNS-only)
  3. put a 64-hex secret in /root/.loseit_origin_secret, then:
       python3 patch-nginx.py /etc/nginx/sites-enabled/<origin-host>.conf

Only the proxied location is gated, so Let's Encrypt renewals (served from disk) keep working.
The same secret goes into the gateway Worker as the ORIGIN_SECRET secret.
"""
import os, re, subprocess, sys

vhost = sys.argv[1]
secret_file = "/root/.loseit_origin_secret"
secret = open(secret_file).read().strip()
assert re.fullmatch(r"[0-9a-f]{64}", secret), "secret must be 64 hex chars"

s = open(vhost).read()
marker = "  location @reverse_proxy {\n"
assert marker in s and "http_x_origin_secret" not in s, "vhost not in expected state"
open(vhost, "w").write(s.replace(marker, marker + '    if ($http_x_origin_secret != "%s") { return 403; }\n' % secret, 1))

t = subprocess.run(["nginx", "-t"], capture_output=True, text=True)
print(t.stderr.strip().splitlines()[-1])
if t.returncode != 0:
    open(vhost, "w").write(s)   # roll back
    sys.exit("nginx -t failed; rolled back")
subprocess.run(["systemctl", "reload", "nginx"], check=True)
os.remove(secret_file)
print("patched and reloaded")
