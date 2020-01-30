import Handlebars = require("handlebars");
import fetch from "node-fetch";
import groupBy = require('lodash.groupby');
import mapValues = require('lodash.mapvalues');
import { ApolloServer } from "apollo-server";
import { URLSearchParams } from "url";
import { parse } from "graphql/language/parser";
import { readFileSync } from "fs";

import { ObjectTypeDefinitionNode, TypeNode, NamedTypeNode, DefinitionNode, DocumentNode } from 'graphql';

type CompiledTemplate = (args: object) => string;
type Binding = Record<string, any>;
type ResourceEntry = Record<string, any>;
type ResourceResolver = (parent: ResourceEntry, args: object) => Promise<ResourceEntry | ResourceEntry[]>;

function unwrapCompositeType(type: TypeNode): NamedTypeNode {
  switch (type.kind) {
    case 'NamedType':
      return type;
    case 'ListType':
    case 'NonNullType':
      return unwrapCompositeType(type.type);
    default:
      throw new Error(`unsupported type: ${(type as TypeNode).kind}`);
  }
}

function isListType(type: TypeNode): boolean {
  switch (type.kind) {
    case 'NamedType':
      return false;
    case 'ListType':
      return true;
    case 'NonNullType':
      return isListType(type.type);
    default:
      throw new Error(`unsupported type: ${(type as TypeNode).kind}`);
  }
}

class Resource {
  definition: ObjectTypeDefinitionNode;
  endpoint: string;
  queryTemplate: CompiledTemplate;

  constructor(definition: ObjectTypeDefinitionNode, endpoint: string, sparql: string) {
    this.definition    = definition;
    this.endpoint      = endpoint;
    this.queryTemplate = Handlebars.compile(sparql, { noEscape: true });
  }

  static lookup(name: string): Resource {
    const resource = resources.find((resource: Resource) => resource.definition.name.value === name);

    if (!resource) {
      throw new Error(`resource ${name} not found`);
    }

    return resource;
  }

  static buildFromTypeDefinition(def: ObjectTypeDefinitionNode): Resource {
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
    };
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
      throw new Error("endpoint is not defined for type ${def.name.value}")

    }
    return new Resource(def, endpoint, sparql);
  }

  async fetch(args: object, one = false): Promise<ResourceEntry[] | ResourceEntry> {
    const bindings = await this.query(args);

    const entries = Object.entries(groupBy(bindings, 's')).map(([_s, sBindings]) => {
      const entry: ResourceEntry = {};
      const pValues = mapValues(groupBy(sBindings, 'p'), bs => bs.map(({o}) => o));

      (this.definition.fields || []).forEach(field => {
        const values = pValues[field.name.value];

        entry[field.name.value] = isListType(field.type) ? values : values[0];
      });

      return entry;
    });

    return one ? entries[0] : entries;
  }

  async query(args: object): Promise<Array<Binding>> {
    const sparqlQuery = this.queryTemplate(args);

    console.log('--- SPARQL QUERY ---', sparqlQuery);

    const sparqlParams = new URLSearchParams();
    sparqlParams.append("query", sparqlQuery);

    const opts = {
      method: "POST",
      body: sparqlParams,
      headers: {
        Accept: "application/sparql-results+json"
      }
    };
    const data = await fetch(this.endpoint, opts).then(res => res.json());
    console.log("--- SPARQL RESULT ---", JSON.stringify(data, null, "  "));

    return data.results.bindings.map((b: Binding) => {
      return mapValues(b, ({ value }) => value);
    });
  }
}

Handlebars.registerHelper('filter-by-iri', function(this: {iri: string | string[]}): string {
  if (Array.isArray(this.iri)) {
    const refs = this.iri.map(iri => `<${iri}>`);
    return `FILTER (?iri IN (${refs.join(', ')}))`;
  } else {
    return `FILTER (?iri = <${this.iri}>)`;
  }
});

const isObjectTypeDefinitionNode = (value: DefinitionNode): value is ObjectTypeDefinitionNode => value.kind === "ObjectTypeDefinition";

class SchemaLoader {
  originalTypeDefs: DocumentNode;
  queryDef: ObjectTypeDefinitionNode;
  resourceTypeDefs: Array<ObjectTypeDefinitionNode>;

  constructor(graphql: string) {
    this.originalTypeDefs = parse(graphql);

    const typeDefinitionNodes = this.originalTypeDefs.definitions
      .filter((def): def is ObjectTypeDefinitionNode => isObjectTypeDefinitionNode(def));

    const queryDef = typeDefinitionNodes.find(def => def.name.value === "Query");
    if (!queryDef) {
      throw new Error("Query is not defined");
    }
    this.queryDef = queryDef;

    this.resourceTypeDefs = typeDefinitionNodes.filter(def => def.name.value !== "Query");
  }

  isUserDefined(type: TypeNode): boolean {
    const unwrapped = unwrapCompositeType(type);

    return this.resourceTypeDefs.some(def => def.name.value === unwrapped.name.value);
  }
}

const loader = new SchemaLoader(readFileSync("./index.graphql", "utf8"));

const queryResolvers: Record<string, ResourceResolver> = {};

(loader.queryDef.fields || []).forEach(field => {
  queryResolvers[field.name.value] = async (_parent, args) => {
    const resourceName = unwrapCompositeType(field.type).name.value;
    const resource = Resource.lookup(resourceName);

    return await resource.fetch(args, !isListType(field.type));
  }
});

const resources = loader.resourceTypeDefs
  .map(def => Resource.buildFromTypeDefinition(def));

const resourceResolvers: Record<string, Record<string, ResourceResolver>> = {};

resources.forEach(resource => {
  const fieldResolvers: Record<string, ResourceResolver> = resourceResolvers[resource.definition.name.value] = {};

  (resource.definition.fields || []).forEach(field => {
      if (!loader.isUserDefined(field.type)) { return; }

      const resourceName = unwrapCompositeType(field.type).name.value;
      const resource     = Resource.lookup(resourceName);

      fieldResolvers[field.name.value] = async (parent) => {
        const args = {iri: parent[field.name.value]};

        return await resource.fetch(args, !isListType(field.type));
      };
  });
});

const rootResolvers = {
  Query: queryResolvers,
  ...resourceResolvers
};

const port = process.env.PORT || 4000;

const server = new ApolloServer({
  typeDefs: loader.originalTypeDefs,
  resolvers: rootResolvers
});

server.listen({ port }).then(({ url }) => {
  console.log(`🚀 Server ready at ${url}`);
});
