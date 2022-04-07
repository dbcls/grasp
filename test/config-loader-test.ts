import ConfigLoader from "../lib/config-loader";
import SparqlClient from "sparql-http-client";
import { join } from "path";

describe("config-loader", () => {
  describe("loadServiceIndexFromFile", () => {

    describe("with empty string", () => {
      it("should throw", async () => {
        return expect(ConfigLoader.loadServiceIndexFromFile("")).rejects.toThrow();
      });
    });
    describe("with empty json file", () => {
      const filePath = join(__dirname, "assets/services-empty.json");
      it("should return empty index", async () => {
        return expect(ConfigLoader.loadServiceIndexFromFile(filePath)).resolves.toEqual(new Map<string, SparqlClient>());
      });
    });
    describe("with a single service file", () => {
      const filePath = join(__dirname, "assets/services.json");

      const expected = new Map<string, SparqlClient>([
        ["test", new SparqlClient({
          endpointUrl: "http://dbpedia.org/sparql/",
          user: "user",
          password: "pass",
        })]
      ])

      it("should return an index with one SparqlClient", async () => {
        return expect(ConfigLoader.loadServiceIndexFromFile(filePath)).resolves.toEqual(expected);
      });
    });
  });
  describe("loadTemplateIndexFromDirectory", () => {
    describe("with empty string", () => {
      it("should throw", async () => {
        return expect(ConfigLoader.loadTemplateIndexFromDirectory("")).rejects.toThrow();
      });
    });
    describe("with empty directory", () => {
      const dirPath = join(__dirname, "assets/resources-empty");
      it("should return empty index", async () => {
        return expect(ConfigLoader.loadTemplateIndexFromDirectory(dirPath)).resolves.toEqual(new Map<string, string>());
      });
    });
    describe("with non empty directory", () => {
      const dirPath = join(__dirname, "assets/resources-template");
      it("should return index", async () => {
        const expected = new Map<string, string>([
          ["test.sparql", `PREFIX : <https://github.com/dbcls/grasp/ns/>
PREFIX dcterms: <http://purl.org/dc/terms/>

CONSTRUCT {
  ?iri :iri ?iri .
  ?iri :id ?id .
}
WHERE
{
  { ?iri dcterms:identifier ?id }
}`]
        ])
        return expect(ConfigLoader.loadTemplateIndexFromDirectory(dirPath)).resolves.toEqual(expected);
      });
    });
  });
});
