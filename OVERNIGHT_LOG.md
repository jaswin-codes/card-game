# Overnight log — `overnight/features`

## MORNING REPORT

**All 16 tasks are done; nothing is blocked.** Branch `overnight/features` is pushed and draft PR #1 is open, not merged. Nothing touched `main`, `render.yaml` or the Node version.

### Tests and build (at the tip of the branch)

- `npm test`: **86 passed** in 7 files (31 tests at the start of the night). `npm test` now compiles the server first.
  - Rules: powers 17, jump-ins 12, calling 7, mistakes 8, older engine suite 32.
  - **Simulation**: 1,500 seeded random games (2–4 players), checking after every move that no card is lost or duplicated, slots stay valid, eliminated players and the caller never get the turn, every game ends, and no player is ever sent a card they shouldn't see.
  - **Socket tests** (9): the real server is started and driven by real WebSocket clients: a full 3-player game, reconnecting, a disconnect during a jump-in window, malformed and oversized input, chat limits, Call Mistake and room cleanup.
- `npm run build:all`: passes.
- Played in the browser: chat, Call Mistake, penalty notices, the King flow, Skip Power, themes, stats, a full 4-player round with a call, a rematch, and phone layouts at 375px.

### Features

| # | Task | State |
|---|------|-------|
| 1 | Card powers | Done. The King now looks first, then you choose to swap; any power can be skipped. |
| 2–3 | Jump-ins, both types | Done. Losing a jump-in race is no longer penalised. |
| 4 | Calling and final turns | Done. Fixed turn order when someone is eliminated in the final round. |
| 5 | Automatic penalties | Done. Fixed penalty cards getting an undefined or duplicate slot; everyone now sees who was penalised and why. |
| 6 | Call Mistake | Done. The server checks the accused player's last move and posts the verdict in chat (see Assumptions). |
| 7 | 3–4 players | Done. It already worked; checked in the browser with 4 players. |
| 8 | Chat and emoji | Done. Server-relayed, 200 characters max, 5 messages per 10 s, shown as plain text. |
| 9 | Themes | Done. Four themes, remembered in the browser. |
| 10 | Stats and history | Done. Saved in the browser (no database). |
| 11 | Simulation | Done. It found a real bug on its first run (a card vanished when a game ended mid-turn), now fixed. |
| 12 | Socket tests | Done. |
| 13 | Hardening | Done. Bad input is rejected, message size is capped, stale sockets are ignored, empty rooms are cleaned up. |
| 14 | Phone layout | Done. No sideways scrolling at 375px for 2–4 players. |
| 15 | Cleanup | Done. OneNote files untracked (your local copies are kept) and the unused template removed. |
| 16 | README | Done. |

### Security fixes you should know about

Before tonight, a player could read hidden information out of the data the server sent them:

- **Every hidden card's value**: card ids were numbered in suit and rank order, so a hidden card's id gave away its value.
- **Every player's live score**: the total of each player's hidden cards was sent to everyone.

Both are fixed, and the simulation and socket tests now check for leaks. An eliminated player also no longer keeps seeing cards.

### Other bugs found and fixed

- A disconnected player was given a penalty card every time their turn ran out, so they were eliminated after about 2–3 minutes instead of getting the 5-minute reconnect window.
- When a 9th card eliminated a player, that card was lost from the game.
- A card being held mid-turn vanished if the game ended at that moment.
- Closing an old socket after reconnecting on a new one marked the player as disconnected.
- A host alone in their lobby lost the room on a page refresh (caused by tonight's room cleanup and fixed before morning).

### Decisions for you

1. **The two rules files disagree** (details under Assumptions). The code follows `card_game_rules (1).md`: calling is optional with 0 cards, and the first click wins a Type 2 jump-in. Tell me if `card_game_rules.md` should win instead.
2. **Seen cards stay face-up on your screen.** The physical game makes you memorise them. Should they flip back after a few seconds?
3. **Running out of time costs a penalty card.** This was already in the code; the rules list the timer but not as a mistake. Keep it?

### Manual playtest before merging

Use separate addresses for each player on one computer: http://localhost:8080, http://127.0.0.1:8080, http://127.0.0.2:8080 and http://[::1]:8080.

**2 players**
- [ ] Create a lobby, join, start. Names show, and only the host can start.
- [ ] Take the discard into a slot, and draw then keep a card.
- [ ] Draw a 7/8 and look at your own card; draw a 9/10 and look at theirs. Check the other player can't see either card.
- [ ] Draw a J/Q and blind swap. Draw a K, click Look, then try both Swap and Keep. Use Skip Power once.
- [ ] Jump In: My Card with a matching card, then with a wrong one: a penalty card is added and both screens show a notice.
- [ ] Refresh mid-game: you're back in your seat. Close a tab for a minute: no penalty cards pile up while you're gone.
- [ ] Call, let the other player take their final turn, check the results and that Play Again starts with the winner.
- [ ] Chat, a reaction, Call Mistake, change theme and refresh, and check stats appear after Exit.

**4 players**
- [ ] Turn order goes round all four, and powers can target any opponent.
- [ ] Two players jump in on the same card: the first gets it, and the second isn't penalised.
- [ ] Call: the three others each get exactly one final turn; locked cards can't be targeted.
- [ ] Open it on a phone (or the browser's 375px view): no sideways scrolling, and the piles sit above your cards.

### Known issues and next steps

- The client has no automated tests; UI checks were done by hand in the browser. A few Playwright tests for the main flows would be the next step.
- With 4 players on a phone, your own cards are one short scroll below the piles.
- Chat isn't kept: people who join or reconnect later don't see earlier messages.
- Games are in server memory, so a Render redeploy ends games in progress. Merging this PR deploys it, so merge when nobody is mid-game.
- The client's timer bar always assumes 30 seconds (fine unless the timers are changed).

## Status

All tasks done (86 tests passing, build OK). Draft PR #1 is ready for review.

## Baseline (Step 0)

- `npm ci && npm --prefix client ci`: OK
- `npm test`: 31/31 passing
- `npm run build:all`: OK

## Audit of todo.md "Advanced Features"

todo.md describes the old Manus template (Socket.io, OAuth, drizzle); the real game is
`src/engine.ts` + `src/server.ts` + `client/src/App.tsx`. Against that code:

| Item | State | Notes |
|------|-------|-------|
| Card powers 7–K | Mostly done | Engine, server and UI exist. Gaps: hidden cards leak their value through the card `id` (ids are assigned in suit/rank order), eliminated players still see cards, no way to skip a power. |
| Jump-In Type 1 | Mostly done | Gaps: a player who loses a jump-in race is penalised as a "wrong number" if the top card changed. |
| Jump-In Type 2 | Mostly done | Same race gap. |
| Calling + final turns | Mostly done | Gap: if the active player is eliminated in the final round, the turn can pass to the caller or a finished player. |
| Automatic mistake penalties | Mostly done | Gap: penalty cards get a duplicate or undefined slot when a player has fewer than 4 cards or a gap in their penalty slots. Mistakes aren't shown to other players. |
| Manual "Call Mistake" | Missing | |
| 3–4 players | Partly done | Engine and lobby support 4; needs a check of layout and flow with 3–4. |
| Chat / emoji | Missing | |
| Player stats / history | Missing | |
| Background themes | Missing | |

## Task checklist

- [x] 0. Setup, baseline, audit
- [x] 1. Card powers
- [x] 2. Jump-In Type 1
- [x] 3. Jump-In Type 2
- [x] 4. Calling and final turns
- [x] 5. Automatic mistake penalties
- [x] 6. Call Mistake button
- [x] 7. 3–4 players
- [x] 8. Emoji reactions and chat
- [x] 9. Background themes
- [x] 10. Stats and match history
- [x] 11. Simulation test
- [x] 12. Socket integration tests
- [x] 13. Hardening
- [x] 14. Mobile layout
- [x] 15. Cleanup
- [x] 16. README

## Assumptions

- **Two rules files disagree — needs your decision.** `card_game_rules.md` (named as the source of truth) and `card_game_rules (1).md` (newer, adds online rules) contradict each other in two places. The engine already followed `(1)` before tonight and I kept that, because `(1)` is the only file that covers online play:
  - 0-card player: `card_game_rules.md` says they "will call on their next turn"; `(1)` says calling is optional. Code: optional.
  - Type 2 jump-in race: `card_game_rules.md` allows the opponent to try to block; `(1)` says first click wins, no blocking online. Code: first click wins.
- Everything `(1)` adds that `card_game_rules.md` doesn't mention (30 s timers, 5 min reconnect, reshuffle, Kings/Jokers matching, jump-in window) is followed as written.

- **Powers are optional.** The rules say you "may" activate a power, so there's a Skip Power button; skipping ends the turn.
- **King = look, then decide.** The rules say look at both cards "then decide", so the King is two steps. After looking you must swap or keep those same two cards.
- **Seen cards stay visible to you.** Once you've legitimately seen a card (bottom two at the start, 7/8, 9/10, King, or a card taken from the discard), its value stays on your screen. The physical game expects you to memorise; showing it is kinder online, and Type 2 jump-ins need the knowledge anyway. Easy to change if you want memory to matter: hide values on the client after a few seconds.
- **Jump-in races.** The client sends the id of the discard it reacted to. If someone else got there first and your card still matches the new top card, your jump goes through (the rules allow chaining). If it no longer matches, it's rejected as "too late" with **no penalty** — you matched the card you saw.
- **Penalty card slot.** A penalty card fills the first empty slot, refilling a gap left by a jump-in before opening a new penalty slot.
- **Turn timer.** Running out of time is penalised with a card (this was in the engine before tonight; the rules list it under online timers but not under Mistakes). Kept as is.
- **"Call Mistake".** The server already penalises every rule break it can detect, and the online game makes illegal peeking, moving cards and revealing cards impossible. So the button asks the server to check the accused player's last move and posts the verdict in chat. Nobody is penalised by a call, including for a false accusation (the rules don't cover that).
- **Chat** isn't kept: people who join or reconnect later don't see earlier messages.
- **Stats are per browser.** Render's free disk is wiped on restarts and there's no database, so stats and match history live in each browser's localStorage and don't follow you between devices.
- **Empty rooms** are deleted after 30 seconds (lobby or finished game) or about 6 minutes (game in progress), so a refresh never loses the room.
- **Cleanup**: the `Open Notebook.onetoc2` files are untracked with `git rm --cached`, so your local OneNote files stay; the now-empty template folders on your disk only contain those files.
- **Disconnected players** whose turn times out are skipped without a penalty card, so the 5-minute reconnect window means what it says.
- **Scores are hidden until the end.** The server used to send every player's live total, which gave away the sum of hidden cards.

## Next step if resumed

Everything is done. If resumed: read the morning report, check PR #1 for review comments, and work on the decisions and next steps listed there.
