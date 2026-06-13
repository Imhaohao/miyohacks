#!/usr/bin/env python3
"""Probe the compiled A2A findings corpus and emit live-roster.json.

For each CSV row:
  1. Classify: watchlist rows and rows with no endpoint+no card are skipped;
     localhost endpoints are recorded as local_run_candidate (not probed).
  2. Fetch the agent card: live well-known at the endpoint origin first
     (/.well-known/agent-card.json then /.well-known/agent.json), falling back
     to the CSV card URL (usually GitHub raw).
  3. The card's own `url` field is treated as the authoritative A2A endpoint.
  4. Liveness: POST a JSON-RPC message/send capability ping to the endpoint.

Usage: python3 probe_corpus.py [--timeout 30]
"""

import csv
import json
import ssl
import sys
import uuid
import urllib.request
import urllib.error
from pathlib import Path

# macOS system python3 often lacks CA certs; prefer certifi, else skip verify
# (acceptable for a read-only liveness probe).
try:
    import certifi

    SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CTX = ssl._create_unverified_context()

HERE = Path(__file__).parent
CSV_PATH = HERE / "compiled-a2a-findings.csv"
OUT_PATH = HERE / "live-roster.json"

TIMEOUT = 30 if "--timeout" not in sys.argv else int(sys.argv[sys.argv.index("--timeout") + 1])

UA = "arbor-a2a-probe/1.0 (+https://github.com/Imzihao)"


def http_get_json(url, timeout=TIMEOUT):
    req = urllib.request.Request(url, headers={"accept": "application/json", "user-agent": UA})
    with urllib.request.urlopen(req, timeout=timeout, context=SSL_CTX) as res:
        body = res.read().decode("utf-8", "replace")
    return json.loads(body)


def http_post_json(url, payload, timeout=TIMEOUT):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        url,
        data=data,
        headers={"content-type": "application/json", "accept": "application/json", "user-agent": UA},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout, context=SSL_CTX) as res:
        body = res.read().decode("utf-8", "replace")
    return json.loads(body)


def origin_of(url):
    from urllib.parse import urlsplit

    p = urlsplit(url)
    return f"{p.scheme}://{p.netloc}"


def fetch_card(endpoint_url, csv_card_url):
    """Try live well-known paths at the endpoint origin, then the CSV card URL."""
    tried = []
    candidates = []
    if endpoint_url:
        o = origin_of(endpoint_url)
        candidates += [
            (f"{o}/.well-known/agent-card.json", "live_well_known_v030"),
            (f"{o}/.well-known/agent.json", "live_well_known_v02x"),
        ]
    if csv_card_url and csv_card_url.startswith("http"):
        candidates.append((csv_card_url, "csv_card_url"))
    for url, source in candidates:
        try:
            card = http_get_json(url, timeout=15)
            if isinstance(card, dict) and ("name" in card or "skills" in card or "url" in card):
                return card, url, source, tried
            tried.append({"url": url, "error": "not an agent card shape"})
        except Exception as e:  # noqa: BLE001
            tried.append({"url": url, "error": f"{type(e).__name__}: {e}"[:200]})
    return None, None, None, tried


def ping_message_send(endpoint):
    """JSON-RPC message/send capability ping. Returns (ok, detail)."""
    payload = {
        "jsonrpc": "2.0",
        "id": f"arbor-probe-{uuid.uuid4().hex[:8]}",
        "method": "message/send",
        "params": {
            "message": {
                "role": "user",
                "kind": "message",
                "messageId": uuid.uuid4().hex,
                "parts": [
                    {
                        "kind": "text",
                        "text": "Hello from the Arbor agent marketplace. This is a capability check - please reply with one line describing what you can do.",
                    }
                ],
            }
        },
    }
    try:
        res = http_post_json(endpoint, payload)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")[:300]
        return False, f"HTTP {e.code}: {body}"
    except Exception as e:  # noqa: BLE001
        return False, f"{type(e).__name__}: {e}"[:300]
    if "result" in res:
        return True, json.dumps(res["result"])[:600]
    if "error" in res:
        # A JSON-RPC error still proves the endpoint speaks JSON-RPC/A2A.
        return True, f"jsonrpc_error: {json.dumps(res['error'])[:300]}"
    return False, f"unrecognized response: {json.dumps(res)[:300]}"


def kebab(name):
    import re

    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s[:40].rstrip("-")


def main():
    rows = list(csv.DictReader(open(CSV_PATH)))
    roster = {"probed_at": "2026-06-11", "agents": [], "skipped": []}

    for row in rows:
        name = row["name"].strip()
        status = row["finding_status"].strip()
        endpoint = row["endpoint_url"].strip()
        card_url = row["card_or_docs_url"].strip()

        if status.startswith("watchlist") or status.startswith("partial"):
            roster["skipped"].append({"name": name, "reason": f"finding_status={status}"})
            continue
        if not endpoint and not card_url.startswith("http"):
            roster["skipped"].append({"name": name, "reason": "no endpoint and no fetchable card"})
            continue
        if endpoint.startswith("http://localhost"):
            roster["skipped"].append(
                {"name": name, "reason": "localhost sample agent (local_run_candidate)", "card_url": card_url}
            )
            continue
        if not endpoint:
            roster["skipped"].append({"name": name, "reason": "no live endpoint in corpus", "card_url": card_url})
            continue

        print(f"--- {name}", file=sys.stderr)
        card, resolved_card_url, card_source, tried = fetch_card(endpoint, card_url)
        entry = {
            "name": name,
            "company": row["company"].strip(),
            "agent_id": kebab(name),
            "csv_endpoint": endpoint,
            "card_url": resolved_card_url,
            "card_source": card_source,
            "card_fetch_attempts": tried,
            "category": row["niche_or_category"].strip(),
        }
        if not card:
            entry["status"] = "card_unreachable"
            roster["agents"].append(entry)
            print("    card unreachable", file=sys.stderr)
            continue

        card_endpoint = card.get("url") or endpoint
        entry["card_name"] = card.get("name")
        entry["card_description"] = (card.get("description") or "")[:300]
        entry["a2a_endpoint"] = card_endpoint
        entry["protocol_version"] = card.get("protocolVersion") or card.get("version")
        entry["security"] = card.get("security") or []
        entry["security_schemes"] = list((card.get("securitySchemes") or {}).keys())
        entry["skills"] = [
            {"id": s.get("id"), "name": s.get("name"), "description": (s.get("description") or "")[:200]}
            for s in (card.get("skills") or [])
        ]

        ok, detail = ping_message_send(card_endpoint)
        if not ok and card_endpoint != endpoint:
            ok2, detail2 = ping_message_send(endpoint)
            if ok2:
                entry["a2a_endpoint"] = endpoint
                ok, detail = ok2, detail2
            else:
                detail = f"card_url_ep: {detail} | csv_ep: {detail2}"
        entry["status"] = "live" if ok else "card_ok_endpoint_dead"
        entry["probe_detail"] = detail
        roster["agents"].append(entry)
        print(f"    {entry['status']}: {detail[:120]}", file=sys.stderr)

    OUT_PATH.write_text(json.dumps(roster, indent=2, ensure_ascii=False))
    live = [a for a in roster["agents"] if a["status"] == "live"]
    print(f"\n{len(live)} live / {len(roster['agents'])} probed / {len(roster['skipped'])} skipped", file=sys.stderr)
    print(f"wrote {OUT_PATH}", file=sys.stderr)


if __name__ == "__main__":
    main()
