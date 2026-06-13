#!/bin/bash
# Round 2: wider GitHub code search for A2A cards + live endpoint URLs in docs.
set -uo pipefail
TMP=$(mktemp -d)

queries=(
  'filename:agent-card.json'
  'filename:agent.json "protocolVersion"'
  '"well-known/agent-card.json" language:Markdown'
  '"AgentCard" "url" "https://" "skills" language:Python'
  '"a2a" "message/send" "https://" language:Markdown'
  '"agent2agent" "agent card" "https://"'
)

for q in "${queries[@]}"; do
  for page in 1 2 3 4 5; do
    res=$(gh api -X GET search/code -f q="$q" -f per_page=100 -f page=$page 2>/dev/null) || break
    count=$(echo "$res" | jq '.items | length' 2>/dev/null) || break
    [ "$count" = "0" ] && break
    echo "$res" | jq -r '.items[] | "\(.repository.full_name)\t\(.path)"' >> "$TMP/hits.tsv"
    sleep 7
  done
done

sort -u "$TMP/hits.tsv" 2>/dev/null > "$TMP/hits-uniq.tsv" || touch "$TMP/hits-uniq.tsv"
echo "v2 code search hits: $(wc -l < "$TMP/hits-uniq.tsv")" >&2

# fetch raw files; extract any https URLs near a2a markers, plus card url fields
while IFS=$'\t' read -r repo path; do
  for branch in main master; do
    raw="https://raw.githubusercontent.com/$repo/$branch/$path"
    body=$(curl -sf --max-time 8 "$raw") || continue
    # card url field
    echo "$body" | jq -r '.url // empty' 2>/dev/null | grep -E '^https?://' | grep -vE 'localhost|127\.0\.0\.1|0\.0\.0\.0'
    # any https URLs in markdown/python that look like deployments or card paths
    echo "$body" | grep -oE 'https://[a-zA-Z0-9.-]+\.(onrender\.com|run\.app|workers\.dev|fly\.dev|up\.railway\.app|hf\.space|vercel\.app|herokuapp\.com|azurewebsites\.net|web\.app|supabase\.co)[a-zA-Z0-9/._-]*' | head -10
    echo "$body" | grep -oE 'https://[a-zA-Z0-9./_-]+/\.well-known/agent(-card)?\.json' | head -5
    break
  done
done < "$TMP/hits-uniq.tsv" | sort -u

rm -rf "$TMP"
