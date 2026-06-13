#!/bin/bash
# Harvest A2A agent-card candidates from GitHub code search + HF Spaces API.
# Emits candidate origins/card URLs to stdout (one per line).
# GitHub code search rate limit: ~10 req/min — sleeps between pages.

set -uo pipefail
TMP=$(mktemp -d)

# --- GitHub code search: well-known agent cards ---------------------------
queries=(
  'filename:agent-card.json path:.well-known'
  'filename:agent.json path:.well-known'
  '"well-known/agent-card.json" "url" language:JSON'
  '"protocolVersion" "skills" filename:agent-card.json'
)

for q in "${queries[@]}"; do
  for page in 1 2 3 4 5 6 7 8 9 10; do
    res=$(gh api -X GET search/code -f q="$q" -f per_page=100 -f page=$page 2>/dev/null) || break
    count=$(echo "$res" | jq '.items | length' 2>/dev/null) || break
    [ "$count" = "0" ] && break
    echo "$res" | jq -r '.items[] | "\(.repository.full_name)\t\(.path)"' >> "$TMP/hits.tsv"
    sleep 7
  done
done

sort -u "$TMP/hits.tsv" 2>/dev/null > "$TMP/hits-uniq.tsv" || touch "$TMP/hits-uniq.tsv"
echo "github code search hits: $(wc -l < "$TMP/hits-uniq.tsv")" >&2

# --- fetch each card file, extract url field ------------------------------
# raw.githubusercontent.com has no auth rate issue at this scale
while IFS=$'\t' read -r repo path; do
  for branch in main master; do
    raw="https://raw.githubusercontent.com/$repo/$branch/$path"
    body=$(curl -sf --max-time 8 "$raw") || continue
    url=$(echo "$body" | jq -r '.url // empty' 2>/dev/null)
    if [ -n "$url" ]; then
      case "$url" in
        http*localhost*|http*127.0.0.1*|http*0.0.0.0*) ;;
        https://*|http://*) echo "$url" ;;
      esac
    fi
    # the raw card itself is probeable too (repo card evidence)
    echo "$raw"
    break
  done
done < "$TMP/hits-uniq.tsv"

# --- HF Spaces with a2a ----------------------------------------------------
for term in a2a "a2a-protocol" "agent2agent" "a2a-sdk" "a2a agent"; do
  curl -sf --max-time 15 "https://huggingface.co/api/spaces?search=$(echo $term | sed 's/ /%20/g')&limit=100" \
    | jq -r '.[].id' 2>/dev/null
done | sort -u | while read -r sid; do
  # space id owner/name -> https://owner-name.hf.space
  host=$(echo "$sid" | tr '/' '-' | tr '[:upper:]' '[:lower:]' | tr '_' '-')
  echo "https://$host.hf.space"
done

rm -rf "$TMP"
