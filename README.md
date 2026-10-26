# Called It

A mobile-first, long-running prediction game built with Next.js, Tailwind CSS, Supabase Postgres + Realtime, and the OpenAI API.

## Features
- Create/join rooms with a code or invite link; nickname + emoji, no signup.
- Post predictions with a subject and deadline.
- YES/NO point bets, a parimutuel pool display, vote-based outcomes.
- Live player, prediction, bet, vote and activity updates.
- Spark prediction ideas, friendly moderation, AI recaps and leaderboard roast.
- Mobile-first responsive UI, loading/empty states, validation and playful visual design.

## Important before public launch
This is a runnable starter/MVP, not an audited real-money or adversarial multiplayer system. Points have no cash value. The SQL policies are deliberately permissive for local prototyping and **must be replaced before public launch**. The UI's point updates and resolution are multiple requests, not one atomic transaction; a determined client could cheat or race. Production hardening is outlined below.

## 1. Requirements
- Node.js 20+
- Supabase project
- OpenAI API key (optional; fallback copy is provided if absent)
- Vercel account for deployment

## 2. Local setup
```bash
npm install
cp .env.example .env.local
```
Fill `.env.local` with values from Supabase Project Settings → API:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only; never prefix with `NEXT_PUBLIC_`)
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (optional; defaults to `gpt-4.1-mini`)
- `NEXT_PUBLIC_APP_URL`

In Supabase → SQL Editor, run `supabase/schema.sql`. If the Realtime publication reports a table is already included, remove the duplicate `alter publication` line and rerun the rest as needed.

```bash
npm run dev
```
Open http://localhost:3000.

## 3. Play
1. Create a room and pick a nickname/avatar.
2. Copy the invite link and share it. A joiner can also enter the short code.
3. Post a prediction, choose the subject and set a future deadline.
4. Players place one YES/NO bet per prediction while it is open. Each starts at 1,000 points.
5. Once the deadline passes, the room votes. The subject cannot vote. Use “Resolve vote” once enough votes are cast. A tie voids the prediction and refunds stakes; if no one backed the winning outcome, stakes are refunded.

## 4. Deploy to Vercel
1. Push the project to GitHub.
2. In Vercel, choose **Add New → Project**, import the repo, framework preset Next.js.
3. Add all environment variables from `.env.local` in Project Settings → Environment Variables. Do not expose the service-role key to the browser.
4. Deploy. Set `NEXT_PUBLIC_APP_URL` to the Vercel production URL and redeploy.
5. Test create room, join link in a private window, place bets from two browsers, wait for deadline, vote, resolve and confirm points/updates.

## 5. Production hardening checklist (required)
This starter intentionally keeps the code approachable. Do not treat browser-side validation as security:
- **Replace permissive RLS policies** with room-membership checks and no direct client updates to `players.points`, `predictions.status/outcome`, or pool totals.
- Create Postgres RPC functions (`create_room`, `join_room`, `place_bet`, `cast_vote`, `resolve_prediction`) using transactions and `SECURITY DEFINER`; verify caller/player identity with a secure, signed guest session token. The current no-signup identity is a convenience ID, not authentication.
- Use atomic balance deductions, unique constraints, row locks and server-side deadlines to prevent double-spending/races.
- Add a scheduled Supabase Edge Function/cron job to move expired predictions to voting and resolve abandoned/tied/no-vote cases. Define the no-vote rule with product stakeholders; current starter requires enough votes and leaves the prediction open until someone resolves it.
- Add rate limits and input validation to API routes, server-side moderation on every prediction write, logging, and abuse reporting.
- Restrict who can resolve (e.g. quorum vote or non-subject majority); the starter lets room participants press Resolve once quorum is met.
- For privacy, add room deletion/retention and nickname impersonation controls.
- Configure Supabase Realtime publication only for intended tables and test RLS with multiple accounts.
- Consider OpenAI API budget limits and request size caps.

## Design decisions / edge cases
- One bet per player per prediction; betting closes at the deadline.
- A player cannot vote on a prediction about themself.
- Tie outcome: void and refund all stakes.
- No winning bets: refund all stakes, avoiding accidental destruction of points.
- Insufficient vote quorum: no resolution.
- Player leave: no leave UI in this starter; players remain in leaderboard to preserve audit/history. Production should support soft-leave (`left_at`) without deleting referenced records.
- Deadline processing is triggered when a room client refreshes; add scheduled processing for production.
- A prediction subject can currently bet unless they are its author; change this policy if the group prefers.
- Pool percentages are indicative parimutuel shares, not fixed odds.

## File structure
```text
called-it/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── commentary/route.ts
│   │   │   ├── moderate/route.ts
│   │   │   └── spark/route.ts
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/duel-app.tsx
│   └── lib/
│       ├── supabase-browser.ts
│       ├── supabase-server.ts
│       └── types.ts
├── supabase/schema.sql
├── .env.example
├── package.json
└── README.md
```

## Architecture
- Browser uses the Supabase anon key for reads, inserts and Realtime subscriptions.
- OpenAI calls stay on Next.js API routes; the secret key never reaches the browser.
- Supabase Postgres is the source of truth; Realtime refreshes room state after row changes.
- Vercel hosts the Next.js app and API routes.
