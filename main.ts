import fetch from "node-fetch";
import Handlebars = require("handlebars");
import { URLSearchParams } from "url";
import { ApolloServer } from "apollo-server";
import { parse } from "graphql/language/parser";
import { readFileSync } from "fs";

import { ObjectTypeDefinitionNode, FieldDefinitionNode } from 'graphql';

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

// スキーマをユーザに定義してもらう
const schemaDoc = parse(readFileSync("./index.graphql", "utf8"));

const resources: Array<Resource> = schemaDoc.definitions
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

async function queryAllBindings(resource: Resource, args: object) {
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
  console.log("RESPONSE!!", JSON.stringify(data, null, "  "));

  const unwrapped = data.results.bindings.map((b: object) => {
    // TODO v の型に応じて変換する？最後に一括で変換したほうがいいかもしれない
    return mapValues(b, ({ value }) => value);
  });

  return unwrapped;
}

async function queryFirstBinding(resource: Resource, args: object) {
  const bindings = await queryAllBindings(resource, args);

  return bindings[0];
}

function isUserDefined(resource: Resource) {
  return resources.includes(resource);
}

const query = schemaDoc.definitions.find((def: ObjectTypeDefinitionNode) => def.name.value === "Query") as ObjectTypeDefinitionNode;

const rootResolvers = query.fields.reduce(
  (acc, field) =>
    Object.assign(acc, {
      [field.name.value]: async (_parent: object, args: object) => {
        // TODO スキーマの型に応じて取り方を変える必要がある？
        return await queryFirstBinding(
          resources.find(resource => resource.definition.name.value === field.name.value),
          args
        );
      }
    }),
  {}
);

const listResolver = (resource: Resource, field: FieldDefinitionNode) => {
  return async (args: object) => {
    const bindings = await queryAllBindings(resource, args);

    //if (isUserDefined(resource)) {
    //  // TODO 汎化できていない
    //  const queries = bindings.map(async ({ adjacentPrefecture: iri }) => {
    //    const args = {
    //      name: iri.split("/").slice(-1)[0]
    //    };

    //    return await queryFirstBinding(resource, args);
    //  });

    //  return await Promise.all(queries);
    //} else {
      console.log("BINDINGS", resource, args, bindings)
      return bindings.map((binding: object) => binding[field.name.value]);
    //}
  };
};

const resourceResolvers = resources.reduce((acc, resource) => {
  return Object.assign(acc, {
    [resource.definition.name.value]: resource.definition.fields.reduce((acc, field) => {
      let resolver: (args: object) => Promise<Array<Binding>>;

      if (field.type.kind === "ListType") {
        resolver = listResolver(resource, field);
      //} else if (isUserDefined(resource)) {
      //  resolver = async (_args: object) => {
      //    console.log(resource);
      //    // TODO 関連を引くロジック
      //    throw new Error("not implemented");
      //  }
      } else {
        return acc;
      }

      return Object.assign(acc, {[field.name.value]: resolver});
    }, {})
  });
}, {});

// クエリも定義する
const root = {
  Query: rootResolvers,
  ...resourceResolvers
};

const port = process.env.PORT || 4000;

// サーバを起動
const server = new ApolloServer({
  typeDefs: schemaDoc,
  resolvers: root
});

server.listen({ port }).then(({ url }) => {
  console.log(`🚀 Server ready at ${url}`);
});
