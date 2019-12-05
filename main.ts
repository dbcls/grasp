import fetch from "node-fetch";
import Handlebars = require("handlebars");
import { URLSearchParams } from "url";
import { ApolloServer } from "apollo-server";
import outdent from 'outdent';

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
const schemaDoc = outdent`
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

const Prefecture = {
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
};

const Flower = {
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

// クエリも定義する
const root = {
  Query: {
    async Prefecture(_parent: object, {name}) {
      return await queryFirstBinding(Prefecture, {name});
    }
  },
  Prefecture: {
    async adjacentPrefectures({name}) {
      // const iri = `<http://ja.dbpedia.org/resource/${name}>`;
      const bindings = await queryAllBindings(Prefecture, {name});

      const queryPrefectures = bindings.map(async ({adjacentPrefecture: iri}) => {
        const name = iri.split("/").slice(-1)[0];
        return await queryFirstBinding(Prefecture, {name});
      });

      return await Promise.all(queryPrefectures);
    },
    async flower({flower}) {
      // TODO ほんとはこれがIRIか判定したいんだけど雑にやってる
      if (flower.startsWith("http")) {
        return await queryFirstBinding(Flower, {iri: flower});
      } else {
        return { name: flower };
      }
    }
  }
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
