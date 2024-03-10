import {
  default as Resource,
  ResourceEntry,
  UnionResource,
  handlebars
} from "../lib/resource.js"
import SparqlClient from "sparql-http-client"
import { Parser } from "sparqljs"
import {
  getTestResource,
  getTestResourceIndex,
  compileEmptyTemplate,
  getTestSparqlClient,
  getTestFile,
  getTestErrorSparqlClient,
} from "./test-helpers.js"
import { Kind } from "graphql"

const parser = new Parser()

function expectTemplatesToMatch(expected: string, actual: Resource) {
  return expectQueriesToMatch(
    handlebars.compile(expected, { noEscape: true })({}),
    compileEmptyTemplate(actual)
  )
}

function expectQueriesToMatch(expected: string, actual: string) {
  return expect(parser.parse(actual)).toEqual(parser.parse(expected))
}

describe("Resource", () => {
  describe("'s handlebars", () => {
    describe("with valid template", () => {
      const template = getTestFile("assets/queries/template.sparql")

      it("should compile correct template with no arguments", async () => {
        const actual = handlebars.compile(template, { noEscape: true })({})
        const expected = getTestFile("assets/queries/expected.sparql")
        return expectQueriesToMatch(expected, actual)
      })

      it("should compile correct template with iri argument", async () => {
        const actual = handlebars.compile(template, { noEscape: true })({ iri: 'http://example.org/test' })
        const expected = getTestFile("assets/queries/expected-iri.sparql")
        return expectQueriesToMatch(expected, actual)
      })

      it("should compile correct template with id argument", async () => {
        const actual = handlebars.compile(template, { noEscape: true })({ id: 'test' })
        const expected = getTestFile("assets/queries/expected-id.sparql")
        return expectQueriesToMatch(expected, actual)
      })
    })
    describe("with template containing eq helper", () => {
      const template = getTestFile("assets/queries/template-eq.sparql")
      const actual = handlebars.compile(template, { noEscape: true })({ iri: 'http://example.org/test' })
      const expected = getTestFile("assets/queries/expected-iri.sparql")

      it("should compile correct template", async () => {
        return expectQueriesToMatch(expected, actual)
      })
    })

    describe("with invalid template", () => {
      const template = getTestFile("assets/queries/template-invalid.sparql")

      it("should throw", () => {
        expect(
          handlebars.compile(template, { noEscape: true })
        ).toThrow()
      })
    })
  })


  describe("constructed", () => {
    describe("with valid arguments", () => {
      it("should not throw error", async () => {
        return expect(
          () =>
            new Resource(getTestResourceIndex(), {
              kind: Kind.OBJECT_TYPE_DEFINITION,
              name: {
                kind: Kind.NAME,
                value: "test",
              },
            })
        ).not.toThrow()
      })
    })
  })

  describe("buildFromTypeDefinition", () => {
    describe("with missing docs", () => {
      it("should throw error", async () => {
        return expect(() =>
          getTestResource("assets/with-no-docs.graphql")
        ).toThrowError()
      })
    })

    describe("with docs", () => {
      const res = getTestResource("assets/with-docs.graphql")

      it("should have a SPARQL client", () => {
        const expected = new SparqlClient({
          endpointUrl: "https://integbio.jp/rdf/sparql",
        })
        return expect(res.sparqlClient).toEqual(expected)
      })

      it("should have the correct SPARQL template", () => {
        const sparql = `
        PREFIX : <https://github.com/dbcls/grasp/ns/>
        PREFIX dcterms: <http://purl.org/dc/terms/>
        
        CONSTRUCT {
          ?iri :iri ?iri;
              :id ?id.
        }
        WHERE
        {
          { ?iri dcterms:identifier ?id }
        }
        `
        return expectTemplatesToMatch(sparql, res)
      })

      describe("and missing values", () => {
        it("should throw error if no endpoint", async () => {
          return expect(() =>
            getTestResource("assets/with-docs-no-endpoint.graphql")
          ).toThrowError()
        })

        it("should throw error if no sparql", async () => {
          return expect(() =>
            getTestResource("assets/with-docs-no-sparql.graphql")
          ).toThrowError()
        })
      })
    })
    describe("with grasp directives", () => {
      const res = getTestResource("assets/with-directives.graphql")

      it("should have a SPARQL client", () => {
        const expected = new SparqlClient({
          endpointUrl: "https://integbio.jp/rdf/sparql",
        })
        return expect(res.sparqlClient).toEqual(expected)
      })

      it("should return sparql value if no index", () => {
        return expect(compileEmptyTemplate(res)).toBe("test")
      })

      describe("and missing values", () => {
        it("should throw error if no endpoint", async () => {
          return expect(() =>
            getTestResource("assets/with-directives-no-endpoint.graphql")
          ).toThrowError()
        })

        it("should throw error if no sparql", async () => {
          return expect(() =>
            getTestResource("assets/with-directives-no-sparql.graphql")
          ).toThrowError()
        })
      })
    })
    describe("with embedded directive", () => {
      const res = getTestResource("assets/with-embedded.graphql", "Publisher")

      it("should not have a SPARQL client", () => {
        return expect(res.sparqlClient).toBeUndefined()
      })

      it("should not have a query template", () => {
        return expect(res.queryTemplate).toBeNull()
      })
    })
    describe("with template index", () => {
      it("should return entry if entry found in index", () => {
        const res = getTestResource(
          "assets/with-directives.graphql",
          "Test",
          undefined,
          new Map([["test", "sparql query"]])
        )
        return expect(compileEmptyTemplate(res)).toBe("sparql query")
      })

      it("should return value if entry not found", () => {
        const res = getTestResource(
          "assets/with-directives.graphql",
          "Test",
          undefined,
          new Map([["not test", "sparql query"]])
        )
        return expect(compileEmptyTemplate(res)).toBe("test")
      })
    })

    describe("with service index", () => {
      const expected = new SparqlClient({
        endpointUrl: "https://integbio.jp/rdf/sparql",
      })
      it("should return sparql client if entry found in index", () => {
        const res = getTestResource(
          "assets/with-directives.graphql",
          "Test",
          new Map([["https://integbio.jp/rdf/sparql", expected]])
        )
        return expect(res.sparqlClient).toEqual(expected)
      })

      it("should create sparql client if entry not found", () => {
        const res = getTestResource(
          "assets/with-directives.graphql",
          "Test",
          new Map([
            [
              "not entry",
              new SparqlClient({
                endpointUrl: "https://example.org/sparql",
              }),
            ],
          ])
        )
        return expect(res.sparqlClient).toEqual(expected)
      })
    })
  })

  describe("fetch", () => {

    describe("with unsuccessful response", () => {
      const res = getTestResource("assets/with-docs-primitives.graphql")

      res.sparqlClient = getTestErrorSparqlClient()

      res.resources = getTestResourceIndex(res)

      it("should throw", async () => {
        await expect(res.fetch({}, { proxyHeaders: {} })).resolves.toThrow()
      })

    })

    describe("with successful response", () => {

      const res = getTestResource("assets/with-docs-primitives.graphql")

      res.sparqlClient = getTestSparqlClient(getTestFile("assets/responses/fetch.ttl"))

      res.resources = getTestResourceIndex(res)

      it("should not throw", async () => {
        await expect(res.fetch({}, { proxyHeaders: {} })).resolves.not.toThrow()
      })

      it("should return all ResourceEntries", async () => {
        const expected: ResourceEntry[] = [
          {
            __typename: "Test",
            id: "subject1",
            iri: "http://example.org/subject1",
            count: 5,
            test: true,
          },
          {
            __typename: "Test",
            id: "subject2",
            iri: "http://example.org/subject2",
            count: 4,
            test: false,
          },
        ]
        const map = await res.fetch({}, { proxyHeaders: {} })
        expect(Array.from(map.values())).toStrictEqual(expected)

      })

      it("should not return properties not in graphql schema", async () => {
        const [firstValue] = await res.fetch({}, { proxyHeaders: {} })
        return expect(firstValue).not.toHaveProperty("obsolete")
      })

      it("should not return RDF literal", async () => {
        const expected: ResourceEntry = {
          __typename: "Test",
          id: "subject1",
          iri: "http://example.org/subject1",
          count: "\"5\"^^<http://www.w3.org/2001/XMLSchema#integer>",
          test: "\"true\"^^<http://www.w3.org/2001/XMLSchema#boolean>",
        }

        return expect(await res.fetch({}, { proxyHeaders: {} })).not.toContainEqual(expected)
      })

      it("should not return ResourceEntry when blanknode", async () => {
        const expected: ResourceEntry = {
          __typename: "Test",
          id: "b1",
          iri: "http://example.org/subject",
        }
        return expect(await res.fetch({}, { proxyHeaders: {} })).not.toContainEqual(expected)
      })
    })
  })

  describe("fetchByIRIs", () => {
    const res = getTestResource("assets/with-docs.graphql")
    res.fetch = async (args) => new Map([
      ["http://example.org/subject1", {
        __typename: "Test",
        id: "subject1",
        iri: "http://example.org/subject1",
      }],
      ["http://example.org/subject2", {
        __typename: "Test",
        id: "subject2",
        iri: "http://example.org/subject2",
      }],
    ])

    it("should return empty array when iris are empty", async () => {
      const map = await res.fetchByIRIs([], { proxyHeaders: {} })
      return expect(Array.from(map.values())).toStrictEqual([])
    })

    it("should return null when iri is not found", async () => {
      const map = await res.fetchByIRIs(["http://example.org/subject3"], { proxyHeaders: {} })
      return expect(
        Array.from(map.values())
      ).toStrictEqual([null])
    })

    it("should return matching entry when iri is given", async () => {
      const map = await res.fetchByIRIs(["http://example.org/subject1"], { proxyHeaders: {} })
      return expect(
        Array.from(map.values())
      ).toStrictEqual([
        {
          __typename: "Test",
          id: "subject1",
          iri: "http://example.org/subject1",
        },
      ])
    })

    it("should not throw error", async () => {
      return expect(() => res.fetchByIRIs([], { proxyHeaders: {} })).not.toThrow()
    })
  })

  // describe("query", () => {
  //   it("should throw when client is undefined", async () => {
  //     const res = new Resource(undefined, undefined);
  //     await expect(res.query({})).rejects.toThrow();
  //   });

  //   const res = getTestResource("assets/with-docs.graphql");
  //   res.sparqlClient = {
  //     query: (): any => null,
  //     store: () => null
  //   }

  //   it("should return empty array", async () => {
  //     return expect(await res.query({})).toStrictEqual([]);
  //   });
  // });

})

describe("UnionResource", () => {
  describe("constructed", () => {
    const res = getTestResource("assets/with-directives-union-type.graphql")
    describe("with valid arguments", () => {
      it("should not throw error", async () => {
        return expect(
          () =>
            new UnionResource(getTestResourceIndex(res).all, {
              kind: Kind.UNION_TYPE_DEFINITION,
              name: {
                kind: Kind.NAME,
                value: "UnionTest",
              },
              types: [
                {
                  kind: Kind.NAMED_TYPE,
                  name: {
                    kind: Kind.NAME,
                    value: "Test",
                  },
                }
              ]
            })
        ).not.toThrow()
      })
    })
  })

  describe("buildFromTypeDefinition", () => {

    const res = getTestResource("assets/with-directives-union-type.graphql")

    describe("with valid arguments", () => {
      it("should not throw error", async () => {
        return expect(
          () =>
            UnionResource.buildFromTypeDefinition([res], {
              kind: Kind.UNION_TYPE_DEFINITION,
              name: {
                kind: Kind.NAME,
                value: "UnionTest",
              },
              types: [
                {
                  kind: Kind.NAMED_TYPE,
                  name: {
                    kind: Kind.NAME,
                    value: "Test",
                  },
                }
              ]
            })
        ).not.toThrow()
      })
    })

    describe("with missing Type", () => {
      it("should throw error", async () => {
        return expect(
          () =>
            UnionResource.buildFromTypeDefinition([res], {
              kind: Kind.UNION_TYPE_DEFINITION,
              name: {
                kind: Kind.NAME,
                value: "UnionTest",
              },
              types: [
                {
                  kind: Kind.NAMED_TYPE,
                  name: {
                    kind: Kind.NAME,
                    value: "Test4",
                  },
                }
              ]
            })
        ).toThrow()
      })
    })

  })

  describe("fetch", () => {

    const res = getTestResource("assets/with-directives-union-type.graphql", "Test")

    res.sparqlClient = getTestSparqlClient(getTestFile("assets/responses/fetch-union-1.ttl"))

    const res2 = getTestResource("assets/with-directives-union-type.graphql", "Test2")

    res2.sparqlClient = getTestSparqlClient(getTestFile("assets/responses/fetch-union-2.ttl"))

    const index = getTestResourceIndex([res, res2])
    res.resources = index
    res2.resources = index

    const unionRes = UnionResource.buildFromTypeDefinition([res, res2], {
      kind: Kind.UNION_TYPE_DEFINITION,
      name: {
        kind: Kind.NAME,
        value: "UnionTest",
      },
      types: [
        {
          kind: Kind.NAMED_TYPE,
          name: {
            kind: Kind.NAME,
            value: "Test",
          },
        },
        {
          kind: Kind.NAMED_TYPE,
          name: {
            kind: Kind.NAME,
            value: "Test2",
          },
        }
      ]
    })

    it("should not throw", async () => {
      await expect(unionRes.fetch({}, { proxyHeaders: {} })).resolves.not.toThrow()
    })

    it("should return all ResourceEntries", async () => {
      const expected: ResourceEntry[] = [
        {
          __typename: "Test",
          id: "subject1",
          iri: "http://example.org/subject1",
          count: 5,
          test: true,
        },
        {
          __typename: "Test",
          id: "subject2",
          iri: "http://example.org/subject2",
          count: 4,
          test: false,
        },
        {
          __typename: "Test2",
          iri: "http://example.org/subject3",
          count: 5,
          name_ja: "test",
          page: true,
        }
      ]
      const map = await unionRes.fetch({}, { proxyHeaders: {} })
      expect(Array.from(map.values())).toStrictEqual(expected)

    })

    it("should not return properties not in graphql schema", async () => {
      const [firstValue] = await unionRes.fetch({}, { proxyHeaders: {} })
      return expect(firstValue).not.toHaveProperty("obsolete")
    })

    it("should not return RDF literal", async () => {
      const expected: ResourceEntry = {
        __typename: "Test",
        id: "subject1",
        iri: "http://example.org/subject1",
        count: "\"5\"^^<http://www.w3.org/2001/XMLSchema#integer>",
        test: "\"true\"^^<http://www.w3.org/2001/XMLSchema#boolean>",
      }

      return expect(await unionRes.fetch({}, { proxyHeaders: {} })).not.toContainEqual(expected)
    })

    it("should not return ResourceEntry when blanknode", async () => {
      const expected: ResourceEntry = {
        __typename: "Test",
        id: "b1",
        iri: "http://example.org/subject",
      }
      return expect(await unionRes.fetch({}, { proxyHeaders: {} })).not.toContainEqual(expected)
    })
  })

  describe("fetchByIRIs", () => {
    const res = getTestResource("assets/with-directives-union-type.graphql", "Test")

    res.fetch = async (args) => new Map([
      ["http://example.org/subject1", {
        __typename: "Test",
        id: "subject1",
        iri: "http://example.org/subject1",
      }],
      ["http://example.org/subject2", {
        __typename: "Test",
        id: "subject2",
        iri: "http://example.org/subject2",
      }],
    ])

    const res2 = getTestResource("assets/with-directives-union-type.graphql", "Test2")

    res2.fetch = async (args) => new Map([
      ["http://example.org/subject3", {
        __typename: "Test2",
        id: "subject1",
        iri: "http://example.org/subject3",
      }],
      ["http://example.org/subject4", {
        __typename: "Test2",
        id: "subject2",
        iri: "http://example.org/subject4",
      }],
    ])

    const unionRes = UnionResource.buildFromTypeDefinition([res, res2], {
      kind: Kind.UNION_TYPE_DEFINITION,
      name: {
        kind: Kind.NAME,
        value: "UnionTest",
      },
      types: [
        {
          kind: Kind.NAMED_TYPE,
          name: {
            kind: Kind.NAME,
            value: "Test",
          },
        },
        {
          kind: Kind.NAMED_TYPE,
          name: {
            kind: Kind.NAME,
            value: "Test2",
          },
        }
      ]
    })

    it("should return empty array when iris are empty", async () => {
      const map = await unionRes.fetchByIRIs([], { proxyHeaders: {} })
      return expect(Array.from(map.values())).toStrictEqual([])
    })

    it("should return null when iri is not found", async () => {
      const map = await unionRes.fetchByIRIs(["http://example.org/subject5"], { proxyHeaders: {} })
      return expect(
        Array.from(map.values())
      ).toStrictEqual([null])
    })

    it("should return matching entry when iri is given", async () => {
      const map = await unionRes.fetchByIRIs(["http://example.org/subject1"], { proxyHeaders: {} })
      return expect(
        Array.from(map.values())
      ).toStrictEqual([
        {
          __typename: "Test",
          id: "subject1",
          iri: "http://example.org/subject1",
        },
      ])
    })

    it("should not throw error", async () => {
      return expect(() => unionRes.fetchByIRIs([], { proxyHeaders: {} })).not.toThrow()
    })
  })
})
