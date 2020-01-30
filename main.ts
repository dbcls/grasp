import Handlebars = require("handlebars");
import fetch from "node-fetch";
import groupBy = require('lodash.groupby');
import { ApolloServer } from "apollo-server";
import { URLSearchParams } from "url";
import { parse } from "graphql/language/parser";
import { readFileSync } from "fs";

import { ObjectTypeDefinitionNode, TypeNode, NamedTypeNode, DefinitionNode, DocumentNode } from 'graphql';

type CompiledTemplate = (args: object) => string;
type Binding = Record<string, any>;
type Entry = Record<string, any>;

function mapValues<K extends string | number | symbol, V1, V2>(obj: Record<K, V1>, fn: (val: V1) => V2): Record<K, V2> {
  return Object.entries(obj).reduce((acc, [k, v]) => (
    Object.assign(acc, {
      [k]: fn(v as V1)
    })
  ), {} as Record<K, V2>);
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

  async fetch(args: object, one = false): Promise<Entry[]> {
    const bindings = await this.query(args);

    const entries  = groupBy(bindings, 's');
    Object.entries(entries).forEach(([iri, bindings]) => {
      const assoc = mapValues(groupBy(bindings, 'p'), (bindings) => bindings.map(b => b.o));

      const attrs: Entry = {};
      (this.definition.fields || []).forEach(field => {
        const values = assoc[field.name.value] || [];
        attrs[field.name.value] = field.type.kind === 'ListType' ? values : values[0];
      });

      Object.assign(entries, {[iri]: attrs});
    });

    const values = Object.values(entries);

    return one ? values[0] : values;
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
    switch(type.kind) {
      case "ListType":
        return this.isUserDefined(type.type);
      case "NamedType":
        return this.resourceTypeDefs.some(def => def.name.value === type.name.value);
      default:
        throw new Error(`unsupported type ${type.kind}`);
    }
  }
}

const loader = new SchemaLoader(readFileSync("./index.graphql", "utf8"));

function unwrapListType(type: TypeNode): NamedTypeNode {
  switch (type.kind) {
    case 'NamedType':
      return type;
    case 'ListType':
      return unwrapListType(type.type);
    default:
      throw new Error(`unsupported type: ${type.kind}`);
  }
}

const queryResolvers = (loader.queryDef.fields || []).reduce(
  (acc, field) =>
    Object.assign(acc, {
      [field.name.value]: async (_parent: object, args: object) => {
        const resourceName = unwrapListType(field.type).name.value;
        const resource = Resource.lookup(resourceName);

        return await resource.fetch(args, field.type.kind !== "ListType")
      }
    }),
  {}
);

const resources = loader.resourceTypeDefs
  .map(def => Resource.buildFromTypeDefinition(def));

const resourceResolvers: Record<string, any> = resources.reduce((acc, resource) => {
  return Object.assign(acc, {
    [resource.definition.name.value]: (resource.definition.fields || []).reduce((acc: Record<string, Function>, field) => {
      if (!loader.isUserDefined(field.type)) { return acc; }

      const resourceName = unwrapListType(field.type).name.value;
      const resource = Resource.lookup(resourceName);

      acc[field.name.value] = async (parent: Entry): Promise<Entry | Entry[]> => {
        const args = {iri: parent[field.name.value]};

        return await resource.fetch(args, field.type.kind !== "ListType");
      };

      return acc;
    }, {})
  });
}, {});

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
