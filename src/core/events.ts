/**
 * Central typed event bus (GDD §12). Systems talk through events instead of importing
 * each other, which keeps them testable and makes future Co-op easier.
 * Add new events to GameEvents; payload types are checked at every emit/on.
 */

export type Phase = 'day' | 'evening' | 'night';

export interface GameEvents {
  'run:start': { seed: string; mode: 'casual' | 'daily' };
  'run:end': { night: number; result: 'win' | 'lose' | 'surrender' };
  'phase:change': { day: number; phase: Phase };
  'player:levelup': { level: number };
  'player:down': { hp: number };
  'draft:open': { cards: string[] };
  'draft:pick': { card: string };
  'skill:fused': { a: string; b: string; result: string };
  'disaster:warn': { id: string; inSeconds: number };
  /** A line from the "System" (system_lines.md). `id` is the line id; the scene shows th or en. */
  'system:say': { id: string; th: string; en: string };
  /** Daytime auto-pickup of an ingredient (Gap round 2 R2). */
  'item:pickup': { kind: string; count: number; x: number; y: number };
}

type Handler<T> = (payload: T) => void;

export class EventBus<E extends object = GameEvents> {
  private handlers = new Map<keyof E, Set<Handler<never>>>();

  on<K extends keyof E>(event: K, handler: Handler<E[K]>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler<never>);
    return () => this.off(event, handler);
  }

  once<K extends keyof E>(event: K, handler: Handler<E[K]>): () => void {
    const off = this.on(event, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  off<K extends keyof E>(event: K, handler: Handler<E[K]>): void {
    this.handlers.get(event)?.delete(handler as Handler<never>);
  }

  emit<K extends keyof E>(event: K, payload: E[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    // Copy so handlers that unsubscribe during emit don't skip their neighbours.
    for (const handler of [...set]) (handler as Handler<E[K]>)(payload);
  }

  clear(): void {
    this.handlers.clear();
  }
}
