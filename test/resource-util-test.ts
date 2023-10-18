import {
    buildEntry
} from "../lib/resource-util.js"

import {
    getTestResource,
    getTestResources,
} from "./test-helpers.js"
import type { Quad } from "@rdfjs/types"
// @ts-ignore
import quad from "rdf-quad"

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