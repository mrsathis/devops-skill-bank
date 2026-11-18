---
tags:
  - sre
---

# SLOs & error budgets

**Level:** Intermediate

## How to write a good SLI

Measure what users feel, as good events divided by valid events:

- **Availability:** successful requests ÷ all requests (exclude 4xx caused by the client)
- **Latency:** requests faster than 300 ms ÷ all requests
- **Freshness:** data updated in the last 10 minutes ÷ all checks

## Downtime allowed by an SLO

| SLO | Per 30 days | Per year |
|---|---|---|
| 99% | 7 h 12 min | 3.65 days |
| 99.5% | 3 h 36 min | 1.83 days |
| 99.9% | 43 min 12 s | 8 h 45 min |
| 99.95% | 21 min 36 s | 4 h 23 min |
| 99.99% | 4 min 19 s | 52 min 34 s |

## Error budget policy (example)

| Budget left | Action |
|---|---|
| > 50% | Ship features normally |
| 25–50% | Extra review on risky changes |
| < 25% | Prioritise reliability work |
| Exhausted | Freeze non-critical releases until the budget recovers |

## Burn-rate alerting

Burn rate is how fast you're spending the budget compared with an even spend across the window.
A burn rate of 1 uses the whole budget exactly by the end of the window.

A common multi-window setup for a 30-day SLO:

| Severity | Burn rate | Long window | Short window | Budget used if it continues |
|---|---|---|---|---|
| Page | 14.4 | 1 h | 5 min | 2% in 1 hour |
| Page | 6 | 6 h | 30 min | 5% in 6 hours |
| Ticket | 1 | 3 days | 6 h | 10% in 3 days |

The short window makes the alert stop quickly once the problem is fixed.

## Prometheus example

```promql
# Error ratio over the last hour
sum(rate(http_requests_total{job="api",code=~"5.."}[1h]))
/
sum(rate(http_requests_total{job="api"}[1h]))
> (14.4 * 0.001)     # 14.4x burn rate for a 99.9% SLO
```
