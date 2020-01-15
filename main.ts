import fetch from "node-fetch";
import Handlebars = require("handlebars");
import { URLSearchParams } from "url";
import { ApolloServer } from "apollo-server";
import { parse } from "graphql/language/parser";
import { readFileSync } from "fs";

// スキーマをユーザに定義してもらう
const schemaDoc = parse(readFileSync("./index.graphql", "utf8")) as any;

const typeDefs = schemaDoc.definitions
  .filter(def => def.name.value !== "Query")
  .map(def => {
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

    return {
      definition: def,
      endpoint,
      query: Handlebars.compile(query, { noEscape: true })
    };
  });

function mapValues(obj: object, fn: (val: any) => any): object {
  return Object.entries(obj).reduce(
    (acc, [k, v]) => Object.assign(acc, { [k]: fn(v) }),
    {}
  );
}

async function queryAllBindings(type, args: object) {
  const sparqlParams = new URLSearchParams();
  sparqlParams.append("query", type.query(args));

  const opts = {
    method: "POST",
    body: sparqlParams,
    headers: {
      Accept: "application/sparql-results+json"
    }
  };
  const data = await fetch(type.endpoint, opts).then(res => res.json());
  console.log("RESPONSE!!", JSON.stringify(data, null, "  "));

  const unwrapped = data.results.bindings.map((b: object) => {
    // TODO v の型に応じて変換する？最後に一括で変換したほうがいいかもしれない
    return mapValues(b, ({ value }) => value);
  });

  return unwrapped;
}

async function queryFirstBinding(
  typeDef: { endpoint: string; query: (args: object) => string },
  args: object
) {
  const bindings = await queryAllBindings(typeDef, args);

  return bindings[0];
}

function isUserDefined(type) {
  return typeDefs.includes(type.definition);
}

const query = schemaDoc.definitions.find(def => def.name.value === "Query");

const rootResolvers = query.fields.reduce(
  (acc, field) =>
    Object.assign(acc, {
      [field.name.value]: async (_parent: object, args: object) => {
        // TODO スキーマの型に応じて取り方を変える必要がある？
        return await queryFirstBinding(
          typeDefs.find(
            type => type.definition.name.value === field.name.value
          ),
          args
        );
      }
    }),
  {}
);

const listResolver = (type, field) => {
  return async args => {
    const bindings = await queryAllBindings(type, args);

    if (isUserDefined(type)) {
      // TODO 汎化できていない
      const queries = bindings.map(async ({ adjacentPrefecture: iri }) => {
        const args = {
          name: iri.split("/").slice(-1)[0]
        };

        return await queryFirstBinding(type, args);
      });

      return await Promise.all(queries);
    } else {
      console.log("BINDINGS", type, args, bindings)
      return bindings.map(binding => binding[field.name.value]);
    }
  };
};

const typeResolvers = typeDefs.reduce((acc, type) => {
  return Object.assign(acc, {
    [type.definition.name.value]: type.definition.fields.reduce((acc, field) => {
      let resolver;

      if (field.type.kind === "ListType") {
        resolver = listResolver(type, field);
      } else if (isUserDefined(type)) {
        resolver = async args => {
          // TODO 関連を引くロジック
          throw new Error("not implemented");
        }
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
  ...typeResolvers
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
