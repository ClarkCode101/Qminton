// A random-number source returning numbers in [0, 1), like Math.random.
// The app uses Math.random; tests pass a seeded one so results repeat.
export type Rng = () => number;

// Small seeded generator (mulberry32). Same seed -> same sequence.
export function createSeededRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Python's random.choice.
export function pickOne<T>(items: T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)];
}

// Python's random.sample(items, len(items)): a shuffled copy.
export function shuffled<T>(items: T[], rng: Rng): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapWith = Math.floor(rng() * (index + 1));
    [copy[index], copy[swapWith]] = [copy[swapWith], copy[index]];
  }
  return copy;
}
