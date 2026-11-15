# Core Game Engine Implementation Plan

Build the core game engine for the multiplayer card game as a standalone, pure TypeScript module. It operates as a deterministic state machine (reducer style: `(state, action) -> (nextState, result)`).

## User Review Required

> [!IMPORTANT]
> The engine is implemented as a pure function system (`transition(state, action): { state: GameState, error?: string }`). This ensures ease of integration with websockets, server-side storage, and automated testing.

## Proposed Changes

We will create a clean TypeScript structure inside `c:\Users\jaswi\Downloads\card_game`:
- `package.json` with devDependencies for TypeScript, Vitest, and ts-node.
- `tsconfig.json` for compilation.
- `src/types.ts` defining all structures (cards, players, game states, actions).
- `src/engine.ts` implementing the state transition logic, setup, reshuffling, turn phases, jump-in resolution, powers, and calling.
- `tests/engine.test.ts` containing the unit test suite covering all specified scenarios.

---

### [NEW] [package.json](file:///c:/Users/jaswi/Downloads/card_game/package.json)
Contains NPM dependencies, scripts to run tests (`vitest run`).

### [NEW] [tsconfig.json](file:///c:/Users/jaswi/Downloads/card_game/tsconfig.json)
Configures TypeScript compiler settings.

### [NEW] [types.ts](file:///c:/Users/jaswi/Downloads/card_game/src/types.ts)
Contains all TypeScript type definitions for the game state, card properties, player attributes, action types, and error/validation responses.

### [NEW] [engine.ts](file:///c:/Users/jaswi/Downloads/card_game/src/engine.ts)
Implements:
1. Game initialization (`createInitialState`).
2. Card deck generation and shuffling (52 cards + 2 Jokers).
3. The main `transition(state: GameState, action: Action, timestamp: number): { state: GameState; success: boolean; error?: string }` reducer.
4. Validation and state-handling for:
   - Drawing from draw pile (keep/swap or discard/activate power).
   - Taking from discard pile and swapping.
   - Activating powers (Look, Peek Opponent, Blind Swap, Look and Swap).
   - Jumping In (Type 1 & Type 2), handling first-touch priority, matching, chaining, and mistake-based penalty draws (wrong match, invalid peek, illegal moves).
   - Calling, managing the final turn sequence, and final scoring calculation including the caller tie-breaker rule.
   - Reshuffling the draw pile from discard pile when empty.
   
### [NEW] [engine.test.ts](file:///c:/Users/jaswi/Downloads/card_game/tests/engine.test.ts)
A Vitest suite verifying:
- Deal, state layout, initial peeking.
- Draw-keep, draw-discard actions, and top-discard swap actions.
- Each of the 4 card powers (7/8, 9/10, J/Q, K).
- Jump-in Type 1 (including Joker matching, King color matching, wrong number mistake, and chaining).
- Jump-in Type 2 (opponent matching, swapping, and first-click simulation).
- Penalty card rules, mistake logging, and 9th-card auto-elimination.
- Calling, final round turn progression, caller-tied-score win condition, and skipping calling with 0 cards.
- Reshuffling when the draw pile is empty.

---

## Verification Plan

### Automated Tests
Run Vitest to verify all rules:
`npm run test` or `npx vitest run`
