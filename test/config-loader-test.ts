import ConfigLoader from "../lib/config-loader.js"
import SparqlClient from "sparql-http-client"
import { join } from "path"
import * as url from 'url'
import { jest } from '@jest/globals'

const dirname = url.fileURLToPath(new URL('.', import.meta.url))
describe("config-loader", () => {
  describe("loadServiceIndex", () => {

    const OLD_ENV = process.env

    beforeEach(() => {
      jest.resetModules() // Most important - it clears the cache
      process.env = { ...OLD_ENV } // Make a copy
    })

    afterAll(() => {
      process.env = OLD_ENV // Restore old environment
    })

    describe("with no env variables set", () => {
      it("should not throw", async () => {
        return expect(ConfigLoader.loadServiceIndex()).resolves.not.toThrow()
      })

      it("should return empty index", async () => {
        return expect(ConfigLoader.loadServiceIndex()).resolves.toEqual(new Map<string, SparqlClient>())
      })
    })
    describe("with SERVICES_FILE set", () => {
      describe("to empty json file", () => {
        const filePath = join(dirname, "assets/services-empty.json")
        it("should return empty index", async () => {
          process.env.SERVICES_FILE = filePath
          return expect(ConfigLoader.loadServiceIndex()).resolves.toEqual(new Map<string, SparqlClient>())
        })
      })

      describe("to json file with incomplete entry", () => {
        const filePath = join(dirname, "assets/services-incomplete.json")
        it("should return empty index", async () => {
          process.env.SERVICES_FILE = filePath
          return expect(ConfigLoader.loadServiceIndex()).resolves.toEqual(new Map<string, SparqlClient>())
        })
      })

      describe("to invalid json file", () => {
        const filePath = join(dirname, "assets/services-invalid.json")
        it("should return empty index", async () => {
          process.env.SERVICES_FILE = filePath
          return expect(ConfigLoader.loadServiceIndex()).resolves.toEqual(new Map<string, SparqlClient>())
        })
      })
      describe("to a single service file", () => {
        const filePath = join(dirname, "assets/services.json")

        const expected = new Map<string, SparqlClient>([
          ["test", new SparqlClient({
            endpointUrl: "http://dbpedia.org/sparql/",
            user: "user",
            password: "pass",
          })]
        ])

        it("should return an index with one SparqlClient", async () => {
          process.env.SERVICES_FILE = filePath
          return expect(ConfigLoader.loadServiceIndex()).resolves.toEqual(expected)
        })
      })

      describe("to json file with token", () => {
        const filePath = join(dirname, "assets/services-token.json")

        const expected = new Map<string, SparqlClient>([
          ["test", new SparqlClient({
            endpointUrl: "http://dbpedia.org/sparql/",
            headers: {
              'Authorization': 'Bearer thisisatoken'
            }
          })]
        ])

        it("should return an index with one SparqlClient", async () => {
          process.env.SERVICES_FILE = filePath
          return expect(ConfigLoader.loadServiceIndex()).resolves.toEqual(expected)
        })
      })
    })

    describe("with service set as env variable", () => {
      const expected = new Map<string, SparqlClient>([
        ["test", new SparqlClient({
          endpointUrl: "http://dbpedia.org/sparql/",
          user: "user",
          password: "pass",
        })]
      ])

      it("should return an index with one SparqlClient", async () => {
        process.env.GRASP_test_url = "http://dbpedia.org/sparql/"
        process.env.GRASP_test_user = "user"
        process.env.GRASP_test_password = "pass"
        return expect(ConfigLoader.loadServiceIndex()).resolves.toEqual(expected)
      })
    })

    describe("with both service as env variable and SERVICES_FILE set", () => {
      const filePath = join(dirname, "assets/services.json")


      it("should return an index with two SparqlClients", async () => {
        const expected = new Map<string, SparqlClient>([
          ["test", new SparqlClient({
            endpointUrl: "http://dbpedia.org/sparql/",
            user: "user",
            password: "pass",
          })],
          ["test2", new SparqlClient({
            endpointUrl: "http://dbpedia.org/sparql/",
            user: "user",
            password: "pass",
          })]
        ])

        process.env.SERVICES_FILE = filePath
        process.env.GRASP_test2_url = "http://dbpedia.org/sparql/"
        process.env.GRASP_test2_user = "user"
        process.env.GRASP_test2_password = "pass"
        return expect(ConfigLoader.loadServiceIndex()).resolves.toEqual(expected)
      })

      it("should overwrite file entries", async () => {
        const expected = new Map<string, SparqlClient>([
          ["test", new SparqlClient({
            endpointUrl: "http://dbpedia.org/sparql/",
            user: "user2",
            password: "pass2",
          })]
        ])

        process.env.SERVICES_FILE = filePath
        process.env.GRASP_test_user = "user2"
        process.env.GRASP_test_password = "pass2"
        return expect(ConfigLoader.loadServiceIndex()).resolves.toEqual(expected)
      })
    })
  })
  describe("loadTemplateIndexFromDirectory", () => {
    describe("with empty string", () => {
      it("should throw", async () => {
        return expect(ConfigLoader.loadTemplateIndexFromDirectory("")).rejects.toThrow()
      })
    })
    describe("with empty directory", () => {
      const dirPath = join(dirname, "assets/resources-empty")
      it("should return empty index", async () => {
        return expect(ConfigLoader.loadTemplateIndexFromDirectory(dirPath)).resolves.toEqual(new Map<string, string>())
      })
    })
    describe("with non empty directory", () => {
      const dirPath = join(dirname, "assets/resources-template")
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
        return expect(ConfigLoader.loadTemplateIndexFromDirectory(dirPath)).resolves.toEqual(expected)
      })
    })
  })
})
