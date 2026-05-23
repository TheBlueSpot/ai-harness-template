import { expect, test } from "bun:test";
import { createObjectPool } from "./object-pool.ts";

test("object pool reuses reset POJOs", () => {
  const pool = createObjectPool({
    create: () => ({ active: false, x: 0, y: 0 }),
    reset: (item) => {
      item.active = false;
      item.x = 0;
      item.y = 0;
    },
    capacity: 2
  });

  const first = pool.acquire();
  first.active = true;
  first.x = 12;
  first.y = 24;

  pool.release(first);
  const second = pool.acquire();

  expect(second).toBe(first);
  expect(second).toEqual({ active: false, x: 0, y: 0 });
  expect(pool.createdCount()).toBe(1);
});

test("object pool respects capacity", () => {
  const pool = createObjectPool({
    create: () => ({ value: 0 }),
    reset: (item) => {
      item.value = 0;
    },
    capacity: 1
  });

  const first = pool.acquire();
  const second = pool.acquire();

  pool.release(first);
  pool.release(second);

  expect(pool.freeCount()).toBe(1);
});
