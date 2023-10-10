import {
  buildEntry,
  default as Resource,
  ResourceEntry,
  handlebars
} from "../lib/resource.js";
import SparqlClient from "sparql-http-client";
import { Parser } from "sparqljs";
import {
  getTestResource,
  getTestResources,
  compileEmptyTemplate,
  getTestSparqlClient,
  getTestFile,
} from "./test-helpers.js";
import type { Quad } from "@rdfjs/types";
// @ts-ignore
import quad from "rdf-quad";
import { Kind } from "graphql";

const parser = new Parser();

function expectTemplatesToMatch(expected: string, actual: Resource) {
  return expectQueriesToMatch(
    handlebars.compile(expected, { noEscape: true })({}),
    compileEmptyTemplate(actual)
  );
}

function expectQueriesToMatch(expected: string, actual: string) {
  return expect(parser.parse(actual)).toEqual(parser.parse(expected));
}

describe("resource", () => {
  describe("constructed", () => {
    describe("with valid arguments", () => {
      it("should not throw error", async () => {
        return expect(
          () =>
            new Resource(getTestResources(), {
              kind: Kind.OBJECT_TYPE_DEFINITION,
              name: {
                kind: Kind.NAME,
                value: "test",
              },
            })
        ).not.toThrow();
      });
    });
  });

  describe("with valid templates", () => {
    const template = getTestFile("assets/queries/template.sparql")

    it("should compile correct template", async () => {
      const actual = handlebars.compile(template, { noEscape: true })({iri: 'http://example.org/test'})
      const expected = getTestFile("assets/queries/expected-iri.sparql")
      return expectQueriesToMatch(expected, actual);
    });
  });

  describe("with invalid template", () => {
    const template = getTestFile("assets/queries/template-invalid.sparql")

    it("should throw", () => {
      expect(
        handlebars.compile(template, { noEscape: true })
      ).toThrow()
    });
  });

  describe("buildFromTypeDefinition", () => {
    describe("with missing docs", () => {
      it("should throw error", async () => {
        return expect(() =>
          getTestResource("assets/with-no-docs.graphql")
        ).toThrowError();
      });
    });

    describe("with docs", () => {
      const res = getTestResource("assets/with-docs.graphql");

      it("should have a SPARQL client", () => {
        const expected = new SparqlClient({
          endpointUrl: "https://integbio.jp/rdf/sparql",
        });
        return expect(res.sparqlClient).toEqual(expected);
      });

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
        `;
        return expectTemplatesToMatch(sparql, res);
      });

      describe("and missing values", () => {
        it("should throw error if no endpoint", async () => {
          return expect(() =>
            getTestResource("assets/with-docs-no-endpoint.graphql")
          ).toThrowError();
        });

        it("should throw error if no sparql", async () => {
          return expect(() =>
            getTestResource("assets/with-docs-no-sparql.graphql")
          ).toThrowError();
        });
      });
    });
    describe("with grasp directives", () => {
      const res = getTestResource("assets/with-directives.graphql");

      it("should have a SPARQL client", () => {
        const expected = new SparqlClient({
          endpointUrl: "https://integbio.jp/rdf/sparql",
        });
        return expect(res.sparqlClient).toEqual(expected);
      });

      it("should return sparql value if no index", () => {
        return expect(compileEmptyTemplate(res)).toBe("test");
      });

      describe("and missing values", () => {
        it("should throw error if no endpoint", async () => {
          return expect(() =>
            getTestResource("assets/with-directives-no-endpoint.graphql")
          ).toThrowError();
        });

        it("should throw error if no sparql", async () => {
          return expect(() =>
            getTestResource("assets/with-directives-no-sparql.graphql")
          ).toThrowError();
        });
      });
    });
    describe("with embedded directive", () => {
      const res = getTestResource("assets/with-embedded.graphql", "Publisher");

      it("should not have a SPARQL client", () => {
        return expect(res.sparqlClient).toBeUndefined();
      });

      it("should not have a query template", () => {
        return expect(res.queryTemplate).toBeNull();
      });
    });
    describe("with template index", () => {
      it("should return entry if entry found in index", () => {
        const res = getTestResource(
          "assets/with-directives.graphql",
          "Test",
          undefined,
          new Map([["test", "sparql query"]])
        );
        return expect(compileEmptyTemplate(res)).toBe("sparql query");
      });

      it("should return value if entry not found", () => {
        const res = getTestResource(
          "assets/with-directives.graphql",
          "Test",
          undefined,
          new Map([["not test", "sparql query"]])
        );
        return expect(compileEmptyTemplate(res)).toBe("test");
      });
    });

    describe("with service index", () => {
      const expected = new SparqlClient({
        endpointUrl: "https://integbio.jp/rdf/sparql",
      });
      it("should return sparql client if entry found in index", () => {
        const res = getTestResource(
          "assets/with-directives.graphql",
          "Test",
          new Map([["https://integbio.jp/rdf/sparql", expected]])
        );
        return expect(res.sparqlClient).toEqual(expected);
      });

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
        );
        return expect(res.sparqlClient).toEqual(expected);
      });
    });
  });

  describe("fetch", () => {

    const res = getTestResource("assets/with-docs-primitives.graphql");
    const subject = "http://example.org/subject1";
    const subject2 = "http://example.org/subject2";
    
    res.sparqlClient = getTestSparqlClient([
      quad(subject, "https://github.com/dbcls/grasp/ns/iri", subject),
      quad(subject, "https://github.com/dbcls/grasp/ns/id", '"subject1"'),
      quad(subject, "https://github.com/dbcls/grasp/ns/count", 5),
      quad(subject, "https://github.com/dbcls/grasp/ns/test", true),
      quad(subject, "https://github.com/dbcls/grasp/ns/obsolete", "obsolete"),
      quad(subject2, "https://github.com/dbcls/grasp/ns/iri", subject2),
      quad(subject2, "https://github.com/dbcls/grasp/ns/id", '"subject2"'),
      quad(subject2, "https://github.com/dbcls/grasp/ns/count", 4),
      quad(subject2, "https://github.com/dbcls/grasp/ns/test", false),
      quad("_:b1", "https://github.com/dbcls/grasp/ns/iri", subject),
      quad("_:b1", "https://github.com/dbcls/grasp/ns/id", '"subject"'),
    ]);

    res.resources = getTestResources(res);

    it("should not throw", async () => {
      await expect(res.fetch({}, {proxyHeaders:{}})).resolves.not.toThrow();
    });

    it("should return all ResourceEntries", async () => {
      const expected: ResourceEntry[] = [
        {
          id: "subject1",
          iri: "http://example.org/subject1",
          count: 5,
          test: true,
        },
        {
          id: "subject2",
          iri: "http://example.org/subject2",
          count: 4,
          test: false,
        },
      ];

        expect(await res.fetch({},{proxyHeaders:{}})).toStrictEqual(expected)
  
    });

    it("should not return properties not in graphql schema", async () => {
      return expect((await res.fetch({},{proxyHeaders:{}}))[0]).not.toHaveProperty("obsolete");
    });

    it("should not return RDF literal", async () => {
      const expected: ResourceEntry = {
        id: "subject1",
        iri: "http://example.org/subject1",
        count: "\"5\"^^<http://www.w3.org/2001/XMLSchema#integer>",
        test: "\"true\"^^<http://www.w3.org/2001/XMLSchema#boolean>",
      };

      return expect(await res.fetch({},{proxyHeaders:{}})).not.toContainEqual(expected);
    });

    it("should not return ResourceEntry when blanknode", async () => {
      const expected: ResourceEntry = {
        id: "b1",
        iri: "http://example.org/subject",
      };
      return expect(await res.fetch({},{proxyHeaders:{}})).not.toContainEqual(expected);
    });
  });

  describe("fetchByIRIs", () => {
    const res = getTestResource("assets/with-docs.graphql");
    res.fetch = async (args) => [
      {
        id: "subject1",
        iri: "http://example.org/subject1",
      },
      {
        id: "subject2",
        iri: "http://example.org/subject2",
      },
    ];

    it("should return empty array when iris are empty", async () => {
      return expect(await res.fetchByIRIs([],{proxyHeaders:{}})).toStrictEqual([]);
    });

    it("should return null when iri is not found", async () => {
      return expect(
        await res.fetchByIRIs(["http://example.org/subject3"],{proxyHeaders:{}})
      ).toStrictEqual([null]);
    });

    it("should return matching entry when iri is given", async () => {
      return expect(
        await res.fetchByIRIs(["http://example.org/subject1"],{proxyHeaders:{}})
      ).toStrictEqual([
        {
          id: "subject1",
          iri: "http://example.org/subject1",
        },
      ]);
    });

    it("should not throw error", async () => {
      return expect(() => res.fetchByIRIs([],{proxyHeaders:{}})).not.toThrow();
    });
  });

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

  describe("buildEntry", () => {
    describe("called with values", () => {
      const subject = "http://example.org/subject";
      const bindingGroupedBySubject: Record<string, Quad[]> = {
        [subject]: [
          quad(subject, "https://github.com/dbcls/grasp/ns/iri", subject),
          quad(subject, "https://github.com/dbcls/grasp/ns/id", '"subject"'),
        ],
      };
      const res = getTestResource("assets/with-docs.graphql");
      const resources = getTestResources(res);

      it("should return ResourceEntry", () => {
        return expect(
          buildEntry(bindingGroupedBySubject, subject, res, resources)
        ).toStrictEqual({
          iri: subject,
          id: "subject",
        });
      });
    });

    describe("called without iri", () => {
      const subject = "http://example.org/subject";
      const bindingGroupedBySubject: Record<string, Quad[]> = {
        [subject]: [
          quad(subject, "https://github.com/dbcls/grasp/ns/test1", '"Test"'),
          quad(subject, "https://github.com/dbcls/grasp/ns/test2", "http://example.org/X"),
          quad(subject, "https://github.com/dbcls/grasp/ns/test3", "http://example.org/Y")
        ],
      };
      const res = getTestResource("assets/with-docs.graphql");
      const resources = getTestResources(res);

      it("should return ResourceEntry", () => {
        return expect(
          buildEntry(bindingGroupedBySubject, subject, res, resources)
        ).toStrictEqual({
          iri: subject,
          id: undefined,
        });
      });
    });

    describe("called with embedded type", () => {
      const subject = "http://example.org/subject";
      const publisher = "http://example.org/publisher";
      const bindingGroupedBySubject: Record<string, Quad[]> = {
        [subject]: [
          quad(subject, "https://github.com/dbcls/grasp/ns/iri", subject),
          quad(
            subject,
            "https://github.com/dbcls/grasp/ns/publisher",
            publisher
          ),
        ],
        [publisher]: [
          quad(
            publisher,
            "https://github.com/dbcls/grasp/ns/name_ja",
            '"name_ja"'
          ),
          quad(
            publisher,
            "https://github.com/dbcls/grasp/ns/name_en",
            '"name_en"'
          ),
          quad(
            publisher,
            "https://github.com/dbcls/grasp/ns/page",
            '"publisher_page"'
          ),
        ],
      };
      const res = getTestResource("assets/with-embedded.graphql");
      const emRes = getTestResource(
        "assets/with-embedded.graphql",
        "Publisher"
      );
      const resources = {
        all: [res, emRes],
        root: [res],
        isUserDefined: () => true,
        lookup: (name: string) => {
          switch (name) {
            case "Publisher":
              return emRes;
            case "Test":
            default:
              return res;
          }
        },
      };

      it("should return ResourceEntry for embedded type", () => {
        return expect(
          buildEntry(bindingGroupedBySubject, publisher, emRes, resources)
        ).toStrictEqual({
          iri: publisher,
          name_en: "name_en",
          name_ja: "name_ja",
          page: "publisher_page",
        });
      });

      it("should return nested ResourceEntry for root type", () => {
        return expect(
          buildEntry(bindingGroupedBySubject, subject, res, resources)
        ).toStrictEqual({
          iri: subject,
          publisher: {
            iri: publisher,
            name_en: "name_en",
            name_ja: "name_ja",
            page: "publisher_page",
          },
        });
      });
    });

    describe("called with blanknode embedded type", () => {
      const subject = "http://example.org/subject";
      const bindingGroupedBySubject: Record<string, Quad[]> = {
        [subject]: [
          quad(subject, "https://github.com/dbcls/grasp/ns/iri", subject),
          quad(
            subject,
            "https://github.com/dbcls/grasp/ns/publisher",
            '_:b1'
          ),
        ],
        ['b1']: [
          quad(
            '_:b1',
            "https://github.com/dbcls/grasp/ns/name_ja",
            '"name_ja"'
          ),
          quad(
            '_:b1',
            "https://github.com/dbcls/grasp/ns/name_en",
            '"name_en"'
          ),
          quad(
            '_:b1',
            "https://github.com/dbcls/grasp/ns/page",
            '"publisher_page"'
          ),
        ],
      };
      const res = getTestResource("assets/with-embedded.graphql");
      const emRes = getTestResource(
        "assets/with-embedded.graphql",
        "Publisher"
      );
      const resources = {
        all: [res, emRes],
        root: [res],
        isUserDefined: () => true,
        lookup: (name: string) => {
          switch (name) {
            case "Publisher":
              return emRes;
            case "Test":
            default:
              return res;
          }
        },
      };

      it("should return nested ResourceEntry for root type", () => {
        return expect(
          buildEntry(bindingGroupedBySubject, subject, res, resources)
        ).toStrictEqual({
          iri: subject,
          publisher: {
            iri: "b1",
            name_en: "name_en",
            name_ja: "name_ja",
            page: "publisher_page",
          },
        });
      });
    });
  });
});
