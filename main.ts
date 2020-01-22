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

class Resource {
  definition: ObjectTypeDefinitionNode;
  endpoint: string;
  query: CompiledTemplate;

  constructor(definition: ObjectTypeDefinitionNode, endpoint: string, query: string) {
    this.definition = definition;
    this.endpoint   = endpoint;
    this.query      = Handlebars.compile(query, { noEscape: true });
  }
}

const typeDefs = parse(readFileSync("./index.graphql", "utf8"));

const resources: Array<Resource> = typeDefs.definitions
  .filter((def: ObjectTypeDefinitionNode) => def.name.value !== "Query")
  .map((def: ObjectTypeDefinitionNode) => {
    const description = def.description.value;
    const lines = description.split(/\r?\n/);

    let endpoint: string,
      query = "";
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
          query += line + "\n";
          break;
      }
    });

    return new Resource(def, endpoint, query);
  });

function mapValues(obj: object, fn: (val: any) => any): object {
  return Object.entries(obj).reduce(
    (acc, [k, v]) => Object.assign(acc, { [k]: fn(v) }),
    {}
  );
}

async function queryAllBindings(resource: Resource, args: object): Promise<Array<Binding>> {
  const sparqlParams = new URLSearchParams();
  sparqlParams.append("query", resource.query(args));

  const opts = {
    method: "POST",
    body: sparqlParams,
    headers: {
      Accept: "application/sparql-results+json"
    }
  };
  const data = await fetch(resource.endpoint, opts).then(res => res.json());
  console.log("--- SPARQL RESULT ---", JSON.stringify(data, null, "  "));

  const unwrapped = data.results.bindings.map((b: object) => {
    return mapValues(b, ({ value }) => value);
  });

  return unwrapped;
}

const query = typeDefs.definitions.find((def: ObjectTypeDefinitionNode) => def.name.value === "Query") as ObjectTypeDefinitionNode;

const queryResolvers = query.fields.reduce(
  (acc, field) =>
    Object.assign(acc, {
      [field.name.value]: async (_parent: object, args: object) => {
        let resourceName;
        if (field.type.kind === "ListType") {
          // TODO field.type.type.kind can also be ListType
          resourceName = (field.type.type as NamedTypeNode).name.value;
        } else {
          resourceName = (field.type as NamedTypeNode).name.value;
        }

        const resource = resources.find(resource => resource.definition.name.value === resourceName);
        if (!resource) {
          throw new Error(`resource ${resourceName} not found`);
        }

        const bindings = await queryAllBindings(resource, args);

        // TODO id -> iri
        const entries = groupBy(bindings, 'id');

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
