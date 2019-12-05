import fetch from "node-fetch";
import Handlebars = require("handlebars");
import { URLSearchParams } from "url";
import { ApolloServer } from "apollo-server";
import outdent from 'outdent';
import gql from 'graphql-tag';

/*
次のようなクエリができる:
{
  Prefecture(name: "福岡県") {
    name
    adjacentPrefectures {
      name
      flower {
        name
      }
    }
    flower {
      name
    }
  }
}
*/

// スキーマをユーザに定義してもらう
const schemaDoc = gql`
  type Query {
    Prefecture(name: String): Prefecture
  }

  type Prefecture {
    name: String
    flower: Flower
    adjacentPrefectures: [Prefecture]
  }

  type Flower {
    name: String
  }
`;

const typeDefs = {
  Prefecture: {
    endpoint: "http://ja.dbpedia.org/sparql",

    query: Handlebars.compile(outdent`
      PREFIX prop-ja: <http://ja.dbpedia.org/property/>
      PREFIX resource-ja: <http://ja.dbpedia.org/resource/>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      SELECT DISTINCT *
      WHERE {
        resource-ja:{{name}} rdfs:label ?name.
        resource-ja:{{name}} prop-ja:花 ?flower.
        resource-ja:{{name}} prop-ja:隣接都道府県 ?adjacentPrefecture.
      }
    `, {noEscape: true})
  },
  Flower: {
    endpoint: "http://ja.dbpedia.org/sparql",

    query: Handlebars.compile(outdent`
      PREFIX prop-ja: <http://ja.dbpedia.org/property/>
      PREFIX resource-ja: <http://ja.dbpedia.org/resource/>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      SELECT DISTINCT *
      WHERE {
        <{{iri}}> rdfs:label ?name.
      }
    `, {noEscape: true})
  }
};

function mapValues(obj: object, fn: (val: any) => any): object {
  return Object.entries(obj).reduce((acc, [k, v]) => Object.assign(acc, {[k]: fn(v)}), {});
}

async function queryAllBindings({endpoint, query: buildQuery}: {endpoint: string, query: (args: object) => string}, args: object) {
  const sparqlParams = new URLSearchParams();
  sparqlParams.append("query", buildQuery(args));

  const opts = {
    method: "POST",
    body: sparqlParams,
    headers: {
      Accept: "application/sparql-results+json"
    }
  };
  const data = await fetch(endpoint, opts).then(res => res.json());
  console.log("RESPONSE!!", JSON.stringify(data, null, "  "));

  return data.results.bindings.map((b: object) => {
    // TODO v の型に応じて変換する？最後に一括で変換したほうがいいかもしれない
    return mapValues(b, ({value}) => value);
  });
}

async function queryFirstBinding(typeDef: {endpoint: string, query: (args: object) => string}, args: object) {
  const bindings = await queryAllBindings(typeDef, args);

  return bindings[0];
}

const query = schemaDoc.definitions.find(def => def.name.value === 'Query');
const types = schemaDoc.definitions.filter(def => def.name.value !== 'Query');

// クエリも定義する
const root = {
  Query: query.fields.reduce((acc, field) => (
    Object.assign(acc, {
      [field.name.value]: async (_parent: object, args: object) => {
        // TODO スキーマの型に応じて取り方を変える必要がある？
        return await queryFirstBinding(typeDefs[field.name.value], args);
      }
    })
  ), {}),
  ...types.reduce((acc, type) => {
    return Object.assign(acc, {
      [type.name.value]: type.fields.reduce((acc, field) => {
        return Object.assign(acc, field.type.kind === 'ListType' ? {
          [field.name.value]: async (args) => {
            console.log(typeDefs[type.name.value])
            const bindings = await queryAllBindings(typeDefs[type.name.value], args);

            // TODO 汎化できていない
            const queries = bindings.map(async ({adjacentPrefecture: iri}) => {
              const args = {
                name: iri.split("/").slice(-1)[0]
              };

              return await queryFirstBinding(typeDefs[field.type.type.name.value], args);
            });

            return await Promise.all(queries);
          }
        } : Object.keys(typeDefs).includes(field.type.name.value) ? {
          [field.name.value]: async (args) => {
            // TODO 汎化できていない
            // TODO ほんとはこれがIRIか判定したいんだけど雑にやってる
            if (args.flower.startsWith("http")) {
              return await queryFirstBinding(typeDefs.Flower, {iri: args.flower});
            } else {
              return { name: args.flower };
            }
          }
        } : {});
      }, {})
    })
  }, {})
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
