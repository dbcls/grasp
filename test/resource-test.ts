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
    });
    describe("with grasp directives", () => {
      const res = getTestResource("assets/with-directives.graphql");

      it("should have a SPARQL client", () => {
        const expected = new SparqlClient({
          endpointUrl: "https://integbio.jp/rdf/sparql",
        });
        return expect(res.sparqlClient).toEqual(expected);
      });

      describe("and no index", () => {
        it("should return sparql value", () => {
          return expect(res.queryTemplate({})).toBe("test");
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
  });

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
