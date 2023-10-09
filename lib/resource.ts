import Handlebars from "handlebars";
import type { Quad, Stream } from "@rdfjs/types";
import { getTermRaw } from "rdf-literal";
import transform from "lodash/transform.js";
import { ObjectTypeDefinitionNode } from "graphql";

import Resources from "./resources.js";
import {
  oneOrMany,
  isListType,
  unwrapCompositeType,
  hasDirective,
  getDirective,
  getDirectiveArgumentValue,
  join,
  ntriplesIri,
  ntriplesLiteral,
} from "./utils.js";
import SparqlClient from "sparql-http-client";
import { LRUCache } from "lru-cache";
import logger from "./logger.js";
import { Dictionary } from "lodash";
import internal, { Readable } from "stream"
import { query } from 'express'

type CompiledTemplate = (args: object) => string;
export type ResourceEntry = Record<string, any>;

const NS_REGEX = /^https:\/\/github\.com\/dbcls\/grasp\/ns\//;
const DEFAULT_TTL = 1000 * 60 * 1;

// Create handlebars compiler
const handlebars = Handlebars.create();
handlebars.registerHelper("join", join);
handlebars.registerHelper("as-iriref", ntriplesIri);
handlebars.registerHelper("as-string", ntriplesLiteral);

// Create data cache
const options = {
  max: parseInt(process.env.CACHE_SIZE || "20", 10),
  ttl: parseInt(process.env.CACHE_TTL || `${DEFAULT_TTL}`, 10),
};

const cache = new LRUCache<string, ResourceEntry[]>(options);

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

export default class Resource {
  resources: Resources;
  definition: ObjectTypeDefinitionNode;
  sparqlClient?: SparqlClient;
  queryTemplate: CompiledTemplate | null;

  constructor(
    resources: Resources,
    definition: ObjectTypeDefinitionNode,
    sparqlClient?: SparqlClient,
    sparql?: string
  ) {
    this.resources = resources;
    this.definition = definition;
    this.sparqlClient = sparqlClient;
    this.queryTemplate = sparql
      ? handlebars.compile(sparql, { noEscape: true })
      : null;
  }

  /**
   * Construct a resource using a TypeDefinition object
   *
   * @param resources
   * @param def
   * @returns
   */
  static buildFromTypeDefinition(
    resources: Resources,
    def: ObjectTypeDefinitionNode,
    serviceIndex?: Map<string, SparqlClient>,
    templateIndex?: Map<string, string>
  ): Resource {
    // Check whether Type definition has directive
    if (hasDirective(def, "embedded")) {
      //TODO: check out bug with embedded directive
      return new Resource(resources, def);
    }

    // Check wether type has a grasp directive
    // Find grasp directive
    let endpoint: string | undefined, sparql: string | undefined;

    const graspDirective = getDirective(def, "grasp");
    if (graspDirective) {
      endpoint = getDirectiveArgumentValue(graspDirective, "endpoint");
      if (!endpoint) {
        throw new Error(
          `argument 'endpoint' is not defined in grasp directive for type ${def.name.value}`
        );
      }

      sparql = getDirectiveArgumentValue(graspDirective, "sparql");
      if (!sparql) {
        throw new Error(
          `argument 'sparql' is not defined in grasp directive for type ${def.name.value}`
        );
      }
    } else {
      // Check whether the type description has a good description
      if (!def.description) {
        throw new Error(
          `description for type ${def.name.value} is not defined`
        );
      }
      // Extract description as string
      const description = def.description.value;
      const lines = description.split(/\r?\n/);

      enum State {
        Default,
        Endpoint,
        Sparql,
      }
      let state: State = State.Default;

      // Split lines in type definition
      lines.forEach((line: string) => {
        switch (line) {
          case "--- endpoint ---":
            state = State.Endpoint;
            return;
          case "--- sparql ---":
            state = State.Sparql;
            sparql = "";
            return;
        }

        switch (state) {
          case State.Endpoint:
            endpoint = line;
            state = State.Default;
            break;
          case State.Sparql:
            sparql += line + "\n";
            break;
        }
      });

      if (!endpoint) {
        throw new Error(`endpoint is not defined for type ${def.name.value}`);
      }

      if (!sparql) {
        throw new Error(
          `sparql query is not defined for type ${def.name.value}`
        );
      }
    }

    // If the sparql key is in the template index, use that template
    if (templateIndex && sparql) {
      const template = templateIndex.get(sparql);
      if (template) {
        sparql = template;
      } else {
        logger.info(
          `query for type ${def.name.value} is not in template definitions; interpreting as SPARQL query.`
        );
      }
    }

    if (!serviceIndex || !serviceIndex.has(endpoint)) {
      logger.info(
        `Endpoint '${endpoint}' for type ${def.name.value} is not in service definitions; trying as url.`
      );
      const sparqlClient = new SparqlClient({ endpointUrl: endpoint });
      return new Resource(resources, def, sparqlClient, sparql);
    }
    // sparql client cannot be undefined now
    const sparqlClient = serviceIndex.get(endpoint);
    return new Resource(resources, def, sparqlClient, sparql);
  }

  /**
   * Fetch the SPARQL bindings for the GraphQL Type and group the result by subject
   * @param args
   * @returns
   */
  async fetch(args: object, opts?:{proxyHeaders?:{[key:string]:string}}): Promise<ResourceEntry[]> {
    if (!this.queryTemplate || !this.sparqlClient) {
      throw new Error(
        "query template and endpoint should be specified in order to query"
      );
    }
    const sparqlQuery = this.queryTemplate(args);

    let entries: ResourceEntry[] | undefined = cache.get(sparqlQuery);
    logger.info(
      {
        cache: entries !== undefined,
        query: sparqlQuery,
        endpointUrl: this.sparqlClient.store.endpoint.endpointUrl,
      },
      "SPARQL query sent to endpoint."
    );
    if (entries !== undefined) {
      return entries;
    }

    try {
      const bindingsStream = await fetchResultsUntilThreshold(
        this.sparqlClient,
        sparqlQuery, 
        5,
        {
          operation: "postUrlencoded",
          headers: opts?.proxyHeaders
        }
      )

      const { bindingsGroupedBySubject, primaryBindingsGroupedBySubject } =
        await groupBindingsStream(bindingsStream);

      // Collect the final list of entries from primaryBindings
      entries = Object.entries(primaryBindingsGroupedBySubject).map(
        ([subject, _sBindings]) => {
          return buildEntry(
            bindingsGroupedBySubject,
            subject,
            this,
            this.resources
          );
        }
      );
      cache.set(sparqlQuery, entries);
          logger.info(
            { cached: true, triples: Object.entries(primaryBindingsGroupedBySubject).length },
            "SPARQL query successfully answered."
          );
      
      return entries;

    } catch (err) {
      logger.error(err, sparqlQuery);
      throw new Error(`SPARQL endpoint returns: ${err}`);
    }
  }

  /**
   * Fetch the SPARQL bindings for the GraphQL Type based on a list of IRIs and construct the result
   * @param iris
   * @returns
   */
  async fetchByIRIs(
    iris: ReadonlyArray<string>,
    opts?:{proxyHeaders?:{[key:string]:string}}
  ): Promise<Array<ResourceEntry | null>> {
    const entries = await this.fetch({ iri: iris }, opts);
    // join entries
    const entryMap = new Map(); // Create an object to store entries by their IRIs
  
    // Populate entryMap with entries
    entries.forEach((entry) => {
      entryMap.set(entry.iri, entry);
    });

    // Map IRIs to entries from entryMap or return null if not found
    return iris.map((iri) => entryMap.get(iri) || null);
  }

  get isRootType(): boolean {
    return !hasDirective(this.definition, "embedded");
  }

  get isEmbeddedType(): boolean {
    return !this.isRootType;
  }
}
