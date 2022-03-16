import {
  buildEntry,
  default as Resource,
  ResourceEntry,
} from "../lib/resource";
import SparqlClient from "sparql-http-client";
import { Parser } from "sparqljs";
import Handlebars from "handlebars";
import { getTestResource } from "./test-helpers";
import type { Quad } from "@rdfjs/types";
import quad from "rdf-quad";

const handlebars = Handlebars.create();
const parser = new Parser();

function expectTemplatesToMatch(expected: string, actual: Resource) {
  return expectQueriesToMatch(
    handlebars.compile(expected, { noEscape: true })({}),
    actual.queryTemplate({})
  );
}

function expectQueriesToMatch(expected: string, actual: string) {
  return expect(parser.parse(actual)).toEqual(parser.parse(expected));
}

describe("resource", () => {
  describe("constructed", () => {
    describe("with undefined", () => {
      it("should not throw error", async () => {
        return expect(() => new Resource(undefined, undefined)).not.toThrow();
      });
    });
  });
  describe("buildFromTypeDefinition", () => {
    describe("with undefined resource type definitions", () => {
      it("should throw error", async () => {
        return expect(() =>
          Resource.buildFromTypeDefinition(undefined, undefined)
        ).toThrowError();
      });
    });

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
        return expect(res.queryTemplate({})).toBe("test");
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
        return expect(res.queryTemplate({})).toBe("sparql query");
      });

      it("should return value if entry not found", () => {
        const res = getTestResource(
          "assets/with-directives.graphql",
          "Test",
          undefined,
          new Map([["not test", "sparql query"]])
        );
        return expect(res.queryTemplate({})).toBe("test");
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

      it("should throw if sparql client is invalid", () => {
        return expect(() =>
          getTestResource(
            "assets/with-directives.graphql",
            "Test",
            new Map([["https://integbio.jp/rdf/sparql", undefined]])
          )
        ).toThrow();
      });
    });
  });

  describe("fetch", () => {
    it("should throw when Resource initialized with undefined", async () => {
      const res = new Resource(undefined, undefined);
      await expect(res.fetch({})).rejects.toThrow();
    });

    const res = getTestResource("assets/with-docs.graphql");
    const subject = "http://example.org/subject";
    res.query = async (args: object) => {
      return [
        quad(subject, "https://github.com/dbcls/grasp/ns/iri", subject),
        quad(subject, "https://github.com/dbcls/grasp/ns/id", '"subject"'),
        quad("_:b1", "https://github.com/dbcls/grasp/ns/iri", subject),
        quad("_:b1", "https://github.com/dbcls/grasp/ns/id", '"subject"'),
      ];
    };

    res.resources = {
      all: [res],
      root: [res],
      isUserDefined: () => true,
      lookup: (name: string) => null,
    };

    it("should not throw", async () => {
      await expect(res.fetch({})).resolves.not.toThrow();
    });

    it("should return ResourceEntry", async () => {
      const expected: ResourceEntry = {
        id: "subject",
        iri: "http://example.org/subject",
      };

      return expect(await res.fetch({})).toContainEqual(expected);
    });

    it("should return ResourceEntry when blanknode", async () => {
      const expected: ResourceEntry = {
        id: "b1",
        iri: "http://example.org/subject",
      };
      return expect(await res.fetch({})).not.toContainEqual([expected]);
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
      return expect(await res.fetchByIRIs([])).toStrictEqual([]);
    });

    it("should return null when iri is not found", async () => {
      return expect(
        await res.fetchByIRIs(["http://example.org/subject3"])
      ).toStrictEqual([null]);
    });

    it("should return matching entry when iri is given", async () => {
      return expect(
        await res.fetchByIRIs(["http://example.org/subject1"])
      ).toStrictEqual([
        {
          id: "subject1",
          iri: "http://example.org/subject1",
        },
      ]);
    });

    it("should not throw error", async () => {
      return expect(() => res.fetchByIRIs([])).not.toThrow();
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
    describe("called with nulls", () => {
      it("should throw", () => {
        return expect(() => buildEntry(null, null, null, null)).toThrow();
      });
    });

    describe("called with values", () => {
      const subject = "http://example.org/subject";
      const bindingGroupedBySubject: Record<string, Quad[]> = {
        [subject]: [
          quad(subject, "https://github.com/dbcls/grasp/ns/iri", subject),
          quad(subject, "https://github.com/dbcls/grasp/ns/id", '"subject"'),
        ],
      };
      const res = getTestResource("assets/with-docs.graphql");
      const resources = {
        all: [res],
        root: [res],
        isUserDefined: () => true,
        lookup: (name: string) => null,
      };

      it("should return ResourceEntry", () => {
        return expect(
          buildEntry(bindingGroupedBySubject, subject, res, resources)
        ).toStrictEqual({
          iri: subject,
          id: "subject",
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
              return res;
          }
        },
      };

      it("should return ResourceEntry for embedded type", () => {
        return expect(
          buildEntry(bindingGroupedBySubject, publisher, emRes, resources)
        ).toStrictEqual({
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
            name_en: "name_en",
            name_ja: "name_ja",
            page: "publisher_page",
          },
        });
      });
    });
  });
});
