import { ensureArray, oneOrMany } from "../lib/utils";

describe("utils", () => {
  describe("ensureArray", () => {
    describe("with array", () => {
      it("should return empty array", async () => {
        return expect(ensureArray([])).toEqual([]);
      });

      it("should return empty array if array with null", async () => {
        return expect(ensureArray([null])).toEqual([null]);
      });
    });

    describe("with value", () => {
      it("should return empty array if value null", async () => {
        return expect(ensureArray(null)).toEqual([]);
      });

      it("should return array with string if value string", async () => {
        return expect(ensureArray("a")).toEqual(["a"]);
      });

      it("should return array with empty object if value empty object", async () => {
        return expect(ensureArray({})).toEqual([{}]);
      });

      it("should return array with object if value object", async () => {
        return expect(ensureArray({ a: "a" })).toEqual([{ a: "a" }]);
      });
    });
  });

  describe("oneOrMany", () => {
    describe("with one", () => {
      it("should return one if multi value", async () => {
        return expect(oneOrMany(["a", "b"], true)).toEqual("a");
      });

      it("should return one if single value", async () => {
        return expect(oneOrMany(["a"], true)).toEqual("a");
      });

      it("should return undefined if empty array", async () => {
        return expect(oneOrMany([], true)).toEqual(undefined);
      });
    });

    describe("with many", () => {
      it("should return one if multi value", async () => {
        return expect(oneOrMany(["a", "b"], false)).toEqual(["a", "b"]);
      });

      it("should return one if single value", async () => {
        return expect(oneOrMany(["a"], false)).toEqual(["a"]);
      });

      it("should return empty array if empty array", async () => {
        return expect(oneOrMany([], false)).toEqual([]);
      });
    });
  });
});
