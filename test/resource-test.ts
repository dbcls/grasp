import Resource from "../lib/resource";
import fs from "fs";
import { parse } from "graphql/language/parser";
import { ObjectTypeDefinitionNode } from "graphql";
import { join } from "path";
import SparqlClient from "sparql-http-client";
import { Parser } from "sparqljs";
import Handlebars from "handlebars";
const handlebars = Handlebars.create();
const parser = new Parser();

function getResourceTypeDefs(path: string): ObjectTypeDefinitionNode[] {
  const schema = fs.readFileSync(join(__dirname, path), { encoding: "utf-8" });
  return parse(schema).definitions.filter(
    (def): def is ObjectTypeDefinitionNode => {
      return def.kind === "ObjectTypeDefinition";
    }
  );
}
function getTestResource(path: string, name: string = "Test"): Resource {
  const resourceTypeDefs = getResourceTypeDefs(path);
  const testResourceTypeDef = resourceTypeDefs.filter(
    (def) => def.name.value === name
  )[0];
  return Resource.buildFromTypeDefinition(undefined, testResourceTypeDef);
}

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
          ?iri :iri ?iri .
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
});
