import fetch from "node-fetch";
import Handlebars = require("handlebars");
import { URLSearchParams } from "url";
import { ApolloServer } from "apollo-server";
import outdent from "outdent";
import gql from "graphql-tag";

// スキーマをユーザに定義してもらう
const schemaDoc = gql`
  type Query {
    """
    returns a quanto entry of IRI
    """
    SequenceStatisticsReport(iri: String): SequenceStatisticsReport
  }

  """
  \`SequenceStatisticsReport\` represents a sequence statistics report (sos:SequenceStatisticsReport)
  """
  type SequenceStatisticsReport {
    """
    Ideintifier. \`dcterms:identifier\`
    """
    id: String

    """
    An encoding format. \`sos:encoding\`
    """
    encoding: String

    """
    A file type. \`sos:fileType\`
    """
    file_type: String
    version: String
    fastqc_version: String
    contributor: [String] # doesn't work yet
    min_seq_len: Float
    median_seq_len: Float
    max_seq_len: Float
    mean_bc_quality: Float
    median_bc_quality: Float
    n_content: Float
    gc_content: Float
    total_seq: Int
    filtered_seq: Int
  }
`;

const typeDefs = {
  SequenceStatisticsReport: {
    endpoint: "https://integbio.jp/rdf/sparql",

    query: Handlebars.compile(
      outdent`
    # Retrieve statistics of SRA entry ERR026579 from the Qunato database

    PREFIX sos: <http://purl.jp/bio/01/quanto/ontology/sos#>
    PREFIX quanto: <http://purl.jp/bio/01/quanto/resource/>
    PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX pav: <http://purl.org/pav/>
    SELECT
      ?quanto
      ?id
      ?encoding
      ?file_type
      ?version
      ?contributor
      ?fastqc_version
      ?filtered_seq
      ?min_seq_len
      ?median_seq_len
      ?max_seq_len
      ?mean_bc_quality
      ?median_bc_quality
      ?n_content
      ?gc_content
      ?total_seq
    FROM <http://quanto.dbcls.jp>
    WHERE {
      ?quanto a sos:SequenceStatisticsReport .
      ?quanto dct:identifier ?id .
      ?quanto rdfs:seeAlso <http://identifiers.org/insdc.sra/ERR026579> .
      ?quanto sos:fastqcVersion ?fastqc_version .
      ?quanto sos:encoding ?encoding .
      ?quanto sos:fileType ?file_type .
      ?quanto pav:version ?version .
      ?quanto dcterms:contributor ?contributor .
      ?quanto sos:maxSequenceLength/rdf:value ?max_seq_len .
      ?quanto sos:medianSequenceLength/rdf:value ?median_seq_len .
      ?quanto sos:minSequenceLength/rdf:value ?min_seq_len .
      ?quanto sos:overallMeanBaseCallQuality/rdf:value ?mean_bc_quality .
      ?quanto sos:overallMedianBaseCallQuality/rdf:value ?median_bc_quality .
      ?quanto sos:overallNContent/rdf:value ?n_content .
      ?quanto sos:percentGC/rdf:value ?gc_content .
      ?quanto sos:totalSequences/rdf:value ?total_seq .
      ?quanto sos:filteredSequences/rdf:value ?filtered_seq .

      FILTER (?quanto = <{{iri}}>)
    }
        `,
      { noEscape: true }
    )
  },
  Flower: {
    endpoint: "http://ja.dbpedia.org/sparql",

    query: Handlebars.compile(
      outdent`
      PREFIX prop-ja: <http://ja.dbpedia.org/property/>
      PREFIX resource-ja: <http://ja.dbpedia.org/resource/>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      SELECT DISTINCT *
      WHERE {
        <{{iri}}> rdfs:label ?name.
      }
    `,
      { noEscape: true }
    )
  }
};

function mapValues(obj: object, fn: (val: any) => any): object {
  return Object.entries(obj).reduce(
    (acc, [k, v]) => Object.assign(acc, { [k]: fn(v) }),
    {}
  );
}

async function queryAllBindings(
  {
    endpoint,
    query: buildQuery
  }: { endpoint: string; query: (args: object) => string },
  args: object
) {
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
    return mapValues(b, ({ value }) => value);
  });
}

async function queryFirstBinding(
  typeDef: { endpoint: string; query: (args: object) => string },
  args: object
) {
  const bindings = await queryAllBindings(typeDef, args);

  return bindings[0];
}

const query = schemaDoc.definitions.find(def => def.name.value === "Query");
const types = schemaDoc.definitions.filter(def => def.name.value !== "Query");

// クエリも定義する
const root = {
  Query: query.fields.reduce(
    (acc, field) =>
      Object.assign(acc, {
        [field.name.value]: async (_parent: object, args: object) => {
          // TODO スキーマの型に応じて取り方を変える必要がある？
          return await queryFirstBinding(typeDefs[field.name.value], args);
        }
      }),
    {}
  ),
  ...types.reduce((acc, type) => {
    return Object.assign(acc, {
      [type.name.value]: type.fields.reduce((acc, field) => {
        return Object.assign(
          acc,
          field.type.kind === "ListType"
            ? {
                [field.name.value]: async args => {
                  console.log(typeDefs[type.name.value]);
                  const bindings = await queryAllBindings(
                    typeDefs[type.name.value],
                    args
                  );

                  // TODO 汎化できていない
                  const queries = bindings.map(
                    async ({ adjacentPrefecture: iri }) => {
                      const args = {
                        name: iri.split("/").slice(-1)[0]
                      };

                      return await queryFirstBinding(
                        typeDefs[field.type.type.name.value],
                        args
                      );
                    }
                  );

                  return await Promise.all(queries);
                }
              }
            : Object.keys(typeDefs).includes(field.type.name.value)
            ? {
                [field.name.value]: async args => {
                  // TODO 汎化できていない
                  // TODO ほんとはこれがIRIか判定したいんだけど雑にやってる
                  if (args.flower.startsWith("http")) {
                    return await queryFirstBinding(typeDefs.Flower, {
                      iri: args.flower
                    });
                  } else {
                    return { name: args.flower };
                  }
                }
              }
            : {}
        );
      }, {})
    });
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
