import Handlebars from "handlebars";
import type { Quad } from "@rdfjs/types"
import groupBy from "lodash.groupby";
import mapValues from "lodash.mapvalues";
import transform from "lodash.transform";
import { ObjectTypeDefinitionNode } from "graphql";
import { URLSearchParams } from "url";

import Resources from "./resources";
import {
  oneOrMany,
  isListType,
  unwrapCompositeType,
  ensureArray,
} from "./utils";
import * as SparqlClient from "sparql-http-client";

type CompiledTemplate = (args: object) => string;
export type ResourceEntry = Record<string, any>;

const handlebars = Handlebars.create();

handlebars.registerHelper(
  "join",
  function (separator: string, strs: string | string[]): string {
    return ensureArray(strs).join(separator);
  }
);

handlebars.registerHelper(
  "as-iriref",
  function (strs: string | string[]): string[] {
    return ensureArray(strs).map((str) => `<${str}>`);
  }
);

handlebars.registerHelper(
  "as-string",
  function (strs: string | string[]): string[] {
    return ensureArray(strs).map((str) => `"${str}"`);
  }
);

function buildEntry(
  bindingsGroupedBySubject: Record<string, Array<Quad>>,
  subject: string,
  resource: Resource,
  resources: Resources
): ResourceEntry {
  const entry: ResourceEntry = {};

  const pValues = transform(
    bindingsGroupedBySubject[subject],
    (acc, { predicate, object }: Quad) => {
      const k = predicate.value.replace(/^https:\/\/github\.com\/dbcls\/grasp\/ns\//, "");

      (acc[k] || (acc[k] = [])).push(object.value);
    },
    {} as Record<string, string[]>
  );

  (resource.definition.fields || []).forEach((field) => {
    const type = field.type;
    const name = field.name.value;
    const values = pValues[name] || [];

    const targetType = unwrapCompositeType(type);
    const targetResource = resources.lookup(targetType.name.value);

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
  endpoint: string | null;
  queryTemplate: CompiledTemplate | null;

  constructor(
    resources: Resources,
    definition: ObjectTypeDefinitionNode,
    endpoint: string | null,
    sparql: string | null
  ) {
    this.resources = resources;
    this.definition = definition;
    this.endpoint = endpoint;
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
    def: ObjectTypeDefinitionNode
  ): Resource {
    
    if (
      def.directives?.some((directive) => directive.name.value === "embedded")
    ) {
      //TODO: check out bug with embedded directive
      return new Resource(resources, def, null, null);
    }

    if (!def.description) {
      throw new Error(`description for type ${def.name.value} is not defined`);
    }
    const description = def.description.value;
    const lines = description.split(/\r?\n/);

    let endpoint: string | null = null,
      sparql = "";

    enum State {
      Default,
      Endpoint,
      Sparql,
    }
    let state: State = State.Default;

    lines.forEach((line: string) => {
      switch (line) {
        case "--- endpoint ---":
          state = State.Endpoint;
          return;
        case "--- sparql ---":
          state = State.Sparql;
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
    return new Resource(resources, def, endpoint, sparql);
  }

  async fetch(args: object): Promise<ResourceEntry[]> {
    const bindings = await this.query(args);

    const bindingGroupedBySubject = groupBy(bindings, "subject");
    const primaryBindings = bindings.filter(
      (binding) => binding.subject.termType !== "BlankNode"
    );

    const entries = Object.entries(groupBy(primaryBindings, "subject")).map(
      ([subject, _sBindings]) => {
        return buildEntry(bindingGroupedBySubject, subject, this, this.resources);
      }
    );

    return entries;
  }

  async fetchByIRIs(
    iris: ReadonlyArray<string>
  ): Promise<Array<ResourceEntry | null>> {
    const entries = await this.fetch({ iri: iris });
    return iris.map(
      (iri) => entries.find((entry) => entry.iri === iri) || null
    );
  }

  async query(args: object): Promise<Array<Quad>> {
    if (!this.queryTemplate || !this.endpoint) {
      throw new Error(
        "query template and endpoint should be specified in order to query"
      );
    }
    const sparqlQuery = this.queryTemplate(args);

    console.log("--- SPARQL QUERY ---\n", sparqlQuery);

    // TODO: support authentication
    const username = 'admin'
    const password = 'admin'

    const client = new SparqlClient({ endpointUrl: this.endpoint })
    const stream = await client.query.construct(sparqlQuery, 
      {
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${username}:${password}`, 'binary').toString('base64'),
        },
        operation: 'postUrlencoded'
      })

    return new Promise((resolve, reject) => {
      const quads: Array<Quad> = [];
      stream.on('data', (q: Quad) => quads.push(q))
      stream.on('end', () => resolve(quads));
      stream.on('error', (err: any) => {
        throw new Error(
          `SPARQL endpoint returns: ${err}`
        );
      })
    })
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
