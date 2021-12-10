import { ensureArray } from "../lib/utils";

describe("utils", () => {
  describe("ensureArray", () => {
    describe("with array", () => {
      it("should return empty array", async () => {
        return expect(ensureArray([])).toEqual([]);
      });

      it("should return empty array if array with null", async () => {
        return expect(ensureArray([null])).toEqual([]);
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

  describe("ensureArray", () => {});
});
