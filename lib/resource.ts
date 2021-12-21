import Handlebars from "./handlebars-template";
import type { Quad } from "@rdfjs/types";
import groupBy from "lodash.groupby";
import transform from "lodash.transform";
import { ObjectTypeDefinitionNode } from "graphql";

import Resources from "./resources";
import {
  oneOrMany,
  isListType,
  unwrapCompositeType,
  hasDirective,
  getDirective,
  getDirectiveArgumentValue,
} from "./utils";
import SparqlClient from "sparql-http-client";
import NodeCache from "node-cache";

type CompiledTemplate = (args: object) => string;
export type ResourceEntry = Record<string, any>;

const NS_REGEX = /^https:\/\/github\.com\/dbcls\/grasp\/ns\//;

const handlebars = Handlebars();
const cache = new NodeCache({ stdTTL: 100, checkperiod: 120 });

function buildEntry(
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
      // If property is not yet in the record accumulator, then initialise with empty array
      // Push object value into array
      (acc[k] || (acc[k] = [])).push(object.value);
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

  return entry;
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
    let endpoint: string | undefined,
      sparql: string | undefined;

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
            sparql = ""
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
    }

    // If the sparql key is in the template index, use that template
    if (templateIndex && sparql) {
      const template = templateIndex.get(sparql);
      if (template) {
        sparql = template;
      } else {
        console.log(
          `query for type ${def.name.value} is not in template definitions; interpreting as SPARQL query.`
        );
      }
    }

    if (!serviceIndex || !serviceIndex.has(endpoint)) {
      console.log(
        `Endpoint '${endpoint}' for type ${def.name.value} is not in service definitions; trying as url.`
      );
      const sparqlClient = new SparqlClient({ endpointUrl: endpoint });
      return new Resource(resources, def, sparqlClient, sparql);
    }

    const sparqlClient = serviceIndex.get(endpoint);

    if (!sparqlClient) {
      throw new Error(
        `invalid endpoint ${endpoint} for type ${def.name.value}`
      );
    }
    return new Resource(resources, def, sparqlClient, sparql);
  }

  /**
   * Fetch the SPARQL bindings for the GraphQL Type and group the result by subject
   * @param args
   * @returns
   */
  async fetch(args: object): Promise<ResourceEntry[]> {
    const bindings = await this.query(args);
    const bindingGroupedBySubject = groupBy(
      bindings,
      (binding) => binding.subject.value
    );

    // Remove BlankNodes from primary bindings
    // TODO: check whether this simply removes all results with blanknodes
    const primaryBindings = bindings.filter(
      (binding) => binding.subject.termType !== "BlankNode"
    );

    // Group the primaryBindings by subject value
    const primaryBindingsGroupedBySubject = groupBy(
      primaryBindings,
      (binding) => binding.subject.value
    );
    // Collect the final list of entries from primaryBindings
    const entries = Object.entries(primaryBindingsGroupedBySubject).map(
      ([subject, _sBindings]) => {
        return buildEntry(
          bindingGroupedBySubject,
          subject,
          this,
          this.resources
        );
      }
    );

    return entries;
  }

  /**
   * Fetch the SPARQL bindings for the GraphQL Type based on a list of IRIs and construct the result
   * @param iris
   * @returns
   */
  async fetchByIRIs(
    iris: ReadonlyArray<string>
  ): Promise<Array<ResourceEntry | null>> {
    const entries = await this.fetch({ iri: iris });
    return iris.map(
      (iri) => entries.find((entry) => entry.iri === iri) || null
    );
  }

  /**
   * Execute SPARQL query from query handlebars template
   * @param args Arguments for handlebars templa
   * @returns
   */
  async query(args: object): Promise<Quad[]> {
    if (!this.queryTemplate || !this.sparqlClient) {
      throw new Error(
        "query template and endpoint should be specified in order to query"
      );
    }
    const sparqlQuery = this.queryTemplate(args);

    const quads: Quad[] | undefined = cache.get(sparqlQuery);
    if (quads != undefined) {
      console.log("--- SPARQL QUERY (from cache) ---\n", sparqlQuery);
      return quads;
    }

    console.log("--- SPARQL QUERY ---\n", sparqlQuery);

    const stream = await this.sparqlClient.query.construct(sparqlQuery, {
      operation: "postUrlencoded",
    });

    return new Promise((resolve) => {
      const quads: Quad[] = [];
      stream.on("data", (q: Quad) => quads.push(q));
      stream.on("end", () => {
        // TODO: cache
        const success = cache.set(sparqlQuery, quads);
        resolve(quads);
      });
      stream.on("error", (err: any) => {
        throw new Error(`SPARQL endpoint returns: ${err}`);
      });
    });
  }

  get isRootType(): boolean {
    return !this.definition.directives?.some(
      (directive) => directive.name.value === "embedded"
    );
  }

  get isEmbeddedType(): boolean {
    return !this.isRootType;
  }
}
