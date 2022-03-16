import {
  ensureArray,
  oneOrMany,
  hasDirective,
  isListType,
  unwrapCompositeType,
  getDirective,
  getDirectiveArgumentValue,
  valueToString,
  ntriplesLiteral,
  ntriplesIri,
  join,
} from "../lib/utils";
import {
  ObjectTypeDefinitionNode,
  TypeNode,
  DirectiveNode,
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
      ).toBeUndefined();
    });

    it("should return undefined if argument name is null", () => {
      return expect(valueToString(null)).toBeUndefined();
    });
  });

  describe("ntriplesLiteral", () => {
    it("should return ntriples literal from string", () => {
      return expect(ntriplesLiteral("test")).toStrictEqual(['"test"']);
    });

    it("should return ntriples literal from array of strings", () => {
      return expect(ntriplesLiteral(["test1", "test2"])).toStrictEqual([
        '"test1"',
        '"test2"',
      ]);
    });

    it("should return empty array if value is null", () => {
      return expect(ntriplesLiteral(null)).toStrictEqual([]);
    });

    it("should return empty array if array is empty", () => {
      return expect(ntriplesLiteral([])).toStrictEqual([]);
    });
  });

  describe("ntriplesIri", () => {
    it("should return ntriples IRI from URI string", () => {
      return expect(ntriplesIri("http://example.org")).toStrictEqual([
        "<http://example.org>",
      ]);
    });

    it("should return ntriples IRI from array of URI strings", () => {
      return expect(
        ntriplesIri(["http://example.org/1", "http://example.org/2"])
      ).toStrictEqual(["<http://example.org/1>", "<http://example.org/2>"]);
    });

    it("should return ntriples IRI from URN string", () => {
      return expect(ntriplesIri("urn:test:val")).toStrictEqual([
        "<urn:test:val>",
      ]);
    });

    // TODO: re-add when validate-iri library is available
    // it("should throw if string is not a valid IRI", () => {
    //   return expect(
    //      () => ntriplesIri("invalid")
    //   ).toThrow()
    // });

    it("should return empty array if value is null", () => {
      return expect(ntriplesIri(null)).toStrictEqual([]);
    });

    it("should return empty array if array is empty", () => {
      return expect(ntriplesIri([])).toStrictEqual([]);
    });
  });

  describe("join", () => {
    it("should return same string from string", () => {
      return expect(join(",", "test")).toBe("test");
    });

    it("should return same string from single string array", () => {
      return expect(join(",", ["test"])).toBe("test");
    });

    it("should return joined string from array of strings", () => {
      return expect(join(",", ["test1", "test2"])).toBe("test1,test2");
    });

    it("should throw if separator is null", () => {
      return expect(() => join(null, null)).toThrow();
    });

    it("should return empty string if value is null", () => {
      return expect(join(",", null)).toBe("");
    });

    it("should return empty string if array is empty", () => {
      return expect(join(",", [])).toBe("");
    });
  });
});
