import type { Quad, Stream } from "@rdfjs/types";
import { getTermRaw } from "rdf-literal";
import transform from "lodash/transform.js";

import Resources from "./resources.js";
import {
  oneOrMany,
  isListType,
  unwrapCompositeType,
} from "./utils.js";
import SparqlClient from "sparql-http-client";
import { Dictionary } from "lodash";
import internal, { Readable } from "stream"
import Resource, { ResourceEntry } from './resource.js'

const NS_REGEX = /^https:\/\/github\.com\/dbcls\/grasp\/ns\//;

export function buildEntry(
    bindingsGroupedBySubject: Record<string, Quad[]>,
    subject: string,
    resource: Resource,
    resources: Resources
  ): ResourceEntry {
    const entry: ResourceEntry = {};
  
    // Turn the resulting Quads into records
    const pValues = transform(
      bindingsGroupedBySubject[subject],
      (acc, { predicate, object }: Quad) => {
        // Extract property name from URI
        const k = predicate.value.replace(NS_REGEX, "");
  
        // Converts any RDF term to a JavaScript primitive.
        const v: any = getTermRaw(object);
  
        // If property is not yet in the record accumulator, then initialise with empty array
        // Push object value into array
        (acc[k] || (acc[k] = [])).push(v);
      },
      {} as Record<string, string[]>
    );
  
    // Resolve any non-scalar types
    (resource.definition.fields || []).forEach((field) => {
      const type = field.type;
      const name = field.name.value;
      const values = pValues[name] || [];
  
      // Get the type
      const targetType = unwrapCompositeType(type);
      // Find the corresponding resource
      const targetResource = resources.lookup(targetType.name.value);
  
      // If the resource is embedded, build entries from exiting bindings
      if (targetResource?.isEmbeddedType) {
        const entries = values.map((nodeId) =>
          buildEntry(bindingsGroupedBySubject, nodeId, targetResource, resources)
        );
        entry[name] = oneOrMany(entries, !isListType(type));
      } else {
        entry[name] = oneOrMany(values, !isListType(type));
      }
    });
  
    // Make sure entries always have an iri
    if (!entry.iri)
      entry.iri = subject
    return entry;
  }
  
  export async function groupBindingsStream(stream: Stream<Quad>): Promise<{
    bindingsGroupedBySubject: Dictionary<Quad[]>;
    primaryBindingsGroupedBySubject: Dictionary<Quad[]>;
  }> {
    return new Promise((resolve) => {
      const bindingsGroupedBySubject: Dictionary<Quad[]> = {};
      const primaryBindingsGroupedBySubject: Dictionary<Quad[]> = {};
  
      stream.on("data", (binding: Quad) => {
        // Group all bindings by subject
        bindingsGroupedBySubject[binding.subject.value] =
          bindingsGroupedBySubject[binding.subject.value] || [];
        bindingsGroupedBySubject[binding.subject.value].push(binding);
        // Remove BlankNodes from bindings
        if (binding.subject.termType !== "BlankNode") {
          // Group the primaryBindings by subject value
          primaryBindingsGroupedBySubject[binding.subject.value] =
            primaryBindingsGroupedBySubject[binding.subject.value] || [];
          primaryBindingsGroupedBySubject[binding.subject.value].push(binding);
        }
      });
      stream.on("end", () => {
        resolve({
          bindingsGroupedBySubject,
          primaryBindingsGroupedBySubject,
        });
      });
      stream.on("error", (err: any) => {
        throw new Error(`Cannot process SPARQL endpoint results: ${err}`);
      });
    });
  }
  
  export async function fetchResultsUntilThreshold(
    sparqlClient: SparqlClient,
    sparqlQuery: string,
    threshold: number, options?: SparqlClient.QueryOptions
  ): Promise<Stream<Quad> & internal.Readable> {
    // If the threshold is 0 or lower, just execute the query without paging
    if (threshold <= 0) {
      return sparqlClient.query.construct(
        sparqlQuery,
          options
      )
    }
    return new Readable({
        objectMode: true,
        async read() {
            const self = this
            async function fetchBindings(sparqlClient: SparqlClient,
                pagedQuery: string,
                offset: number = 0) {
  
                // Fetch all bindings
                const bindingsStream = await sparqlClient.query.construct(
                  pagedQuery,
                    options
                )
  
                let count = 0
                bindingsStream.on('data', (q: Quad) => {
                    self.push(q)
                    count++
                })
                bindingsStream.on('end', () => {
                    if (count === threshold) {
                        // Emit new results
                        offset += threshold
                        // Alter query
                        const alteredQuery = `${sparqlQuery} 
                        OFFSET ${offset}
                        LIMIT ${threshold}`
                        
                        // Repeat the process
                        fetchBindings(sparqlClient, alteredQuery, offset)
                    } else {
                      // If fewer than threshold results are returned, end the stream
                      self.push(null)
                    }
                })
  
            }
  
            // Implement the logic to fetch and emit results here
            try {
                fetchBindings(sparqlClient, sparqlQuery)
            } catch (error) {
                this.emit("error", error)
            }
        },
    })
  }