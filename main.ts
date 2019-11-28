import fetch from "node-fetch";
import Handlebars = require("handlebars");
import { URLSearchParams } from "url";
import { ApolloServer } from "apollo-server";

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
const schemaDoc = `
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

const endpoint = "http://ja.dbpedia.org/sparql";
const sparql = `
PREFIX prop-ja: <http://ja.dbpedia.org/property/>
PREFIX resource-ja: <http://ja.dbpedia.org/resource/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT DISTINCT *
WHERE {
  resource-ja:{{name}} rdfs:label ?name.
  resource-ja:{{name}} prop-ja:花 ?flower.
  resource-ja:{{name}} prop-ja:隣接都道府県 ?adjacentPrefecture.
}`;

const flowerSPARQL = `
PREFIX prop-ja: <http://ja.dbpedia.org/property/>
PREFIX resource-ja: <http://ja.dbpedia.org/resource/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT DISTINCT *
WHERE {
  {{{iri}}} rdfs:label ?name.
}`;

function mapValues(obj: object, fn: (val: any) => any): object {
  return Object.entries(obj).reduce((acc, [k, v]) => Object.assign(acc, {[k]: fn(v)}), {});
}

async function runSPARQL(endpoint: string, query: string) {
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
  console.log("RESPONSE!!", JSON.stringify(data, null, "  "));

  const result = data.results.bindings.map((b: object) => {
    // TODO v の型に応じて変換する？最後に一括で変換したほうがいいかもしれない
    return mapValues(b, ({value}) => value);
  });

  return result;
}

// クエリも定義する
const root = {
  Prefecture: {
    async adjacentPrefectures({name}, _args: object) {
      //      const iri = `<http://ja.dbpedia.org/resource/${name}>`;
      const compiledTemplate = Handlebars.compile(sparql);
      const query = compiledTemplate({ name });
      const results = await runSPARQL(endpoint, query);
      console.log("ADJ RESULTS", results);

      const adjacentPrefectures = [];
      for (const result of results) {
        const name = result.adjacentPrefecture.split("/").slice(-1)[0];
        const query = compiledTemplate({ name });
        const results = await runSPARQL(endpoint, query);
        adjacentPrefectures.push(results[0]);
      }

      return adjacentPrefectures;
    },
    async flower({flower}) {
      if (flower.startsWith("http")) {
        // TODO ほんとはこれがIRIか判定したいんだけど雑にやってる
        const iri = `<${flower}>`;
        const compiledTemplate = Handlebars.compile(flowerSPARQL);
        const query = compiledTemplate({ iri });
        console.log("QUERY", query);

        const results = await runSPARQL(endpoint, query);

        return results[0];
      } else {
        return { name: flower };
      }
    }
  },
  Query: {
    async Prefecture(_parent: object, params: object) {
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

      const result = data.results.bindings.map((b: object) => {
        // TODO v の型に応じて変換する？最後に一括で変換したほうがいいかもしれない
        return mapValues(b, ({value}) => value);
      });

      const r = result[0];
      console.log("RESULT", result);

      return r;
    }
  }
};

// サーバを起動
const server = new ApolloServer({
  typeDefs: schemaDoc,
  resolvers: root
});

server.listen().then(({ url }) => {
  console.log(`🚀 Server ready at ${url}`);
});
