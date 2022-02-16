import {
  ensureArray,
  oneOrMany,
  hasDirective,
  isListType,
  unwrapCompositeType,
  getDirective,
  getDirectiveArgumentValue,
  valueToString,
} from "../lib/utils";
import {
  ObjectTypeDefinitionNode,
  TypeNode,
  DirectiveNode,
  ValueNode,
} from "graphql";

describe("utils", () => {
  describe("isListType", () => {
    describe("with list object", () => {
      it("should return true", () => {
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
        return expect(isListType(def)).toBeTruthy();
      });
      it("should return true when nested", () => {
        const def: TypeNode = {
          kind: "NonNullType",
          type: {
            kind: "ListType",
            type: {
              kind: "NamedType",
              name: {
                kind: "Name",
                value: "test",
              },
            },
          },
        };
        return expect(isListType(def)).toBeTruthy();
      });
    });
    describe("with not list type", () => {
      it("should return false if not list", () => {
        const def: TypeNode = {
          kind: "NamedType",
          name: {
            kind: "Name",
            value: "test",
          },
        };
        return expect(isListType(def)).toBeFalsy();
      });
      it("should return false when nested with no list", () => {
        const def: TypeNode = {
          kind: "NonNullType",
          type: {
            kind: "NamedType",
            name: {
              kind: "Name",
              value: "test",
            },
          },
        };
        return expect(isListType(def)).toBeFalsy();
      });
    });
  });
  describe("unwrapCompositeType", () => {
    describe("with nested NamedType", () => {
      it("should return NamedType", () => {
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
        return expect(unwrapCompositeType(def)).toEqual({
          kind: "NamedType",
          name: {
            kind: "Name",
            value: "test",
          },
        });
      });
      it("should return NamedType when double nested", () => {
        const def: TypeNode = {
          kind: "NonNullType",
          type: {
            kind: "ListType",
            type: {
              kind: "NamedType",
              name: {
                kind: "Name",
                value: "test",
              },
            },
          },
        };
        return expect(unwrapCompositeType(def)).toEqual({
          kind: "NamedType",
          name: {
            kind: "Name",
            value: "test",
          },
        });
      });
      it("should return NamedType when nested in NonNullType", () => {
        const def: TypeNode = {
          kind: "NonNullType",
          type: {
            kind: "NamedType",
            name: {
              kind: "Name",
              value: "test",
            },
          },
        };
        return expect(unwrapCompositeType(def)).toEqual({
          kind: "NamedType",
          name: {
            kind: "Name",
            value: "test",
          },
        });
      });
    });
    describe("with not nested NamedType", () => {
      it("should return itself", () => {
        const def: TypeNode = {
          kind: "NamedType",
          name: {
            kind: "Name",
            value: "test",
          },
        };
        return expect(unwrapCompositeType(def)).toBe(def);
      });
    });
  });
  describe("ensureArray", () => {
    describe("with array", () => {
      it("should return empty array", () => {
        return expect(ensureArray([])).toEqual([]);
      });

      it("should return empty array if array with null", () => {
        return expect(ensureArray([null])).toEqual([null]);
      });
    });

    describe("with value", () => {
      it("should return empty array if value null", () => {
        return expect(ensureArray(null)).toEqual([]);
      });

      it("should return array with string if value string", () => {
        return expect(ensureArray("a")).toEqual(["a"]);
      });

      it("should return array with empty object if value empty object", () => {
        return expect(ensureArray({})).toEqual([{}]);
      });

      it("should return array with object if value object", () => {
        return expect(ensureArray({ a: "a" })).toEqual([{ a: "a" }]);
      });
    });
  });

  describe("oneOrMany", () => {
    describe("with one", () => {
      it("should return one if multi value", () => {
        return expect(oneOrMany(["a", "b"], true)).toEqual("a");
      });

      it("should return one if single value", () => {
        return expect(oneOrMany(["a"], true)).toEqual("a");
      });

      it("should return undefined if empty array", () => {
        return expect(oneOrMany([], true)).toEqual(undefined);
      });
    });

    describe("with many", () => {
      it("should return one if multi value", () => {
        return expect(oneOrMany(["a", "b"], false)).toEqual(["a", "b"]);
      });

      it("should return one if single value", () => {
        return expect(oneOrMany(["a"], false)).toEqual(["a"]);
      });

      it("should return empty array if empty array", () => {
        return expect(oneOrMany([], false)).toEqual([]);
      });
    });
  });

  describe("hasDirective", () => {
    const def: ObjectTypeDefinitionNode = {
      kind: "ObjectTypeDefinition",
      name: {
        kind: "Name",
        value: "definition",
      },
      directives: [
        {
          kind: "Directive",
          name: {
            kind: "Name",
            value: "test",
          },
        },
      ],
    };

    it("should return true if directive is present", () => {
      return expect(hasDirective(def, "test")).toEqual(true);
    });

    it("should return false if directive is not present", () => {
      return expect(hasDirective(def, "test2")).toEqual(false);
    });

    it("should return undefined if directive name is null", () => {
      return expect(hasDirective(def, null)).toEqual(false);
    });
  });

  describe("getDirective", () => {
    const def: ObjectTypeDefinitionNode = {
      kind: "ObjectTypeDefinition",
      name: {
        kind: "Name",
        value: "definition",
      },
      directives: [
        {
          kind: "Directive",
          name: {
            kind: "Name",
            value: "test",
          },
        },
      ],
    };

    it("should return DirectiveNode if directive is present", () => {
      return expect(getDirective(def, "test")).toEqual({
        kind: "Directive",
        name: {
          kind: "Name",
          value: "test",
        },
      });
    });

    it("should return undefined if directive is not present", () => {
      return expect(getDirective(def, "test2")).toBeUndefined();
    });

    it("should return undefined if directive name is null", () => {
      return expect(getDirective(def, null)).toBeUndefined();
    });
  });

  describe("getDirectiveArgumentValue", () => {
    const def: DirectiveNode = {
      kind: "Directive",
      name: {
        kind: "Name",
        value: "name",
      },
      arguments: [
        {
          kind: "Argument",
          name: {
            kind: "Name",
            value: "name",
          },
          value: {
            kind: "StringValue",
            value: "test",
          },
        },
      ],
    };

    it("should return value if argument is present", () => {
      return expect(getDirectiveArgumentValue(def, "name")).toBe("test");
    });

    it("should return undefined if argument is not present", () => {
      return expect(getDirectiveArgumentValue(def, "name2")).toBeUndefined();
    });

    it("should return undefined if argument name is null", () => {
      return expect(getDirectiveArgumentValue(def, null)).toBeUndefined();
    });
  });

  describe("valueToString", () => {
    it("should return value if of type StringValue", () => {
      return expect(
        valueToString({
          kind: "StringValue",
          value: "test",
        })
      ).toBe("test");
    });

    it("should return undefined if not of type StringValue ", () => {
      return expect(
        valueToString({
          kind: "BooleanValue",
          value: true,
        })
      ).toBeUndefined()
    });

    it("should return undefined if argument name is null", () => {
      return expect(valueToString(null)).toBeUndefined();
    });
  });
});
