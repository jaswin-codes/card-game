# Card Game Project TODO - MVP (2-Player Minimum Viable)

> Note: the MVP list below came from the original template and mentions things the
> game doesn't use (Socket.io, Manus OAuth, a database). The real game uses plain
> WebSockets (`src/server.ts`), has no login, and keeps games in memory.

## Core Game Features (MVP)
- [x] Database schema for games, players, cards, and game state
- [x] WebSocket server setup with Socket.io for real-time synchronization
- [x] Game rules engine (card values, powers, turn order, scoring)
- [x] Deck initialization and card dealing logic
- [x] Game initialization endpoint (deal cards, set turn order)
- [x] Draw pile and discard pile management
- [x] Turn-based draw/discard/keep actions
- [x] Basic scoring calculation
- [x] Simple calling system (declare lowest hand)
- [x] Drawn card state tracking (server-side)

## UI - Lobby & Navigation (MVP)
- [x] Landing page with create/join room options
- [x] Lobby screen showing room code and player list
- [x] Ready button and game start confirmation

## UI - Game Board (MVP)
- [x] Dark background with bright felt-style table
- [x] Player card grids (2x2 layout)
- [x] Draw pile and discard pile visualization
- [x] Current turn indicator
- [x] Draw card button
- [x] Discard card button
- [x] Keep/swap decision UI
- [x] Game state sync from server

## UI - Game Actions & Feedback (MVP)
- [x] Draw card action UI
- [x] Discard card action UI
- [x] Keep/swap decision flow
- [x] Turn change notifications (via toast)
- [x] Basic error messages

## UI - Scoreboard (MVP)
- [x] Round scoreboard showing both players' scores
- [x] Game end screen with final scores and winner

## Authentication & Lobby (MVP)
- [x] User authentication with Manus OAuth
- [x] Allow unauthenticated users to see lobby
- [x] Login redirect on create/join actions

## Testing & Polish (MVP)
- [x] Manual 2-player gameplay testing (ready)
- [x] Error handling and edge cases
- [x] Basic vitest unit tests for game rules

## Advanced Features (Post-MVP)
- [x] Card power system (7, 8, 9, 10, J, Q, K powers)
- [x] Jump-In Type 1 (matching card) mechanic
- [x] Jump-In Type 2 (knowledge-based steal) mechanic
- [x] Full calling system with final turns
- [x] Automatic mistake penalties
- [x] Manual "Call Mistake" button for player-reported violations
- [x] 3-4 player support
- [x] In-game chat or emoji reactions
- [x] Player stats and match history
- [x] Different background themes
