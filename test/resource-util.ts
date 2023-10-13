import {
    buildEntry,
    fetchResultsUntilThreshold
} from "../lib/resource-util.js"

import {
    getTestResource,
    getTestResources,
    getTestSparqlClient,
} from "./test-helpers.js"
import type { Quad } from "@rdfjs/types"
// @ts-ignore
import quad from "rdf-quad"


describe("fetchResultsUntilThreshold", () => {

    const subject = "http://example.org/subject1"
    const subject2 = "http://example.org/subject2"

    const triples = [
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
    ]
    const threshold = 5
    const sparqlClient = getTestSparqlClient(triples, threshold)

    it("should not throw", async () => {
        await expect(await fetchResultsUntilThreshold(sparqlClient, "SELECT * WHERE { ?s ?p ?o }", threshold)).resolves.not.toThrow()
    })

    it("should return stream", done => {
        const actual: Array<Quad> = []
        fetchResultsUntilThreshold(sparqlClient, "SELECT * WHERE { ?s ?p ?o }", threshold)
        .then(bindingsStream => {
            bindingsStream.on('data', (q: Quad) => {
                actual.push(q)
            })
            bindingsStream.on('end', () => {
                console.log(triples)
                expect(actual.length).toEqual(triples.length)
                done()
            })
        })
    })
})

describe("buildEntry", () => {
    describe("called with values", () => {
        const subject = "http://example.org/subject"
        const bindingGroupedBySubject: Record<string, Quad[]> = {
            [subject]: [
                quad(subject, "https://github.com/dbcls/grasp/ns/iri", subject),
                quad(subject, "https://github.com/dbcls/grasp/ns/id", '"subject"'),
            ],
        }
        const res = getTestResource("assets/with-docs.graphql")
        const resources = getTestResources(res)

        it("should return ResourceEntry", () => {
            return expect(
                buildEntry(bindingGroupedBySubject, subject, res, resources)
            ).toStrictEqual({
                iri: subject,
                id: "subject",
            })
        })
    })

    describe("called without iri", () => {
        const subject = "http://example.org/subject"
        const bindingGroupedBySubject: Record<string, Quad[]> = {
            [subject]: [
                quad(subject, "https://github.com/dbcls/grasp/ns/test1", '"Test"'),
                quad(subject, "https://github.com/dbcls/grasp/ns/test2", "http://example.org/X"),
                quad(subject, "https://github.com/dbcls/grasp/ns/test3", "http://example.org/Y")
            ],
        }
        const res = getTestResource("assets/with-docs.graphql")
        const resources = getTestResources(res)

        it("should return ResourceEntry", () => {
            return expect(
                buildEntry(bindingGroupedBySubject, subject, res, resources)
            ).toStrictEqual({
                iri: subject,
                id: undefined,
            })
        })
    })

    describe("called with embedded type", () => {
        const subject = "http://example.org/subject"
        const publisher = "http://example.org/publisher"
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
        }
        const res = getTestResource("assets/with-embedded.graphql")
        const emRes = getTestResource(
            "assets/with-embedded.graphql",
            "Publisher"
        )
        const resources = {
            all: [res, emRes],
            root: [res],
            isUserDefined: () => true,
            lookup: (name: string) => {
                switch (name) {
                    case "Publisher":
                        return emRes
                    case "Test":
                    default:
                        return res
                }
            },
        }

        it("should return ResourceEntry for embedded type", () => {
            return expect(
                buildEntry(bindingGroupedBySubject, publisher, emRes, resources)
            ).toStrictEqual({
                iri: publisher,
                name_en: "name_en",
                name_ja: "name_ja",
                page: "publisher_page",
            })
        })

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
            })
        })
    })

    describe("called with blanknode embedded type", () => {
        const subject = "http://example.org/subject"
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
        }
        const res = getTestResource("assets/with-embedded.graphql")
        const emRes = getTestResource(
            "assets/with-embedded.graphql",
            "Publisher"
        )
        const resources = {
            all: [res, emRes],
            root: [res],
            isUserDefined: () => true,
            lookup: (name: string) => {
                switch (name) {
                    case "Publisher":
                        return emRes
                    case "Test":
                    default:
                        return res
                }
            },
        }

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
            })
        })
    })
})