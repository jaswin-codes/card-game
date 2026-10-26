# Overnight log — `overnight/features`

## MORNING REPORT

_In progress — filled in at the end of the night._

## Status

Done: tasks 0–6 and 8 (75 tests passing, build OK). Next: task 7 (3–4 players).

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
- [ ] 7. 3–4 players
- [x] 8. Emoji reactions and chat
- [ ] 9. Background themes
- [ ] 10. Stats and match history
- [ ] 11. Simulation test
- [ ] 12. Socket integration tests
- [ ] 13. Hardening
- [ ] 14. Mobile layout
- [ ] 15. Cleanup
- [ ] 16. README

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
- **Scores are hidden until the end.** The server used to send every player's live total, which gave away the sum of hidden cards.

## Next step if resumed

Read this file, `git log --oneline main..HEAD`, then continue with the first unchecked task.
