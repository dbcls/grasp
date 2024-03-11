import {
    buildEntry,
    fetchBindingsUntilThreshold
} from "../lib/resource-util.js"

import {
    getTestResource,
    getTestResourceIndex,
    getTestPagedSparqlClient,
    getTestErrorSparqlClient
} from "./test-helpers.js"
import type { Quad } from "@rdfjs/types"
import { DataFactory } from "rdf-data-factory"; 
import "jest-rdf";

const factory = new DataFactory();

describe("fetchResultsUntilThreshold", () => {

    const subject = factory.namedNode("http://example.org/subject1")
    const subject2 = factory.namedNode("http://example.org/subject2")
    const urn = factory.namedNode("urn:test:b1")

    const triples = [
        factory.quad(subject, factory.namedNode("https://github.com/dbcls/grasp/ns/iri"), subject),
        factory.quad(subject, factory.namedNode("https://github.com/dbcls/grasp/ns/id"), factory.literal("subject1")),
        factory.quad(subject, factory.namedNode("https://github.com/dbcls/grasp/ns/count"), factory.literal("5", factory.namedNode('http://www.w3.org/2001/XMLSchema#integer'))),
        factory.quad(subject, factory.namedNode("https://github.com/dbcls/grasp/ns/test"), factory.literal("true", factory.namedNode('http://www.w3.org/2001/XMLSchema#boolean'))),
        factory.quad(subject, factory.namedNode("https://github.com/dbcls/grasp/ns/obsolete"), factory.literal("obsolete")),
        factory.quad(subject2, factory.namedNode("https://github.com/dbcls/grasp/ns/iri"), subject2),
        factory.quad(subject2, factory.namedNode("https://github.com/dbcls/grasp/ns/id"), factory.literal("subject2")),
        factory.quad(subject2, factory.namedNode("https://github.com/dbcls/grasp/ns/count"), factory.literal("4", factory.namedNode('http://www.w3.org/2001/XMLSchema#integer'))),
        factory.quad(subject2, factory.namedNode("https://github.com/dbcls/grasp/ns/test"), factory.literal("false", factory.namedNode('http://www.w3.org/2001/XMLSchema#boolean'))),
        factory.quad(urn, factory.namedNode("https://github.com/dbcls/grasp/ns/iri"), subject),
        factory.quad(urn, factory.namedNode("https://github.com/dbcls/grasp/ns/id"), factory.literal("subject")),
    ]
    const threshold = 5
    const sparqlClient = getTestPagedSparqlClient("assets/responses/fetch")

    

    it("should not throw", async () => {
        await expect(fetchBindingsUntilThreshold(sparqlClient, "SELECT * WHERE { ?s ?p ?o }", threshold)).resolves.not.toThrow()
    })

    describe("when threshold matches triple count", () => {
        it("should return stream with correct number of triples", done => {
            const actual: Array<Quad> = []
            fetchBindingsUntilThreshold(sparqlClient, "SELECT * WHERE { ?s ?p ?o }", threshold)
            .then(bindingsStream => {
                bindingsStream.on('data', (q: Quad) => {
                    actual.push(q)
                })
                bindingsStream.on('end', () => {
                    expect(actual.length).toEqual(triples.length)
                    done()
                })
            })
        })

        it("should return stream with correct triples", done => {
            const actual: Array<Quad> = []
            fetchBindingsUntilThreshold(sparqlClient, "SELECT * WHERE { ?s ?p ?o }", threshold)
            .then(bindingsStream => {
                bindingsStream.on('data', (q: Quad) => {
                    actual.push(q)
                })
                bindingsStream.on('end', () => {
                    expect(actual).toBeRdfIsomorphic(triples)
                    done()
                })
            })
        })
    })

    describe("when threshold is higher than triple count", () => {

        it("should return the correct number of triples", done => {
            const actual: Array<Quad> = []
            fetchBindingsUntilThreshold(sparqlClient, "SELECT * WHERE { ?s ?p ?o }", threshold + 1)
            .then(bindingsStream => {
                bindingsStream.on('data', (q: Quad) => {
                    actual.push(q)
                })
                bindingsStream.on('end', () => {
                    expect(actual.length).toEqual(threshold)
                    done()
                })
            })
        })
    })

    describe("when endpoint returns error", () => {
        const sparqlClient = getTestErrorSparqlClient();
        
        it("sparqlclient should produce error", async () => {
            expect.assertions(1);
            try {
                await sparqlClient.query.construct('CONSTRUCT { ?s ?p ?o }')
            } catch (error) {
                expect((error as Error).message).toMatch(" (401): ");
            }
        })
        
        it("should produce error event with no threshold", done => {
            expect.assertions(1);
            fetchBindingsUntilThreshold(sparqlClient, "CONSTRUCT { ?s ?p ?o }", 0)
            .then(bindingsStream => {
                bindingsStream.on('error', (e) => {
                    expect((e as Error).message).toMatch(" (401): ");
                    done()
                })
            })
        })

        it("should produce error event with threshold", done => {
            expect.assertions(1);
            fetchBindingsUntilThreshold(sparqlClient, "CONSTRUCT { ?s ?p ?o }", 1)
            .then(bindingsStream => {
                bindingsStream.on('error', (e) => {
                    expect((e as Error).message).toMatch(" (401): ");
                    done()
                })
            })
        })
    })
})

describe("buildEntry", () => {
    describe("called with values", () => {
        const subject = factory.namedNode("http://example.org/subject")
        const bindingGroupedBySubject: Record<string, Quad[]> = {
            [subject.value]: [
                factory.quad(subject, factory.namedNode("https://github.com/dbcls/grasp/ns/iri"), subject),
                factory.quad(subject, factory.namedNode("https://github.com/dbcls/grasp/ns/id"), factory.literal("subject")),
            ],
        }
        const res = getTestResource("assets/with-docs.graphql")
        const resources = getTestResourceIndex(res)

        it("should return ResourceEntry", () => {
            return expect(
                buildEntry(bindingGroupedBySubject, subject.value, res, resources)
            ).toStrictEqual({
                __typename: "Test",
                iri: subject.value,
                id: "subject",
            })
        })
    })

    describe("called without iri", () => {
        const subject = factory.namedNode("http://example.org/subject")
        const bindingGroupedBySubject: Record<string, Quad[]> = {
            [subject.value]: [
                factory.quad(subject, factory.namedNode("https://github.com/dbcls/grasp/ns/test1"), factory.literal("Test")),
                factory.quad(subject, factory.namedNode("https://github.com/dbcls/grasp/ns/test2"), factory.namedNode("http://example.org/X")),
                factory.quad(subject, factory.namedNode("https://github.com/dbcls/grasp/ns/test3"), factory.namedNode("http://example.org/Y"))
            ],
        }
        const res = getTestResource("assets/with-docs.graphql")
        const resources = getTestResourceIndex(res)

        it("should return ResourceEntry", () => {
            return expect(
                buildEntry(bindingGroupedBySubject, subject.value, res, resources)
            ).toStrictEqual({
                __typename: "Test",
                iri: subject.value,
                id: undefined,
            })
        })
    })

    describe("called with embedded type", () => {
        const subject = factory.namedNode("http://example.org/subject")
        const publisher = factory.namedNode("http://example.org/publisher")
        const bindingGroupedBySubject: Record<string, Quad[]> = {
            [subject.value]: [
                factory.quad(subject, factory.namedNode("https://github.com/dbcls/grasp/ns/iri"), subject),
                factory.quad(
                    subject,
                    factory.namedNode("https://github.com/dbcls/grasp/ns/publisher"),
                    publisher
                ),
            ],
            [publisher.value]: [
                factory.quad(
                    publisher,
                    factory.namedNode("https://github.com/dbcls/grasp/ns/name_ja"),
                    factory.literal("name_ja")
                ),
                factory.quad(
                    publisher,
                    factory.namedNode("https://github.com/dbcls/grasp/ns/name_en"),
                    factory.literal("name_en")
                ),
                factory.quad(
                    publisher,
                    factory.namedNode("https://github.com/dbcls/grasp/ns/page"),
                    factory.literal("publisher_page")
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
                buildEntry(bindingGroupedBySubject, publisher.value, emRes, resources)
            ).toStrictEqual({
                __typename: "Publisher",
                iri: publisher.value,
                name_en: "name_en",
                name_ja: "name_ja",
                page: "publisher_page",
            })
        })

        it("should return nested ResourceEntry for root type", () => {
            return expect(
                buildEntry(bindingGroupedBySubject, subject.value, res, resources)
            ).toStrictEqual({
                __typename: "Test",
                iri: subject.value,
                publisher: {
                    __typename: "Publisher",
                    iri: publisher.value,
                    name_en: "name_en",
                    name_ja: "name_ja",
                    page: "publisher_page",
                },
            })
        })
    })

    describe("called with blanknode embedded type", () => {
        const subject = factory.namedNode("http://example.org/subject")
        const bnode = factory.blankNode('b1')
        const bindingGroupedBySubject: Record<string, Quad[]> = {
            [subject.value]: [
                factory.quad(subject, factory.namedNode("https://github.com/dbcls/grasp/ns/iri"), subject),
                factory.quad(
                    subject,
                    factory.namedNode("https://github.com/dbcls/grasp/ns/publisher"),
                    bnode
                ),
            ],
            ['b1']: [
                factory.quad(
                    bnode,
                    factory.namedNode("https://github.com/dbcls/grasp/ns/name_ja"),
                    factory.literal("name_ja")
                ),
                factory.quad(
                    bnode,
                    factory.namedNode("https://github.com/dbcls/grasp/ns/name_en"),
                    factory.literal("name_en")
                ),
                factory.quad(
                    bnode,
                    factory.namedNode("https://github.com/dbcls/grasp/ns/page"),
                    factory.literal("publisher_page")
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
                buildEntry(bindingGroupedBySubject, subject.value, res, resources)
            ).toStrictEqual({
                __typename: "Test",
                iri: subject.value,
                publisher: {
                    __typename: "Publisher",
                    iri: "b1",
                    name_en: "name_en",
                    name_ja: "name_ja",
                    page: "publisher_page",
                },
            })
        })
    })
})