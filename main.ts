import Handlebars = require("handlebars");
import fetch from "node-fetch";
import groupBy = require('lodash.groupby');
import { ApolloServer } from "apollo-server";
import { URLSearchParams } from "url";
import { parse } from "graphql/language/parser";
import { readFileSync } from "fs";

import { ObjectTypeDefinitionNode, NamedTypeNode } from 'graphql';

type CompiledTemplate = (args: object) => string;
type Binding = object;

function mapValues(obj: object, fn: (val: any) => any): object {
  return Object.entries(obj).reduce(
    (acc, [k, v]) => Object.assign(acc, { [k]: fn(v) }),
    {}
  );
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
    const resource = resources.find(resource => resource.definition.name.value === name);

    if (!resource) {
      throw new Error(`resource ${name} not found`);
    }

    return resource;
  }

  static buildFromTypeDefinition(def: ObjectTypeDefinitionNode): Resource {
    const description = def.description.value;
    const lines = description.split(/\r?\n/);

    let endpoint: string,
      sparql = "";
    let state = null;

    lines.forEach((line: string) => {
      switch (line) {
        case "--- endpoint ---":
          state = "endpoint";
          return;
        case "--- sparql ---":
          state = "sparql";
          return;
      }

      switch (state) {
        case "endpoint":
          endpoint = line;
          state = null;
          break;
        case "sparql":
          sparql += line + "\n";
          break;
      }
    });

    return new Resource(def, endpoint, sparql);
  }

  async query(args: object): Promise<Array<Binding>> {
    const sparqlParams = new URLSearchParams();
    sparqlParams.append("query", this.queryTemplate(args));

    const opts = {
      method: "POST",
      body: sparqlParams,
      headers: {
        Accept: "application/sparql-results+json"
      }
    };
    const data = await fetch(this.endpoint, opts).then(res => res.json());
    console.log("--- SPARQL RESULT ---", JSON.stringify(data, null, "  "));

    const unwrapped = data.results.bindings.map((b: object) => {
      return mapValues(b, ({ value }) => value);
    });

    return unwrapped;
  }
}

const typeDefs = parse(readFileSync("./index.graphql", "utf8"));

const resources = typeDefs.definitions
  .filter((def: ObjectTypeDefinitionNode) => def.name.value !== "Query")
  .map((def: ObjectTypeDefinitionNode) => Resource.buildFromTypeDefinition(def));

const query = typeDefs.definitions.find((def: ObjectTypeDefinitionNode) => def.name.value === "Query") as ObjectTypeDefinitionNode;

const queryResolvers = query.fields.reduce(
  (acc, field) =>
    Object.assign(acc, {
      [field.name.value]: async (_parent: object, args: object) => {
        let resourceName: string;
        if (field.type.kind === "ListType") {
          // TODO field.type.type.kind can also be ListType
          resourceName = (field.type.type as NamedTypeNode).name.value;
        } else {
          resourceName = (field.type as NamedTypeNode).name.value;
        }

        const resource = Resource.lookup(resourceName);
        const bindings = await resource.query(args);

        const entries = groupBy(bindings, 'iri');

        Object.entries(entries).forEach(([id, bindings]) => {
          const attrs = {};

          resource.definition.fields.forEach(field => {
            const values = bindings.map(b => b[field.name.value]);
            attrs[field.name.value] = field.type.kind === 'ListType' ? values : values[0];
          });

          Object.assign(entries, {[id]: attrs});
        });

        const values = Object.values(entries);

        return field.type.kind === "ListType" ? values : values[0];
      }
    }),
  {}
);

const resourceResolvers = resources.reduce((acc, resource) => {
  return Object.assign(acc, {
    [resource.definition.name.value]: resource.definition.fields.reduce((acc, _field) => {
      // TODO follow relationship if necessary
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
  typeDefs,
  resolvers: rootResolvers
});

server.listen({ port }).then(({ url }) => {
  console.log(`🚀 Server ready at ${url}`);
});
