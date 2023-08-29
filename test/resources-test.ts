import Resources from "../lib/resources.js";
import { getResourceTypeDefs } from "./test-helpers.js";
import { TypeNode } from 'graphql';
import Resource from "../lib/resource.js";
import { Kind } from "graphql";


describe("resources", () => {
  describe("initalized with empty array", () => {
    const resources = new Resources([]);
    
    it("should not contain root resources", () => {
      expect(resources.root).toStrictEqual([]);
    });

    it("should return null at lookup", () => {
      expect(resources.lookup("test")).toBeNull();
    });

    it("should return false at isUserDefined", () => {
      const def: TypeNode = {
        kind: Kind.LIST_TYPE,
        type: {
          kind: Kind.NAMED_TYPE,
          name: {
            kind: Kind.NAME,
            value: "test",
          },
        },
      };
      expect(resources.isUserDefined(def)).toBe(false);
    });
  });

  describe("initalized with empty array", () => {
    const typeDefs = getResourceTypeDefs("assets/with-docs.graphql");
    const resources = new Resources(typeDefs);

     it("should contain root resources", () => {
       expect(resources.all).toHaveLength(1);
     });
    
    it("should not contain root resources", () => {
      expect(resources.root).toHaveLength(1);
    });

    it("should return Resource at successful lookup", () => {
      expect(resources.lookup("Test")).toBeInstanceOf(Resource);
    });

    it("should return null at unsuccessful lookup", () => {
      expect(resources.lookup("SomethingElse")).toBeNull();
    });

    it("should return true at isUserDefined", () => {
      const def: TypeNode = {
        kind: Kind.LIST_TYPE,
        type: {
          kind: Kind.NAMED_TYPE,
          name: {
            kind: Kind.NAME,
            value: "Test",
          },
        },
      };
      expect(resources.isUserDefined(def)).toBe(true);
    });
  });
});
