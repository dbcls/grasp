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
} from "../lib/utils.js";
import {
  ObjectTypeDefinitionNode,
  TypeNode,
  DirectiveNode,
  Kind
} from "graphql";

describe("utils", () => {
  describe("isListType", () => {
    describe("with list object", () => {
      it("should return true", () => {
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
        return expect(isListType(def)).toBeTruthy();
      });
      it("should return true when nested", () => {
        const def: TypeNode = {
          kind: Kind.NON_NULL_TYPE,
          type: {
            kind: Kind.LIST_TYPE,
            type: {
              kind: Kind.NAMED_TYPE,
              name: {
                kind: Kind.NAME,
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
          kind: Kind.NAMED_TYPE,
          name: {
            kind: Kind.NAME,
            value: "test",
          },
        };
        return expect(isListType(def)).toBeFalsy();
      });
      it("should return false when nested with no list", () => {
        const def: TypeNode = {
          kind: Kind.NON_NULL_TYPE,
          type: {
            kind: Kind.NAMED_TYPE,
            name: {
              kind: Kind.NAME,
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
          kind: Kind.LIST_TYPE,
          type: {
            kind: Kind.NAMED_TYPE,
            name: {
              kind: Kind.NAME,
              value: "test",
            },
          },
        };
        return expect(unwrapCompositeType(def)).toEqual({
          kind: Kind.NAMED_TYPE,
          name: {
            kind: Kind.NAME,
            value: "test",
          },
        });
      });
      it("should return NamedType when double nested", () => {
        const def: TypeNode = {
          kind: Kind.NON_NULL_TYPE,
          type: {
            kind: Kind.LIST_TYPE,
            type: {
              kind: Kind.NAMED_TYPE,
              name: {
                kind: Kind.NAME,
                value: "test",
              },
            },
          },
        };
        return expect(unwrapCompositeType(def)).toEqual({
          kind: Kind.NAMED_TYPE,
          name: {
            kind: Kind.NAME,
            value: "test",
          },
        });
      });
      it("should return NamedType when nested in NonNullType", () => {
        const def: TypeNode = {
          kind: Kind.NON_NULL_TYPE,
          type: {
            kind: Kind.NAMED_TYPE,
            name: {
              kind: Kind.NAME,
              value: "test",
            },
          },
        };
        return expect(unwrapCompositeType(def)).toEqual({
          kind: Kind.NAMED_TYPE,
          name: {
            kind: Kind.NAME,
            value: "test",
          },
        });
      });
    });
    describe("with not nested NamedType", () => {
      it("should return itself", () => {
        const def: TypeNode = {
          kind: Kind.NAMED_TYPE,
          name: {
            kind: Kind.NAME,
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
      const def: TypeNode = {
        kind: Kind.NAMED_TYPE,
        name: {
          kind: Kind.NAME,
          value: "test",
        },
      };
      it("should return one if multi value", () => {
        return expect(oneOrMany(["a", "b"], def)).toEqual("a");
      });

      it("should return one if single value", () => {
        return expect(oneOrMany(["a"], def)).toEqual("a");
      });

      it("should return undefined if empty array", () => {
        return expect(oneOrMany([], def)).toEqual(undefined);
      });

      it("should return null if nulls in array", () => {
        return expect(oneOrMany([null], def)).toEqual(null);
      });
    });

    describe("with many", () => {
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
      it("should return many if multi value", () => {
        return expect(oneOrMany(["a", "b"], def)).toEqual(["a", "b"]);
      });

      it("should return many if single value", () => {
        return expect(oneOrMany(["a"], def)).toEqual(["a"]);
      });

      it("should return empty array if empty array", () => {
        return expect(oneOrMany([], def)).toEqual([]);
      });

      it("should return nulls if null in array", () => {
        return expect(oneOrMany([null], def)).toEqual([null]);
      });
    });

    describe("with many non nullable", () => {
      const def: TypeNode = {
        kind: Kind.LIST_TYPE,
        type: {
          kind: Kind.NON_NULL_TYPE,
          type: {
            kind: Kind.NAMED_TYPE,
            name: {
              kind: Kind.NAME,
              value: "test",
            },
          },
        },
      };
      it("should return many if multi value", () => {
        return expect(oneOrMany(["a", "b"], def)).toEqual(["a", "b"]);
      });

      it("should return many if single value", () => {
        return expect(oneOrMany(["a"], def)).toEqual(["a"]);
      });

      it("should return empty array if empty array", () => {
        return expect(oneOrMany([], def)).toEqual([]);
      });

      it("should return empty array if null in array", () => {
        return expect(oneOrMany([null], def)).toEqual([]);
      });

      it("should not return nulls if multi value", () => {
        return expect(oneOrMany(["a", null, "b"], def)).toEqual(["a", "b"]);
      });
    });
  });

  describe("hasDirective", () => {
    const def: ObjectTypeDefinitionNode = {
      kind: Kind.OBJECT_TYPE_DEFINITION,
      name: {
        kind: Kind.NAME,
        value: "definition",
      },
      directives: [
        {
          kind: Kind.DIRECTIVE,
          name: {
            kind: Kind.NAME,
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

    it("should return false if directive name is empty", () => {
      return expect(hasDirective(def, "")).toEqual(false);
    });
  });

  describe("getDirective", () => {
    const def: ObjectTypeDefinitionNode = {
      kind: Kind.OBJECT_TYPE_DEFINITION,
      name: {
        kind: Kind.NAME,
        value: "definition",
      },
      directives: [
        {
          kind: Kind.DIRECTIVE,
          name: {
            kind: Kind.NAME,
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

    it("should return undefined if directive name is empty", () => {
      return expect(getDirective(def, "")).toBeUndefined();
    });
  });

  describe("getDirectiveArgumentValue", () => {
    const def: DirectiveNode = {
      kind: Kind.DIRECTIVE,
      name: {
        kind: Kind.NAME,
        value: "name",
      },
      arguments: [
        {
          kind: Kind.ARGUMENT,
          name: {
            kind: Kind.NAME,
            value: "name",
          },
          value: {
            kind: Kind.STRING,
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

    it("should return undefined if argument name is empty", () => {
      return expect(getDirectiveArgumentValue(def, "")).toBeUndefined();
    });
  });

  describe("valueToString", () => {
    it("should return value if of type StringValue", () => {
      return expect(
        valueToString({
          kind: Kind.STRING,
          value: "test",
        })
      ).toBe("test");
    });

    it("should return undefined if not of type StringValue ", () => {
      return expect(
        valueToString({
          kind: Kind.BOOLEAN,
          value: true,
        })
      ).toBeUndefined();
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

    it("should return empty array if array is empty", () => {
      return expect(ntriplesIri([])).toStrictEqual([]);
    });
  });
});
