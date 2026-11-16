#!/usr/bin/env python3
"""Rewrite proxymock's Gatling and k6 exports so each run uses the cart IDs and record locators it creates.

The raw exports replay recorded IDs (C000001...), which only work once against a fresh Redis.
Usage: correlate_exports.py <recording-dir> <gatling.java> <k6.js>
"""
import glob
import re
import sys

recording, gatling_path, k6_path = sys.argv[1:4]

# Recorded locator -> the cart whose checkout issued it.
locator_cart = {}
for f in glob.glob(f"{recording}/localhost/*.md"):
    text = open(f).read()
    m = re.search(r"^POST \S+/api/carts/(C\d{6})/checkout ", text, re.M)
    loc = re.search(r'"recordLocator": "([A-Z0-9]{6})"', text)
    if m and loc:
        locator_cart[loc.group(1)] = m.group(1)


def plan(requests):
    """requests: list of (method, path, body). Returns per-request (capture, refs)."""
    out, created, seen_checkout = [], 0, set()
    for method, path, body in requests:
        capture = None
        if method == "POST" and path == "/api/carts":
            pax = re.search(r'passengers\\?"?\s*:\s*(\d+)', body or "")
            if pax and 1 <= int(pax.group(1)) <= 9:
                created += 1
                capture = ("cartId", f"C{created:06d}")
        m = re.fullmatch(r"/api/carts/(C\d{6})/checkout", path)
        if method == "POST" and m and m.group(1) not in seen_checkout:
            seen_checkout.add(m.group(1))
            loc = next((l for l, c in locator_cart.items() if c == m.group(1)), None)
            if loc:
                capture = ("recordLocator", loc)
        out.append(capture)
    known = {f"C{i:06d}" for i in range(1, created + 1)} | set(locator_cart)
    missing = set(locator_cart.values()) - known
    if missing:
        sys.exit(f"cart creations not found for {sorted(missing)}")
    return out, known


def ref_pattern(known):
    return re.compile("|".join(sorted(map(re.escape, known), key=len, reverse=True)))


# Gatling: save IDs from responses with jsonPath checks, then reference them with #{name}.
src = open(gatling_path).read()
blocks = re.split(r"(?=\n    \.exec\(http\()", src)
reqs = []
for b in blocks[1:]:
    m = re.search(r'\.(get|post|put|delete)\("http://[^/"]+([^"?]*)', b)
    body = re.search(r'StringBody\("(.*)"\)', b)
    reqs.append((m.group(1).upper(), m.group(2), body.group(1) if body else ""))
captures, known = plan(reqs)
pat = ref_pattern(known)
for i, cap in enumerate(captures, start=1):
    b = blocks[i]
    b = re.sub(r'(\.(?:get|post|put|delete)\(")([^"]+)', lambda m: m.group(1) + pat.sub(lambda x: "#{" + x.group(0) + "}", m.group(2)), b, count=1)
    if cap:
        b = re.sub(r"\n    \)$", f'\n      .check(jsonPath("$.{cap[0]}").saveAs("{cap[1]}"))\n    )', b, count=1)
    blocks[i] = b
open(gatling_path, "w").write("".join(blocks))

# k6: keep IDs in a per-iteration map filled from responses.
src = open(k6_path).read()
blocks = re.split(r"(?<=\})(?=\{\n\t\tlet params)", src)
start = 1 if not blocks[0].rstrip().endswith("}") or "let params" not in blocks[0] else 0
reqs, idx = [], []
for i, b in enumerate(blocks):
    m = re.search(r"let method = '(\w+)';\s*let body = '(.*)';\s*let url = new URL\('http://[^/']+([^'?]*)", b, re.S)
    if m:
        reqs.append((m.group(1), m.group(3), m.group(2)))
        idx.append(i)
captures, known = plan(reqs)
pat = ref_pattern(known)
for i, cap in zip(idx, captures):
    b = blocks[i]
    b = re.sub(r"(let url = new URL\(')([^']+)", lambda m: m.group(1) + pat.sub(lambda x: "' + ids['" + x.group(0) + "'] + '", m.group(2)), b, count=1)
    if cap:
        b = b.replace("http.request(method, url.toString(), body, params);",
                      f"let res = http.request(method, url.toString(), body, params);\n\t\tif (res.status === 201) ids['{cap[1]}'] = res.json('{cap[0]}');", 1)
    blocks[i] = b
out = "".join(blocks).replace("export default function () {\n", "export default function () {\n\tconst ids = {};\n", 1)
open(k6_path, "w").write(out)
print(f"correlated {len(known)} IDs across {len(reqs)} requests")
