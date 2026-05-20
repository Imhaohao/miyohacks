# Jira Agent Service

Dedicated external A2A service that maps structured agent messages to Jira REST API operations.

## Endpoints

- `GET /agent-card`
- `POST /message/send`
- `POST /tasks/send`
- `GET /healthz`

## Capabilities

- `jira.create_issue`
- `jira.get_issue`
- `jira.search_issues`
- `jira.add_comment`
- `jira.transition_issue`

## OAuth2 Configuration

Set either a static access token or refresh-token flow:

- `JIRA_OAUTH_ACCESS_TOKEN` (optional static bearer)
- `JIRA_OAUTH_CLIENT_ID`
- `JIRA_OAUTH_CLIENT_SECRET`
- `JIRA_OAUTH_REFRESH_TOKEN`
- `JIRA_OAUTH_CLOUD_ID` (preferred for Atlassian API gateway)
- `JIRA_BASE_URL` (fallback direct base URL if cloud id absent)

## Safety Controls

- `JIRA_ALLOWED_PROJECTS` (comma-separated project keys allowlist)
- write operations require `metadata.idempotencyKey` for `jira.create_issue`
- transitions to `Done/Closed/Resolved` require `metadata.approved=true`

## Run

```bash
npm run jira-agent:dev
```
