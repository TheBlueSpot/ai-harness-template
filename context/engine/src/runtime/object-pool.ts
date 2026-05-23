export type ObjectPoolOptions<T> = {
  create: () => T;
  reset: (item: T) => void;
  capacity?: number;
};

export type ObjectPool<T> = {
  acquire(): T;
  release(item: T): void;
  preload(count?: number): void;
  freeCount(): number;
  createdCount(): number;
};

export function createObjectPool<T>({ create, reset, capacity = 256 }: ObjectPoolOptions<T>): ObjectPool<T> {
  const free: T[] = [];
  let created = 0;

  function acquire() {
    const item = free.pop();
    if (item) return item;
    created += 1;
    return create();
  }

  function release(item: T) {
    reset(item);
    if (free.length < capacity) free.push(item);
  }

  return {
    acquire,
    release,
    preload(count = capacity) {
      while (free.length < count && free.length < capacity) {
        free.push(create());
        created += 1;
      }
    },
    freeCount() {
      return free.length;
    },
    createdCount() {
      return created;
    }
  };
}
