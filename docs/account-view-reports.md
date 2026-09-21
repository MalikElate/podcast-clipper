# Account views over the last 180 days

`GET /api/bridge/projects/:projectId/analytics/account-views?days=180` uses the same owner session or workspace API key authentication as the other project endpoints. Add `refresh=true` to bypass reports older than one minute; ordinary requests reuse results for five minutes.

The response contains `window` (`days`, inclusive `startDate` and `endDate`, and `timeZone`) and `accounts`, each with an `id` and `periodViews`. The window is the last 180 complete calendar days in America/Los_Angeles, matching YouTube reporting days. `periodViews` repeats the window and includes `value`, `status`, `source`, `reason`, and `throughDate`.

YouTube queries daily `views` for the explicitly selected channel, without a video or publication-date filter. This includes views earned during the period on older videos and videos published outside Meadow. `throughDate` records the latest row returned; YouTube may report recent days with a delay. See [Google's reports reference](https://developers.google.com/youtube/analytics/reference/reports/query).

Strict `periodViews` never substitutes lifetime post counts, impressions, or views on recent uploads for account activity during the 180-day period. A successful report with no view rows returns a measured zero.

TikTok, X, and Pinterest now return a separate `availableViews` report with its actual metric, date range, source, observation time, completeness flag, and `basis` (`period` or `recent_posts`). TikTok paginates public videos published during the last 180 complete UTC days and sums their current cumulative video views. X requests time-bounded post analytics including older posts; where that access is unavailable it returns current impressions on posts published in the requested window, explicitly marked `recent_posts`. Pinterest requests account impressions for the last 90 complete UTC days, its organic retention limit; incomplete daily coverage is marked partial. These reports are not presented as exact 180-day account views.

Add `accountIds=id1,id2` to request only selected accounts belonging to the authenticated project. Unknown or foreign account IDs are rejected before any provider request. Sandbox, API-credit, permission, rate-limit, and reconnection issues use fixed safe diagnostics. Unsupported networks continue to return null.

Reports expose no provider credentials or raw errors. Fetches use the existing credential renewal flow, run at most two accounts concurrently, and discard results when an authorization changes, an account is removed, or privacy deletion starts. Aggregate caches expire after five minutes and are never written to the database.
