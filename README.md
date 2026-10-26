# Antigravity Card Game

An online multiplayer version of a memory card game for 2–4 players. Everyone has four face-down cards, and the goal is to finish with the **lowest total points**. You use card powers to peek and swap, jump in out of turn to get rid of matching cards, and call the round when you think you're lowest.

The full rules are in [card_game_rules (1).md](<card_game_rules (1).md>).

## How to play

1. One player clicks **Create Lobby** and shares the 6-character room code.
2. Everyone else enters the code and clicks **Join** (2–4 players). Anyone else can **Spectate**.
3. The host clicks **Start Match**. You can see your own two bottom cards; the other two stay hidden.
4. On your turn (30 seconds) do one of:
   - **Draw** from the pile, then click one of your cards to swap it in, or **Discard** it. Discarding a 7–K activates its power:

     | Card | Power |
     |------|-------|
     | 7, 8 | Look at one of your own cards |
     | 9, 10 | Look at one opponent card |
     | J, Q | Blind swap one of your cards with an opponent's |
     | K | Look at one of yours and one of theirs, then choose to swap or keep |

     Powers are optional: **Skip Power** ends your turn.
   - **Take the discard**: click the discard pile, then the card to replace. Everyone sees where it went.
5. **Jump in** at any time, even out of turn, while the jump-in window is open:
   - **Jump In: My Card** — discard your own card that matches the top discard.
   - **Jump In: Theirs** — discard an opponent's card you've seen and know matches, then give them one of yours.
6. Mistakes (wrong jump-in, acting out of turn, running out of time…) cost a face-down penalty card. A 9th card eliminates you.
7. When you think you're lowest, **CALL** at the start of your turn. Everyone else gets one final turn, then all cards are revealed. Lowest total wins; the caller wins ties.

Card values: number cards are face value, Ace 1, J/Q/black K 10, **red K 0, Joker −2**.

Also in the game: chat and emoji reactions, a **Call Mistake** button that asks the server to check another player's last move, four background themes, and stats and match history saved in your browser.

## Run it locally

Needs Node.js 20.19 or newer.

```bash
npm ci
npm --prefix client ci
npm run build:all
npm start
```

Open http://localhost:8080. To play against yourself on one computer, open a second player at http://127.0.0.1:8080: the two addresses keep separate saved sessions.

Tests:

```bash
npm test
```

## Architecture

```
src/engine.ts     Rules engine: a pure reducer, transition(state, action) -> next state
src/types.ts      Game state and action types
src/mask.ts       Per-player view of the state: hides every card a player may not see
src/server.ts     HTTP + WebSocket server: rooms, timers, reconnects, chat; serves the client
client/src/       React client (App.tsx) built with Vite
tests/            Vitest: rules, powers, jump-ins, calling, mistakes,
                  a 1,500-game random-play simulation, and socket tests against the real server
render.yaml       Render deployment (free web service)
```

- The server is the only source of truth. Clients send actions; the server checks them with the engine and sends each player a masked copy of the state. Hidden card values, real card ids and live scores never leave the server.
- Games live in memory. A server restart or redeploy ends games in progress. Player stats are stored in each browser (`localStorage`), since there is no database.
- Timers: 30 s per turn and per power, 5 minutes to reconnect after a disconnect.

## Deploying

Pushing to `main` redeploys on Render through `render.yaml`. The free plan sleeps after about 15 minutes idle, so the first visit can take up to a minute.
