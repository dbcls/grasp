import { graphql, buildSchema } from "graphql";
import fetch from "node-fetch";
const Handlebars = require("handlebars");
const { URLSearchParams } = require("url");
import { ApolloServer } from "apollo-server";

// スキーマをユーザに定義してもらう
const schemaDoc = `
  type Query {
    Prefecture(name: String): Prefecture
  }

  type Prefecture {
    flower: Flower
    adjacentPrefectures: [Prefecture]
  }

  type Flower {
    name: String
  }
`;

const endpoint = "http://ja.dbpedia.org/sparql";
const sparql = `
PREFIX prop-ja: <http://ja.dbpedia.org/property/>
PREFIX resource-ja: <http://ja.dbpedia.org/resource/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT DISTINCT *
WHERE {
  resource-ja:{{name}} rdfs:label ?flower.
}`;

// クエリも定義する
const root = {
  Prefecture: {
    adjacentPrefectures: async (parent, args) => {
      console.log("PARENT", parent);
    },
    flower: async (parent, args) => {
      console.log("FLOWER", parent);
    }
  },
  Query: {
    Prefecture: async function(parent, params) {
      const compiledTemplate = Handlebars.compile(sparql);
      const query = compiledTemplate(params);
      console.log("QUERY", query);

      const sparqlParams = new URLSearchParams();
      sparqlParams.append("query", query);

      const opts = {
        method: "POST",
        body: sparqlParams,
        headers: {
          Accept: "application/sparql-results+json"
        }
      };
      const res = await fetch(endpoint, opts);
      const data = await res.json();
      console.log("RESPONSE", JSON.stringify(data, null, "  "));

      const result = data.results.bindings.map(b => {
        const obj = {};
        Object.entries(b).forEach(([k, v]) => {
          obj[k] = (v as any).value;
        });
        return obj;
      });

      const r = result[0];
      console.log("RESULT", result);

      return r;
    }
  }
};

const schema = buildSchema(schemaDoc);

// クエリ実行
const server = new ApolloServer({
  typeDefs: schemaDoc,
  resolvers: root
});

server.listen().then(({ url }) => {
  console.log(`🚀 Server ready at ${url}`);
});
