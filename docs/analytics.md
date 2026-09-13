# Gameplay analytics

Gameplay records are stored in the `astrapool-analytics` Cloudflare D1 database, bound as
`GAME_ANALYTICS`. Reporting uses your Cloudflare account. There is no public reporting API
and no reporting credential in the browser.

## View reports

In the [Cloudflare dashboard](https://dash.cloudflare.com/f1a4a152b72d6ebcb0b82a8b384d4c1b/workers/d1),
open **astrapool-analytics → Console** to run the SQL below. The database's Data view also lets
you inspect individual rack records.

From a checkout with dependencies installed and `npx wrangler login` completed:

```sh
npm run analytics                             # last 7 days, all modes
npm run analytics -- --days 30                 # 1, 7, 30, or 90 days
npm run analytics -- --days 30 --mode computer # local, computer, free, online, or all
npm run --silent analytics -- --json > analytics.json
npm run analytics -- --local                  # local development data only
```

Reports include daily counts, modes, winners, and breakdowns by starting difficulty, room,
ball collection, arcade setting, effects setting, sound, input, and device category. Each
breakdown includes starts, finishes, early endings, shots, and average completed-rack duration.
The summary includes completion percentage and observed settings changes for local/computer/Free Play.

Time filters use a rolling interval. Daily rows use UTC and group games by **when they started**;
a game finishing tomorrow updates the completion count for today's start cohort. Completion
rate is finished / started, including still-active games in the denominator. An empty dataset
has zero counts and a null average duration in JSON.

Daily starts and their completion rates:

```sql
SELECT date(started_at / 1000, 'unixepoch') AS day,
       COUNT(*) AS started,
       SUM(finished_at IS NOT NULL) AS finished,
       ROUND(100.0 * SUM(finished_at IS NOT NULL) / COUNT(*), 1) AS completion_pct,
       SUM(ended_at IS NOT NULL) AS ended_early
FROM games
WHERE started_at >= (unixepoch() - 30 * 86400) * 1000
GROUP BY day ORDER BY day;
```

Computer difficulty and results:

```sql
SELECT json_extract(initial_settings, '$.difficulty') AS difficulty,
       COUNT(*) AS started,
       SUM(finished_at IS NOT NULL) AS finished,
       SUM(outcome = 'player') AS player_wins,
       SUM(outcome = 'computer') AS computer_wins,
       ROUND(AVG(CASE WHEN finished_at IS NOT NULL THEN duration_ms END) / 1000) AS avg_seconds
FROM games
WHERE mode = 'computer'
  AND started_at >= (unixepoch() - 30 * 86400) * 1000
GROUP BY difficulty ORDER BY started DESC;
```

Room and ball collection popularity:

```sql
SELECT json_extract(initial_settings, '$.room') AS room,
       json_extract(initial_settings, '$.balls') AS balls,
       COUNT(*) AS started, SUM(finished_at IS NOT NULL) AS finished
FROM games
WHERE started_at >= (unixepoch() - 30 * 86400) * 1000
GROUP BY room, balls ORDER BY started DESC;
```

## What counts

- **Started:** the first accepted cue shot or Free Play fling in a fresh rack. Choosing a mode,
  watching the demo, placing a ball, or opening an unplayed online room does not count.
- **Finished:** the rules declare a winner in local/computer/online 8-ball, including losses
  from an illegal 8. Free Play finishes when all 15 object balls have been removed and the last
  play settles. Re-racking starts another record only after its first shot.
- **Ended early:** the player switches modes, restarts, or leaves the page before finishing.
  Online rooms end when they expire after 24 hours of inactivity, using their last activity
  timestamp. A temporary online disconnect keeps the same rack.
- **Unfinished or still playing:** a start with neither a finish nor an observed early ending.
  Browsers cannot reliably report every tab closure, particularly on mobile, so this category
  also includes games abandoned without a final update. It is not a live-player count.
- **Shots:** accepted launches, including computer turns and online shots that were later
  interrupted. Replay playback and attract shots are excluded.
- **Duration:** elapsed wall time from first shot to the latest update or terminal event,
  including idle/background time. Reports average only finished games.
- **Score:** the rack's combined arcade points at completion, or the single Free Play total.
  Arcade scoring continues internally when its visual display is off.

`initial_settings` preserves the first-shot settings; `settings` holds the latest observed
values. `settings_changes` counts changes between observed snapshots, not individual clicks.
For online games these are the first shooter's settings and the most recent shooter's settings.
Online `settings_changes` stays zero: alternating players with different preferences must not
inflate that count. This is not a per-player preference report. Older clients report `unknown`
settings. The device category uses coarse-pointer input
as the mobile approximation. Sound records the user's mute choice, not temporary background
or replay muting. Difficulty is `none` outside computer mode.

Collection starts after deployment; there is no historical backfill. An online rack already
in progress at deployment begins tracking at its next accepted shot.

## Delivery and data

Local/computer/Free Play clients send a same-origin POST on the first shot and terminal events,
plus cumulative updates at most every 30 seconds during play. Hiding or leaving the page flushes
an update using `sendBeacon`. Unacknowledged updates for the most recent 20 racks remain in
memory and retry every 30 seconds, including after a switch or restart. They are lost if the
page is destroyed. A successful beacon only acknowledges browser queuing, so its record stays
pending for a normal `fetch` to confirm delivery when the page survives. Restoring a page from
the browser's back/forward cache preserves its rack. Normal refresh starts a fresh attract screen.

Online records are created by the Durable Object after a validated shot. Changed snapshots are
saved to a durable outbox before broadcasting, then delivery is explicitly awaited after the
broadcast so database latency does not delay animation. Acknowledged versions are removed;
failed records survive reconnects, hibernation and rematches. Failures back off from one minute
to one hour; room activity and newer snapshots preserve that schedule. Records are discarded
48 hours after their first-shot timestamp if they still cannot be delivered, with a warning in
Worker logs. New snapshots cannot restart this deadline. The retry alarm preserves the separate
90-second shot timeout. An expired room is retained until queued records are delivered or expire,
then deleted. Placements, ordinary results, rematch votes and
reconnects do not issue D1 writes unless a previous delivery still needs retrying.

Delivery remains best effort for browser games: blocked requests, offline play or a killed tab
can leave incomplete records. Database outages delay online records until retry succeeds;
records that reach their 48-hour delivery deadline can remain incomplete or absent in D1.

A random UUID identifies a rack only. There are no visitor identifiers, analytics cookies,
player names, room links, reconnect tokens, ball positions, or stored IP addresses. Settings
are reduced to fixed categories. The browser endpoint checks origin, caps bodies at 4 KB, and
uses Cloudflare's rate limiter (60 requests/minute per connecting IP; the IP is not saved in D1).
Client metrics are approximate usage statistics, not trusted competition results.

D1 upserts accept increasing versions for the same source and mode. Retries and out-of-order
updates cannot add games or reopen a finished/ended rack. Records are retained until explicitly
deleted by an account administrator.

## Setup and deployment

The production database ID and binding are in `wrangler.jsonc`. Before first use, and for new
schema migrations, run:

```sh
npm run analytics:migrate
```

Both `npm run deploy` and the main-branch GitHub Actions deployment attempt pending migrations
before publishing. Migration failures emit a warning and allow gameplay deployment to continue.
Analytics may remain unavailable until the permission or database issue is fixed and
`npm run analytics:migrate` succeeds; the standalone migration command still exits nonzero on failure.
The existing `CLOUDFLARE_API_TOKEN` Actions secret needs **Account → D1 → Edit**
in addition to its Workers deployment permissions. Reporting-only API tokens can use D1 Read.
Local Wrangler OAuth login also supports migrations and reports. Do not put these credentials
in client code or the repository.

`npm run dev:online` builds the production client, applies the local schema, and starts the
local Worker. Its records stay in local D1. Plain `npm run dev` disables browser analytics.
The separate private Worker has no analytics binding and does not collect records into the
public database.

`npm test` covers lifecycle, validation, deduplication and SQL reporting. `npm run test:online`
uses an isolated local database and a real Worker to check HTTP ingestion and one-record online
racks across two peers and reconnects.
