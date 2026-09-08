# Fantasy Football Front Office

An AI-assisted fantasy football draft assistant and in-season team manager, built for an
8-team, 0.5-PPR, 2-QB ESPN league — and configurable for any league shape.

It exists to answer one question: **"Given the current state of my league, what should I
do next?"** It is not a rankings site.

Design documents:
[PROJECT_PLAN.md](./PROJECT_PLAN.md) ·
[ARCHITECTURE.md](./ARCHITECTURE.md) ·
[ESPN_INTEGRATION.md](./ESPN_INTEGRATION.md)

---

## Quick start

```bash
npm install
cp .env.example .env      # optional — the app runs without any of it
npm run dev               # http://localhost:3000
```

With no configuration at all the app runs on a **clearly-labelled synthetic sample
league** so you can explore every screen. Real data comes from ESPN or a manual import.

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and serve |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:generate` / `db:push` / `db:migrate` | Prisma |

---

## What it does

**Draft**
- Dynamic Draft Value Score — value, positional scarcity, roster fit, the chance a player
  survives to your next pick, and how badly the teams picking in between want his
  position. It is explicitly *not* "the highest-ranked player available".
- A dedicated 2-QB scarcity engine. In an 8-team 2-QB league 16 QBs start every week, so
  replacement level is QB17-ish rather than QB9 — every downstream number inherits that.
- Opponent next-pick prediction, pick-squeeze detection, dynamic tiers, ADP vs. this
  league's value (values and reaches).
- **Draft-quarters strategy** — the draft is four phases with different jobs, and the
  recommendation engine is weighted differently in each: raw value in Q1, upside in Q2
  (the last window for league-winning production), roster fit and scarcity in Q3 as
  positions dry up, ceiling in Q4. Boundaries are scaled for this league rather than
  copied: Q1 is measured in *picks* because the elite pool is a fixed set of players, so
  an 8-team league takes more rounds to consume it, while Q2/Q3 track starting slots
  because positional supply scales with team count. Two starting QB slots stretch Q1 and
  move QB out of its usual Q3 window.
- **Expert tiers rank the board** — a ranker's published tiers for all four positions
  (36 QB, 91 RB, 94 WR, 50 TE), attributed and dated, are what the draft board is ordered
  and scored on. The app's own projection-derived numbers are deliberately not shown or
  used there. His lists are *positional* and he published no overall board, so ordering
  across positions blends his tier numbers and Big Tier Breaks with his positional rank,
  scaled by how deep this league actually goes at that position — an app decision, labelled
  as one on the page rather than passed off as his. Tier alone could not do it: a tier
  number means something different at each position (his RB tier 3 starts at RB5, his QB
  tier 3 runs QB10-QB19), so a tier-only board put his RB6 behind nineteen quarterbacks. A player outside his lists (kickers,
  defences, the deep pool) reads as `unranked` and scores zero on value; nothing of ours is
  substituted for an opinion he did not give. Each row shows his tier, positional rank and
  FADE/TARGET label, alongside his format-specific guidance filtered to this league. His positional
  deadlines are tracked live against remaining supply — "two QBs by the end of Tier 3"
  reports whether the window is open, closing or gone. Rankings that cannot be matched to
  the player pool are listed, never silently dropped.
- **Scoring translation** — a ranking built for different scoring is translated rather
  than trusted or hand-edited. The RB, WR and TE tiers are full PPR while this league is
  0.5, so the same projections are scored both ways and the ranked cohort re-ordered under
  each; the difference isolates the format effect and is shown per player (▲/▼).
  Pass-catching backs fall, rushing-heavy backs rise. The ranker's published ranks are
  never altered. Applied per position: his QB tiers already match this league's passing
  scoring and are correctly left untranslated, while the other three are not. The size of
  the correction tracks how much reception volume actually varies within a position — it
  moves receivers most and tight ends least. Note that this is the one place projections
  are still used: re-scoring a stat line under two rule sets is the whole method, so
  removing projections entirely would mean showing his full-PPR order with no 0.5-PPR
  correction at all. They are an input to adjusting *his* ranks, never a ranking of ours.
- **Mock draft** — every team but yours picks itself, driven by the same engine that
  advises you, running for that team: its roster, its needs, its turn. Deliberately not a
  different and better rule than the one you are given, which would make your own board
  look good for no reason. Each team takes from its own shortlist with a seeded bias
  towards the top choice, so a run develops the way a real board does and the same seed
  replays the same mock. Simulated picks land in the same list a manual pick does, so undo,
  the pick log and the analysis do not care which kind they are — and there is no mode that
  drafts for you: every run stops when you are on the clock. It is a sparring partner, not
  a prediction of what your leaguemates will do.
- **Draft order, and how much to trust it** — taken from round 1's actual picks when the
  draft has started, otherwise from your league's ESPN draft settings, and only then from
  the league team order. That last case is a guess and is labelled as one, because if it is
  wrong then every "on the clock", every simulated pick and every count of picks until your
  turn is wrong with it. You can set the order by hand; the editor swaps rather than
  overwrites, so it always stays a permutation with nobody dropped or duplicated.
- **His rankings drive the score, not just the value term** — the six-term draft score is
  weighted by his quarters framework, and the three terms that judge a *player* are all
  computed from his data: value from his tiers, upside from his tier plus how far the live
  board has let him slip past his own rank, and roster fit measured in his board value
  rather than in projected points. The remaining terms — positional scarcity, survival to
  your next pick, and what the teams in between need — are about supply and sequencing
  rather than about how good a player is. That puts his rankings behind 67% of the score in
  Q1 and Q2, 60% in Q3, and 83% in Q4, the quarter that weights upside most.
- **Upside without ADP** — Q4 is about ceiling at the price you pay, and no ADP source is
  wired up to supply the price. The live board supplies it instead: if 45 backs are gone
  and his RB30 is still there, sixteen better-ranked backs went first and he is going
  cheap. Ceiling comes from his tier rather than his rank, because inside a tier he is
  saying the players are close to equivalent.
- **The lists do not run out** — 36 QB + 91 RB + 94 WR + 50 TE is 271 ranked players
  against 8 x 16 = 128 picks. That is 2.1x the entire draft, and ~143 of his ranked players
  are still on the board after the final pick. There is no late-draft stretch where the app
  has to fall back to projections for want of an opinion from him, and a test asserts it.
- **What this room does, kept apart from what players are worth** — this league
  under-drafts quarterbacks for a 2-QB league, which is a fact about its managers that no
  ranking set can know and only its manager can report. It is modelled as a positional
  market bias (`positionMarketBias`, QB at 0.90) that moves two things and nothing else:
  what opponents are predicted to do, and what simulated teams actually pick. It never
  touches a ranking, a tier or a board value — a quarterback is exactly as good in a room
  that undervalues quarterbacks, he simply lasts longer, and lasting longer is something
  you profit from by waiting rather than by thinking less of him. A test asserts that
  changing the bias leaves every player's value, tier and rank identical. The setting was
  picked from a sweep of 12 seeded mocks per value, tabulated in `league-config.ts`.
- **TARGET / FADE, shown but not scored** — his labels are about price, not talent: a Fade
  is a player he will not pay the market rate for, and his rank already carries his opinion
  of the player. Scoring the label on top of the rank would penalise him twice on a signal
  we cannot evaluate, because no ADP source is wired up. So the labels are displayed on the
  board and in mock-draft rationales, and left out of the arithmetic.
- **Big Tier Breaks** — the ranker distinguishes a genuine cliff from an ordinary tier
  boundary, and only the cliffs are flagged on the board.
- **Live draft tracker** — enter each pick as it happens, with player search, position
  filter and sorting. ESPN's draft room has no usable feed (ESPN_INTEGRATION.md), so the
  board is entered manually and saved to the browser, surviving a mid-draft refresh.
  Every pick re-runs the engine, because replacement level, tiers and scarcity all move
  as the board drains.

**Season**
- Weekly "what should I do?" report: lineup changes, waiver claims, trade offers.
- FAAB bid engine — a bid is a function of what a player is worth *to your roster*, your
  remaining budget, weeks left to spend it, and which rivals have both the need and the
  money.
- Two-sided trade analyzer that measures the change in each side's *optimal starting
  lineup*, and a trade finder that only surfaces offers both managers would accept.
- Matchup analysis, playoff schedule analysis, power rankings, season simulation.

---

## How it is put together

```
src/domain/      Pure engines. No I/O, no React, no Prisma. Every metric is traceable.
src/providers/   ALL external I/O — ESPN, manual import, sample data.
src/services/    Assembles LeagueState from providers.
src/ai/          Structured-input AI layer with schema + reference validation.
src/app/         Next.js App Router pages and route handlers.
```

Dependency arrows only point downward. `src/domain/**` imports nothing from the layers
above it, which is what makes 177 unit tests possible without a database or a network.

### Traceability

Every calculated number carries its derivation and can be expanded in the UI:

```ts
interface Explained<T> {
  value: T;
  inputs: Record<string, number | string | boolean>;
  formula: string;   // "VOR = 312.4 - 248.1 (QB19)"
  sources: string[]; // ["projections:espn", "league-config"]
}
```

---

## Data honesty

These rules are enforced in code, not just documented:

1. Every player, projection and stat carries a `source` and `asOf`.
2. Sample data is tagged `synthetic-sample` and renders a persistent banner. Player names
   are deliberately obviously fake ("QB One") so no output can be mistaken for advice
   about a real player.
3. Missing data renders as **Data unavailable** with a timestamp — never as a zero.
4. The AI receives structured data only and may not introduce a player, number or injury
   that is not in its input. Responses are schema- **and** reference-validated; one naming
   an unknown player is discarded and the deterministic answer is shown instead.
5. Raw data, calculated metrics and AI narrative are stored and displayed separately.

The app ships with **no real projections**. Import them, or connect ESPN.

---

## Configuration

All server-side; nothing is exposed to the browser. See `.env.example`.

| Variable | Purpose |
| --- | --- |
| `DASHBOARD_PASSWORD` | Password gate. Required on any deploy carrying ESPN cookies |
| `DATABASE_URL` | PostgreSQL, for persistence and history |
| `ANTHROPIC_API_KEY` | Optional. Without it the deterministic engine analysis is used |
| `ESPN_LEAGUE_ID`, `ESPN_SEASON` | Your league |
| `ESPN_S2`, `ESPN_SWID` | Private leagues only — see ESPN_INTEGRATION.md |
| `ESPN_TEAM_ID` or `ESPN_TEAM_NAME` | Which team is yours. Set one, or the app analyses the wrong roster |
| `LEAGUE_PROVIDER` | `espn` \| `manual` \| `sample` |

The ESPN client is a `server-only` module, so importing it into a client component is a
build error — the cookies cannot reach the browser.

---

## Deploying

See [DEPLOYMENT.md](./DEPLOYMENT.md) — Vercel or the included `Dockerfile`.

For a shareable demo, deploy with **no environment variables**: the app runs on the
labelled synthetic sample league, so there is nothing real to expose. Import the repo at
<https://vercel.com/new> and deploy — the app is at the repository root, so Next.js is
detected automatically and there is no root directory to configure.

There are no user accounts yet, so `src/proxy.ts` enforces a password gate: with
ESPN credentials configured and no `DASHBOARD_PASSWORD`, the app refuses to serve rather
than exposing your league to anyone with the URL.

## Known limits

- **ESPN has no supported write API.** The app recommends; you execute in ESPN.
- **No live draft websocket.** Draft results are polled, and manual pick entry always works.
- **No bundled projections or ADP.** Import them; inventing them would be worse than
  having none.
- **Auth and persistence are not wired up yet.** The schema exists; see PROJECT_PLAN.md
  for exactly what is and is not built.
