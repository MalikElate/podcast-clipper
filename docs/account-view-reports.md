# Account views over the last 180 days

`GET /api/bridge/projects/:projectId/analytics/account-views?days=180` uses the same owner session or workspace API key authentication as the other project endpoints. Add `refresh=true` to bypass reports older than one minute; ordinary requests reuse results for five minutes.

The response contains `window` (`days`, inclusive `startDate` and `endDate`, and `timeZone`) and `accounts`, each with an `id` and `periodViews`. The window is the last 180 complete calendar days in America/Los_Angeles, matching YouTube reporting days. `periodViews` repeats the window and includes `value`, `status`, `source`, `reason`, and `throughDate`.

YouTube queries daily `views` for the explicitly selected channel, without a video or publication-date filter. This includes views earned during the period on older videos and videos published outside Meadow. `throughDate` records the latest row returned; YouTube may report recent days with a delay. See [Google's reports reference](https://developers.google.com/youtube/analytics/reference/reports/query).

Other network connections currently return `unavailable`, with a null value. Provider errors and reconnection requirements also remain null. Lifetime post counts, impression counts, and lifetime views on recently published posts are never substituted for account activity during this period. A successful report with no view rows returns a measured zero.

Reports expose no provider credentials or raw errors. Fetches use the existing credential renewal flow, run at most two accounts concurrently, and discard results when an authorization changes, an account is removed, or privacy deletion starts. Aggregate caches expire after five minutes and are never written to the database.
