# Card Game Rules — LLM Reference Document

## Overview

- **Players:** 2–4
- **Deck:** Standard 52-card deck + 2 Jokers (54 cards total)
- **Objective:** End the game with the **lowest total points** across your cards.
- **Play direction:** Counter-clockwise

---

## Card Point Values

| Card | Points |
|------|--------|
| 2–10 | Face value (e.g. 7 = 7 pts) |
| Jack | 10 |
| Queen | 10 |
| Black King (Spades/Clubs) | 10 |
| Ace | 1 |
| Red King (Hearts/Diamonds) | 0 |
| Joker | -2 |

**Minimum possible score:** -4 (two Jokers)

---

## Setup

1. Each player receives **4 cards**, placed face-down in a 2×2 grid (top-left, top-right, bottom-left, bottom-right). Players must keep card positions fixed throughout the game — cards cannot be rearranged.
2. The remaining cards form a **face-down draw pile** in the center.
3. Flip the **top card of the draw pile** face-up next to it — this is the **discard pile** starting card.
4. At the start, each player may **look once (and only once) at their two bottom cards** (bottom-left and bottom-right) and must memorise them. They may not look again unless a card power allows it.
5. The **winner of the previous game** goes first. For the first-ever game, determine the starting player via rock-paper-scissors or similar.

---

## Card Powers

Powers are only activated when a card is taken from the draw pile and placed **directly onto the discard pile** (i.e. the player does NOT keep or swap it). Powers cannot be used when jumping in.

| Card | Power |
|------|-------|
| 7 or 8 | **Look at one of your own cards** — flip it briefly so only you can see it, then replace face-down. |
| 9 or 10 | **Look at one of any opponent's cards** — flip it briefly so only you can see it, then replace face-down. |
| Jack or Queen | **Blind swap** — swap one of your cards with one card from any opponent, without looking at either. You may also do this knowingly if you've previously seen the cards via powers. |
| King (any) | **Look-and-swap** — look at one of your own cards AND one card from any opponent, then decide whether or not to swap them. Useful for gaining information even if you choose not to swap. |

---

## Turn Structure

On your turn, choose **one** of the following actions:

### Option A — Draw from the pile
1. Draw the top card from the draw pile and look at it privately.
2. **Keep it (swap):** Place the drawn card face-down in one of your card positions, removing the card that was there and placing that card face-up on the discard pile. No power is activated.
3. **Discard it (no swap):** Place the drawn card directly onto the discard pile face-up. If the card has a power (7, 8, 9, 10, Jack, Queen, King), you may now activate it.

### Option B — Take the top discard
1. Take the face-up top card of the discard pile (the card placed by the previous player).
2. Swap it with one of your cards. Place your unwanted card face-up on the discard pile.
3. **No power** is activated. **Disadvantage:** Everyone can see which card you took and where you placed it, making you vulnerable to Jump-In Type 2.

After your action, your turn ends and play passes to the player on your right.

---

## Special Actions: Jumping In

Jumping in is **not a turn** — it happens outside of turn order and does not prevent the current turn from continuing or the next player from playing normally.

### Jump-In Type 1 — Matching your own card

**Trigger:** Any player places a card on the discard pile and you have a card of the **same number**.

**Action:** Immediately place your matching card(s) face-up on the discard pile.

**Result:** You lose that card from your grid, reducing your card count and points.

**Rules:**
- You can jump in with multiple cards if you have more than one matching card.
- No power is activated on jumped-in cards.
- You may jump in on your own turn too (see Example 1 below).

**Example 1 (own turn):** On your turn you draw a 4 from the pile. You know your top-left card is also a 4. Instead of keeping the drawn 4 (to replace a worse card), you can discard the drawn 4 directly to the pile and then jump in by discarding your top-left 4 — removing it from your grid entirely.

**Example 2 (opponent's turn):** An opponent discards a 7. You have two 7s in your grid. You immediately jump in and place both 7s on the pile, removing them from your grid.

---

### Jump-In Type 2 — Using knowledge of an opponent's card

**Trigger:** Any player places a card on the discard pile AND you know that an opponent has a card of the **same number** (from previously using a 9/10/King power).

**Action:** Take that opponent's matching card and place it face-up on the discard pile. Then give one of your own cards (ideally a high-point card) to that opponent, who places it face-down in the empty position.

**Result:** You remove a known card from their grid and offload one of your high-value cards onto them.

**Rules:**
- No power is activated.
- **Whoever physically touches the opponent's card first has the right to execute the jump-in**, even if the opponent tries to block or grab it back.
- This does not count as a turn.

**Example:** Two turns ago you used a 9-power and saw that Player 2's top-left card is an 8. Now Player 3 discards an 8. You can immediately take Player 2's top-left card and place it on the pile, then give Player 2 your Jack (which you know from the game start), increasing their score and decreasing yours.

---

## Calling (Ending the Round)

When a player believes they have the **lowest total points**, they may **"call"** on their turn.

**Rules for calling:**
- Can only be called **at the start of your turn**, before drawing or taking a card.
- Jumping in on a previous turn does NOT prevent you from calling.
- You cannot call on someone else's turn.

**After a call:**
- Every other player gets **one final turn**, going in order (counter-clockwise), but they **cannot interact** with (use powers on, jump-in from, etc.) the caller's cards or the cards of any player who has already taken their final turn.
- Players who have NOT yet taken their final turn can still be interacted with.
- After all final turns, all cards are flipped face-up and points are totalled.

**Winning:**
- The player with the lowest total wins.
- **Tiebreaker:** If the caller ties with another player, the caller wins (reward for taking the risk).

**Special case — zero cards:** If a player has eliminated all their cards (via jumping in), they have 0 points and will call on their next turn. Other players can still call before that turn arrives.

---

## Mistakes (Penalties)

When a player makes a mistake, they must **draw the top card from the draw pile and add it face-down to their grid** (without looking at it). This increases their card count and point total.

**List of mistakes:**

| Mistake | Description |
|---------|-------------|
| Skipping a turn | Playing out of order / skipping another player |
| Wrong jump-in number | Jumping in with a card that doesn't match the discard pile number |
| Wrong power usage | e.g. using Jack to do a look-and-swap (only Kings can do that) |
| Illegal peeking | Looking at top cards at game start (only bottom 2 allowed), or looking at any cards at any other time without a valid power |
| Double power use | Using the same card's power more than once (e.g. looking at two of your own cards from a single 8) |
| Moving card positions | Rearranging cards in your grid. All cards must stay in their original positions throughout the game; swapped cards take the exact position of the card they replaced |
| Revealing a card | Placing a card face-up when it should be face-down |

**Maximum cards:** A player can hold at most **8 cards** (4 starting + 4 mistake cards). If a 9th card would be added, that player is **automatically eliminated (forfeits the round)**.

---

## State a Developer Should Track Per Player

- `cards`: Array of 4–8 card objects, each with:
  - `value`: number/rank (A, 2–10, J, Q, K, Joker)
  - `suit`: (Hearts, Diamonds, Clubs, Spades, or null for Joker)
  - `position`: fixed grid slot (top-left, top-right, bottom-left, bottom-right, + overflow slots for penalties)
  - `face_up`: boolean (almost always false during play)
  - `known_by`: list of player IDs who have seen this card via powers
- `score`: calculated sum of visible (called) card point values
- `has_called`: boolean
- `mistake_count`: integer (0–4)

## Key Game Rules Summary for Logic Implementation

1. **Card positions are immutable** — only the card occupying a slot changes, never the slot's position in the grid.
2. **Powers only fire on direct discard** — not on swap or jump-in.
3. **Jump-ins are instant and out-of-turn** — do not advance the turn counter.
4. **Type 2 jump-in requires prior knowledge** — only valid if the jumping player has seen that specific card via a power earlier in the game.
5. **First-touch rule** — in Type 2 jump-in, the first player to touch the target card executes the action.
6. **Call ends the round** — one final turn for everyone else, then scoring.
7. **Caller wins ties** — caller beats anyone they tie with on points.
8. **8-card forfeit** — hitting 9 cards = auto-elimination.
