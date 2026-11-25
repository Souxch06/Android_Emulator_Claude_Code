---
name: android-test-report
description: Produce a precise Android test report (Markdown) from android_test JSON results, screenshots and logs collected on the remote cloud device. Use at the end of a QA/debug session or when asked for a report.
---

# Android test report

Sources: the `report_file` JSON of each `android_test` run and the PNGs in `android-cloud-artifacts/`. Use only these — never invent results.

Write `android-cloud-artifacts/REPORT.md`:

```markdown
# Test report — <app> <version> — <date>
Device: remote cloud emulator, Android <ver> (API <n>), <w>x<h>. Cloud run: <run_url>

## Summary
| Tests | Passed | Failed | Not executed | Crashes | ANRs |

## Results
| # | Test | Result | Duration | Evidence |
| 1 | login-empty | ✅ PASS | 12s | [screenshot](login-empty-step5-....png) |

## Defects
### D1 — <title> (severity: blocker/major/minor)
- Steps to reproduce (from the failing test steps)
- Expected / Actual
- Evidence: screenshot link, stack trace excerpt (```), report JSON
- Suspected cause / fix

## Not executed / limitations
(e.g. camera, Play Services, biometrics unavailable on the emulator)
```

Rules: every PASS needs its JSON with `passed: true`; every defect needs evidence; mark tests as "simulated" only if they were not executed on the device (normally none).
