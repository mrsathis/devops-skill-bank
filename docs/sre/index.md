---
tags:
  - sre
---

# Site Reliability Engineering

What I've learned running a cloud reliability program: measure reliability from the user's side,
spend error budgets on purpose, and learn from every incident without blame.

## Notes

- [SLOs & error budgets](slos-and-error-budgets.md)
- [Incident response](incident-response.md)
- [Postmortem template](postmortem-template.md)

## Key terms

SLI
:   Service Level Indicator. A measurement of user experience, such as the share of requests that succeed.

SLO
:   Service Level Objective. A target for an SLI over a time window, such as 99.9% over 30 days.

SLA
:   Service Level Agreement. A contract with consequences if missed. Set it looser than the SLO.

Error budget
:   `1 − SLO`. The amount of unreliability you can afford in the window.

MTTD / MTTR
:   Mean time to detect / mean time to restore.

Toil
:   Manual, repetitive operational work that can be automated and grows with the service.
