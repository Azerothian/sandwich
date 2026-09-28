import { describe, expect, test, jest } from '@jest/globals';
import waterfall from '../../src/utils/waterfall';

describe("utils:waterfall", () => {

  test('execution', async () => {
    let result = "";
    await waterfall(["answer"], (arg) => {
      result = arg;
      return result;
    });
    expect(result).toBe("answer");
  });

  describe("positive", () => {
    test('passes the previous value to the next function', async () => {
      const result = await waterfall<number>([1, 2, 3], (val, prev) => prev + val, 0);
      expect(result).toBe(6);
    });

    test('passes the current index', async () => {
      const indexes: number[] = [];
      await waterfall(["a", "b", "c"], (_val, _prev, idx) => {
        indexes.push(idx!);
      });
      expect(indexes).toEqual([0, 1, 2]);
    });

    test('runs async functions sequentially', async () => {
      const order: string[] = [];
      await waterfall([30, 10, 0], async (delay) => {
        await new Promise((r) => setTimeout(r, delay));
        order.push(`done-${delay}`);
      });
      expect(order).toEqual(["done-30", "done-10", "done-0"]);
    });

    test('empty array returns the start value', async () => {
      const func = jest.fn();
      const result = await waterfall([], func, "start");
      expect(result).toBe("start");
      expect(func).not.toHaveBeenCalled();
    });

    test('undefined array defaults to empty', async () => {
      const result = await waterfall(undefined, () => "never", "start");
      expect(result).toBe("start");
    });

    test('non-array input is wrapped in an array', async () => {
      const seen: any[] = [];
      await waterfall("single" as any, (val) => { seen.push(val); });
      expect(seen).toEqual(["single"]);
    });

    test('break stops further iterations and keeps the current value', async () => {
      const seen: number[] = [];
      const result = await waterfall<number>([1, 2, 3, 4], (val, _prev, _idx, brk) => {
        seen.push(val);
        if (val === 2) {
          brk!();
        }
        return val * 10;
      });
      expect(seen).toEqual([1, 2]);
      expect(result).toBe(20);
    });
  });

  describe("negative", () => {
    test('rejects when a function throws and stops iterating', async () => {
      const seen: number[] = [];
      await expect(waterfall([1, 2, 3], (val) => {
        seen.push(val);
        if (val === 2) {
          throw new Error("boom");
        }
      })).rejects.toThrow("boom");
      expect(seen).toEqual([1, 2]);
    });

    test('rejects when an async function rejects', async () => {
      await expect(waterfall([1], async () => {
        throw new Error("async boom");
      })).rejects.toThrow("async boom");
    });
  });
});
