import Resources from "../lib/resources";
import { getResourceTypeDefs } from "./test-helpers";
import { TypeNode } from 'graphql';
import Resource from "../lib/resource";


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
        kind: "ListType",
        type: {
          kind: "NamedType",
          name: {
            kind: "Name",
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
        kind: "ListType",
        type: {
          kind: "NamedType",
          name: {
            kind: "Name",
            value: "Test",
          },
        },
      };
      expect(resources.isUserDefined(def)).toBe(true);
    });
  });
});
