---
tags:
  - sre
  - template
---

# Postmortem template

Blameless: focus on how the system and processes allowed the failure, not on who made a mistake.

```markdown
# Postmortem: <short title>

**Date:** YYYY-MM-DD · **Severity:** SEV2 · **Duration:** 47 min · **Author:** <name>
**Status:** Draft | In review | Final

## Summary
Two or three sentences: what broke, who was affected, how it was fixed.

## Impact
- Users affected:
- Error budget consumed:
- Revenue / SLA impact:

## Timeline (UTC)
| Time | Event |
|---|---|
| 14:02 | Deploy v2.31 started |
| 14:09 | 5xx alert fired |
| 14:15 | Incident declared, IC assigned |
| 14:38 | Rolled back to v2.30 |
| 14:49 | Error rate back to normal, incident resolved |

## Root cause and contributing factors
What happened technically, and why the safeguards didn't catch it.

## What went well
## What went badly
## Where we got lucky

## Action items
| Action | Type | Owner | Ticket | Due |
|---|---|---|---|---|
| Add canary stage to deploy pipeline | Prevent | | | |
| Alert on burn rate, not raw error count | Detect | | | |
| Document rollback steps in runbook | Mitigate | | | |
```
