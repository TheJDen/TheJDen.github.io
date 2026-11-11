# Open Daymark

A public, provenance-first personal metrics dashboard published at `/daymark/` in this existing GitHub Pages repository.

## Current release (2026-11-10)

- **55 original scale check-ins** (2026-08-21 through 2026-11-10), from the user's reported weigh-in log.
- **16 dated Apple Health daily aggregates** each for steps, walking/running distance, and active energy (2026-10-26 through 2026-11-10). November 10 is explicitly marked as a **partial-day snapshot**; earlier days are complete as returned by Apple Health. Reimporting may update past device aggregates.
- **No synthetic or interpolated points**. Previously interpolated/unmeasured weight entries (including 2026-08-29, 2026-09-11, 2026-09-24, and 2026-10-06) were deliberately excluded.
- **37 Polar workout sessions** imported as of November 10; nightly workflow is installed. It can add session HR zones and cardio load if returned by the API.
- No public raw heart-rate traces, GPS route points, personal identifiers, medical diagnoses, or private API credentials.

**Freshness:** GitHub Pages serves a static JSON snapshot. A ChatGPT task has been scheduled for daily Apple Health-to-GitHub updates at approximately 8 AM Pacific; automatic execution has not yet been verified. The Polar workflow is scheduled nightly. The UI shows per-source import dates so stale observations aren't mistaken for live data.

## Viewer experience (2026-11-10)

- The homepage introduces the public measurement journal, explains gaps/provenance, and groups the explorer into body composition, activity, training and recovery.
- `app.js` is the standalone renderer and `ui.css` is the responsive style sheet. `index.html` stays small; new metrics can be added to `data.json` without rewriting the page.
- Weight uses scatter observations and an on-screen 7-day observed rolling average. Daily activity uses separate calendar-day bars. Same-date Polar workouts are **not** plotted on top of each other: duration/energy use transparent daily sums; workout HR defaults to duration-weighted daily mean and highest session peak, with an individual-session toggle.
- Entries from the original dataset remain available in the table and JSON. Computed display aggregates are not persisted as fake source observations.
- Graphs have readable axis ticks, explicit labels/units, keyboard-focusable recorded marks, responsive presentation, and partial-day/freshness disclosures.
- Metrics without any observations, and all-zero series, are kept out of the primary navigation and remain in the source data (with a disclosure in the sidebar).

## Polar data diagnostics

The scheduled importer now logs aggregate counts of detailed sessions, exercises, HR zone groups, sessions with cardio load, and available sleep/activity days; it does **not** log sample-level biometrics, names, GPS or raw API payloads. The next successful run can distinguish a missing data source from a parsing bug. Until then, absence of published sleep or HR zones is not proof the device lacks those values. See [Polar API v4](https://www.polar.com/polar-api-v4/) for exact response shapes.

## Data contract

The UI loads only `data.json`. New metrics should require editing the data file, not the interface code.

- `schema: "open-daymark/1"` is the version marker.
- `timezone` establishes the calendar-day interpretation.
- `metrics[]` contains `id`, `label`, `group`, `description`, `kind`, `components[]`, `source`, `classification`, and `records[]`.
- `components[]` supports scalar (`value`) and multiple simultaneous components (e.g. `systolic`, `diastolic`). Component attributes: `key`, `label`, `unit`, and `precision`.
- `records[]` stores `{ "date": "YYYY-MM-DD", "values": {"value": 123} }`. A `status: "partial"` flag marks an incomplete calendar-day snapshot. Missing dates are absent, not represented with guessed values or zeroes. `lastSyncedOn` on a metric reports when that source was last imported.
- `documents[]` is reserved for authored qualitative records, kept distinct from observations.
- `rubrics[]` is reserved for **pre-published**, reproducible grading schemes. No grading scale has been approved and none is active.
- `classification` is one of `measurement`, `device-recorded`, `device-estimate`, or `estimate`. This is a provenance classification, not a clinical reliability rating.

An incoming measurement must have a stable metric key, calendar date or original timestamp, numeric component value(s), source, and classification. When corrections are needed, preserve the correction reason in an accompanying revision/commit message. Don't overwrite one source's measurement with a different source's value without reconciliation.

## Integration plan and present status

| Source | Connection | Current use | Future sync |
| --- | --- | --- | --- |
| Apple Health | Connected via ChatGPT Health | 16 daily aggregates through Nov 10 (partial current day) | A daily ChatGPT-to-GitHub sync was scheduled for ~8 AM PT; its first unattended run has not been verified |
| Historical weight log | Available from verified prior weigh-ins | 55 actual measurements included | Add future weighed check-ins as dated observations |
| Polar Flow | Existing AccessLink v4 connection | 37 sessions in public data; nightly sync active in repository | A **new OAuth consent** is required to activate the expanded scope request in `polar-callback.html` |
| Strava | Requires separate authorization for API access | No Strava data imported | Polar Flow's built-in Partner > Strava connection can sync qualifying **future** workout activities |
| GitHub Pages | Repository files committed to `main` | Static, public HTML and JSON | Verify Pages setting/deployment if `/daymark/` is not live |

### Polar Flow setup

1. Use the **existing** Open Daymark client at [Polar AccessLink developer portal](https://admin.polaraccesslink.com/) and confirm its callback URL is `https://thejden.github.io/daymark/polar-callback.html`.
2. Open [Daymark's Polar authorization page](https://thejden.github.io/daymark/polar-callback.html), enter the **client ID only** and complete Polar consent. The page now requests `activity:read`, `training_sessions:read`, `sleep:read`, `nightly_recharge:read`, `continuous_samples:read`, `ppi_data:read`, `tests:read`, `devices:read`, `sports:read`, and `training_targets:read`. It deliberately does not request `routes:read` or `profile:read`.
3. Copy the short-lived one-time authorization code to the GitHub Actions repository secret named `POLAR_AUTH_CODE` (not to chat or public files). In [Polar nightly sync](https://github.com/TheJDen/TheJDen.github.io/actions/workflows/daymark-polar.yml), choose **Run workflow**, enable **reauthorize**, and execute. The workflow exchanges the code, verifies granted scopes, and rotates the encrypted refresh-token secret.
4. On confirmed workflow success, delete the one-time `POLAR_AUTH_CODE` secret; leave `POLAR_REFRESH_TOKEN`, `POLAR_CLIENT_ID`, `POLAR_CLIENT_SECRET`, and `DAYMARK_GH_TOKEN` in GitHub Actions secrets. Ordinary scheduled runs will continue using the refresh token.
5. Expanded scopes enable future importers, but raw continuous HR/beat intervals, fitness tests, and devices are **not automatically published**. New health-related public metrics require an explicit review.
6. Import workout fields with stable Polar session IDs, timestamps, duration, HR summaries, and optional per-workout cardio load and Polar HR-zone durations; exclude location, routes, GPS and raw sensor traces by default.
7. Deduplicate sessions by provider ID. Keep Polar workout data and Apple Health daily aggregations as different series (do not double-count cross-posted workouts).

API documentation: https://www.polar.com/polar-api-v4/

### Strava account-to-account synchronization

From Polar Flow web: **Settings > Partners > Strava > Connect**. New compatible sessions will sync to Strava; historical sessions require manual export/import. This is **not** a connection from Strava to Open Daymark. Direct Strava API ingestion would additionally need a Strava developer application and OAuth authorization.

Sources:
- https://support.polar.com/en/support/how_can_i_automatically_sync_my_data_from_polar_flow_to_strava?category=syncing
- https://developers.strava.com/docs/getting-started/

### Apple Health and privacy

Apple Health data is accessible through the connected Health capability in ChatGPT, not via a public Apple Health REST API. The scheduled ChatGPT sync is a separate task from GitHub Actions and remains subject to connector availability. Each run should read actual dated values, validate provenance, and commit only the three approved public activity metrics to `data.json`. The site is static and cannot refresh independently.

Even though the website is intended to be public, avoid raw GPS, location traces, unreviewed medical records and secrets in the public repository. Sensor-based calorie expenditure and distance are *estimates* even when they originate from Apple Health.

## GitHub Pages

The public GitHub Pages repository already existed. Daymark was deliberately created under `daymark/` to avoid changing the current homepage. If unavailable, inspect the repository's **Settings > Pages**. Branch deployment should target `main` and `/(root)`, or a compatible existing Actions deployment should include the `daymark/` folder. This repository contains an existing root `.nojekyll` file.

Site entry point: `daymark/index.html`. Public dataset: `daymark/data.json`.

## Publishing policy

1. Never manufacture an observation to fill an unmeasured date.
2. Never silently mix raw measurements, devices' estimated quantities, and user estimates.
3. Keep original numeric precision, units, source, and dates.
4. Do not call an unvalidated scale a medical or longevity grade.
5. Qualitative writing is not numeric evidence.
6. Keep a human-review checkpoint when adding newly sensitive fields to a public site.
