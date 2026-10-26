# Overnight log — `overnight/features`

## MORNING REPORT

_In progress — filled in at the end of the night._

## Status

Current task: Step 0 (setup and audit) — done. Next: task 1.

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
- [ ] 1. Card powers
- [ ] 2. Jump-In Type 1
- [ ] 3. Jump-In Type 2
- [ ] 4. Calling and final turns
- [ ] 5. Automatic mistake penalties
- [ ] 6. Call Mistake button
- [ ] 7. 3–4 players
- [ ] 8. Emoji reactions and chat
- [ ] 9. Background themes
- [ ] 10. Stats and match history
- [ ] 11. Simulation test
- [ ] 12. Socket integration tests
- [ ] 13. Hardening
- [ ] 14. Mobile layout
- [ ] 15. Cleanup
- [ ] 16. README

## Assumptions

- `card_game_rules (1).md` is the newer, fuller version of the rules (it adds the online timers, jump-in window, reshuffle and 0-card rules). Where the two files differ I follow it; it never contradicts `card_game_rules.md`, only adds to it.

## Next step if resumed

Read this file, `git log --oneline main..HEAD`, then continue with the first unchecked task.
