/**
 * time.ts — Brogue's turn-based energy scheduler.
 *
 * Brogue does NOT use a simple "one action per turn" model. Every actor
 * has a `ticksUntilTurn` counter. The player acts, the world advances by
 * the player's action cost, and every actor whose counter reaches zero
 * takes its turn.
 *
 * Brogue's scale:
 *   100 ticks = one action per player turn
 *    50 ticks = two actions per player turn
 *    25 ticks = four actions per player turn
 *   200 ticks = one action every two player turns
 *
 * The player's own `movementSpeed` is 100, so the player acts once per
 * turn and monsters with 50 tick speeds act twice as often.
 */

export const PLAYER_TICK_COST = 100;

/** An actor in the world with its own action clock. */
export interface Actor {
  id: number;
  /** Ticks until this actor's next turn. */
  ticksUntilTurn: number;
  /** How many ticks this actor's action costs. */
  tickCost: number;
  /** true when the actor has already acted this world-tick. */
  hasActed: boolean;
  /** true when the actor is dead or gone. */
  removed: boolean;
}

export interface Scheduler {
  actors: Actor[];
  /** The world clock, in ticks. */
  clock: number;
  /** The player's turn counter. */
  playerTurn: number;
  /** The absolute turn counter (monsters acting also advance it). */
  absoluteTurn: number;
}

/**
 * Port of Brogue's monster "ticksUntilTurn" bookkeeping.
 *
 * The player acts and costs `cost` ticks. Every actor whose
 * `ticksUntilTurn` drops to zero or below takes its turn and resets its
 * clock to its own tick cost.
 */
export function advanceWorld(
  scheduler: Scheduler,
  cost: number,
  onActorTurn: (actor: Actor) => void
): void {
  scheduler.clock += cost;
  scheduler.absoluteTurn++;

  for (const actor of scheduler.actors) {
    if (actor.removed) continue;
    actor.ticksUntilTurn -= cost;
    // A fast actor may take several turns in one player action.
    let guard = 0;
    while (actor.ticksUntilTurn <= 0 && guard < 16) {
      actor.ticksUntilTurn += actor.tickCost;
      onActorTurn(actor);
      guard++;
    }
  }
}

/** Create a scheduler with a single player actor. */
export function createScheduler(playerId = 0): Scheduler {
  return {
    actors: [
      {
        id: playerId,
        ticksUntilTurn: PLAYER_TICK_COST,
        tickCost: PLAYER_TICK_COST,
        hasActed: false,
        removed: false,
      },
    ],
    clock: 0,
    playerTurn: 0,
    absoluteTurn: 0,
  };
}

/** Add a monster to the scheduler. */
export function addActor(
  scheduler: Scheduler,
  id: number,
  movementSpeed: number,
  _attackSpeed: number
): Actor {
  const actor: Actor = {
    id,
    ticksUntilTurn: movementSpeed,
    tickCost: movementSpeed,
    hasActed: false,
    removed: false,
  };
  scheduler.actors.push(actor);
  return actor;
}

/**
 * The number of actions an actor takes per player turn.
 * A movementSpeed of 50 means two actions per player turn.
 */
export function actionsPerTurn(tickCost: number): number {
  return Math.max(1, Math.floor(PLAYER_TICK_COST / tickCost));
}

/**
 * Port of Brogue's scent decay.
 * Scent fades by 3 units per subjective player turn, or 10 while invisible.
 */
export function scentDecay(invisible: boolean): number {
  return invisible ? 10 : 3;
}
