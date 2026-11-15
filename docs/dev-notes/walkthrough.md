# Game Engine Walkthrough

I have successfully built and verified the core game engine for the browser-based multiplayer card game as a standalone, pure TypeScript module.

## File Structure

- [src/types.ts](file:///c:/Users/jaswi/Downloads/card_game/src/types.ts): All type definitions, including `Card`, `Player`, `GameState`, `Action`, `ConnectionStatus`, and `ActionResponse`.
- [src/engine.ts](file:///c:/Users/jaswi/Downloads/card_game/src/engine.ts): Core game setup, Fisher-Yates shuffling, the primary reducer function `transition()`, and side-effect-free scoring/mistake resolution logic.
- [tests/engine.test.ts](file:///c:/Users/jaswi/Downloads/card_game/tests/engine.test.ts): Unit tests verifying the engine under exact game conditions (calling, jump-ins, colors, and mistake limits).

## Features Implemented

1. **Card Layout & State**: Setup handles 54 cards (52 standard + 2 Jokers) with bottom-two cards initial knowledge mapping.
2. **Turn Operations**: Handles Draw-Keep, Draw-Discard, and Take-Discard.
3. **Card Powers**:
   - `7`/`8`: Look at own card.
   - `9`/`10`: Look at opponent's card.
   - `Jack`/`Queen`: Blind swap.
   - `King`: Look-and-swap.
4. **Jump-In Logic**:
   - **Type 1 (Own)**: Same-rank, Joker matching, and color-independent King matching.
   - **Type 2 (Opponent)**: Prior knowledge requirement, click race simulation.
   - **Chaining**: Window remains open on sequential matching discards.
5. **Mistake Penalties**:
   - 7 mistake types result in auto penalty card draw.
   - 8-card limit is enforced; receiving a 9th card automatically eliminates the player.
6. **Calling & End Round**:
   - Caller wins ties.
   - 0-card players can choose to skip calling strategically.
   - Caller/finished players' cards are locked from interaction.

## Verification Results

Running the Vitest test suite runs 16 targeted edge case tests:
```bash
npx vitest run
```

All 16 tests passed successfully.
