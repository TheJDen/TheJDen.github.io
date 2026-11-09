# Open Daymark

A public, provenance-first personal metrics dashboard published at `/daymark/` in this existing GitHub Pages repository.

## Current release (2026-11-08)

- **53 original scale check-ins** (2026-08-21 through 2026-11-08), from the user's reported weigh-in log.
- **14 dated Apple Health daily aggregates** each for steps, walking/running distance, and active energy (2026-10-26 through 2026-11-08).
- **No synthetic or interpolated points**. Previously interpolated/unmeasured weight entries (including 2026-08-29, 2026-09-11, 2026-09-24, and 2026-10-06) were deliberately excluded.
- No public raw heart-rate traces, GPS route points, personal identifiers, medical diagnoses, or private API credentials.

This release is a snapshot. **It is not yet an unattended, continuously refreshed integration.**

## Data contract

The UI loads only `data.json`. New metrics should require editing the data file, not the interface code.

- `schema: "open-daymark/1"` is the version marker.
- `timezone` establishes the calendar-day interpretation.
- `metrics[]` contains `id`, `label`, `group`, `description`, `kind`, `components[]`, `source`, `classification`, and `records[]`.
- `components[]` supports scalar (`value`) and multiple simultaneous components (e.g. `systolic`, `diastolic`). Component attributes: `key`, `label`, `unit`, and `precision`.
- `records[]` stores `{ "date": "YYYY-MM-DD", "values": {"value": 123} }`. Missing dates are absent, not represented with guessed values or zeroes.
- `documents[]` is reserved for authored qualitative records, kept distinct from observations.
- `rubrics[]` is reserved for **pre-published**, reproducible grading schemes. No grading scale has been approved and none is active.
- `classification` is one of `measurement`, `device-recorded`, `device-estimate`, or `estimate`. This is a provenance classification, not a clinical reliability rating.

An incoming measurement must have a stable metric key, calendar date or original timestamp, numeric component value(s), source, and classification. When corrections are needed, preserve the correction reason in an accompanying revision/commit message. Don't overwrite one source's measurement with a different source's value without reconciliation.

## Integration plan and present status

| Source | Connection | Current use | Future sync |
| --- | --- | --- | --- |
| Apple Health | Available via connected ChatGPT Health | Real dated activity data imported into this snapshot | ChatGPT can import fresh data and commit changes on request; unattended sync to GitHub is **not configured** |
| Historical weight log | Available from verified prior weigh-ins | 53 actual measurements included | Add future weighed check-ins as dated observations |
| Polar Flow | Requires separate developer authorization | No Polar workout payload has been imported | Use Polar AccessLink **v4**, not legacy v3; request only needed OAuth scopes |
| Strava | Requires separate authorization for API access | No Strava data imported | Polar Flow's built-in Partner > Strava connection can sync qualifying **future** workout activities |
| GitHub Pages | Repository files committed to `main` | Static, public HTML and JSON | Verify Pages setting/deployment if `/daymark/` is not live |

### Polar Flow setup

1. Open [Polar AccessLink developer portal](https://admin.polaraccesslink.com/) while signed into Polar Flow.
2. Register an app named **Open Daymark** with OAuth callback URI on a service capable of securely exchanging the callback code and storing tokens. GitHub Pages alone is static and cannot securely perform that exchange.
3. Request the narrowest scopes: `training_sessions:read` for workouts, `sleep:read` for sleep, `activity:read` for daily activity; add `nightly_recharge:read` only if desired.
4. Complete OAuth consent. Keep client secret, access tokens, and refresh tokens in a private secret store **not** in this public repository or chat.
5. Import workout fields with stable Polar session IDs, timestamps, sport, duration, heart rate values when supplied; exclude location, routes, GPS and raw sensor traces by default.
6. Deduplicate sessions by provider ID. Keep Polar workout data and Apple Health daily aggregations as different series (do not double-count cross-posted workouts).

API documentation: https://www.polar.com/polar-api-v4/

### Strava account-to-account synchronization

From Polar Flow web: **Settings > Partners > Strava > Connect**. New compatible sessions will sync to Strava; historical sessions require manual export/import. This is **not** a connection from Strava to Open Daymark. Direct Strava API ingestion would additionally need a Strava developer application and OAuth authorization.

Sources:
- https://support.polar.com/en/support/how_can_i_automatically_sync_my_data_from_polar_flow_to_strava?category=syncing
- https://developers.strava.com/docs/getting-started/

### Apple Health and privacy

Apple Health data is accessible through the connected Health capability in ChatGPT, but that does not create a GitHub Pages background data feed. Updating Daymark in chat involves requesting a fresh read, validating dates and provenance, and committing only approved public metrics to `data.json`.

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
