# Grasp: A bridge between GraphQL and SPARQL

## What is Grasp?

Grasp is a bridge software that provides a GraphQL endpoint wrapping SPARQL endpoints.

Grasp works as follows:

1. Grasp receives a GraphQL query from a client.
2. Grasp translates it into a SPARQL query (or queries).
3. Grasp sends the query to a SPARQL endpoint (or endpoints).
4. The SPARQL endpoints return the results to Grasp.
5. Grasp reforms the results to fit the given GraphQL query.
6. Grasp sends the results back to the client.

<!--
```uml
actor Client
participant Grasp
participant "SPARQL Endpoint"

autonumber
Client -> Grasp: Submit a GraphQL Query
Grasp -> Grasp: Translate the Query
Grasp -> "SPARQL Endpoint": Send SPARQL Queries
"SPARQL Endpoint" -> Grasp: SPARQL Results
Grasp -> Grasp: Translate Results
Grasp -> Client: GraphQL Result
```
-->
![](https://raw.githubusercontent.com/dbcls/grasp/master/docs/overview.svg?sanitize=true)

We need to define a GraphQL schema with some Grasp specific notations, which are carefully designed to keep full-compatibility with the GraphQL specification. More specifically, we need to define a SPARQL endpoint URL and a SPARQL query template per a *concept*, or a *type* in GraphQL terms. We also use GraphQL decorators for metadata (described later).

Let's look at a simple example.

## How to Use

### Requirements

* [Node.js](https://nodejs.org/) 12.x

### Install

    $ git clone https://github.com/dbcls/grasp.git
    $ cd grasp
    $ npm install

### Run

    $ npm run watch

Visit http://localhost:4000 . You will see GraphQL Playground.

Write a GraphQL query below in the query editor (left pane):

```graphql
query {
  dataset(iri: "http://purl.jp/bio/03/dbcatalog/nbdc00012") {
    iri
    title_en
    references {
      iri
      title
    }
  }
}
```

Then, press Ctrl+Enter. The query will be issued and results will be shown (on right pane).

![](https://raw.githubusercontent.com/dbcls/grasp/master/docs/graphql-playground.png)

Now we've queried [Integbio Database Catalog/RDF](https://integbio.jp/rdf/?view=detail&id=dbcatalog) with GraphQL. Let's see how it works.

## How does this works?

The GraphQL query was translated into SPARQL queries and sent to a SPARQL endpoint, then the SPARQL results were returned to Grasp, finally the results were reformed into the GraphQL result.

Grasp does those translation according to a GraphQL schema (type definition), SPARQL Endpoint URL and SPARQL query, which you provide. We refer to this as *resource* in Grasp. Let us dig into the definition.

You will see the resource definition at  [resources/dataset.graphql](https://github.com/dbcls/grasp/blob/master/resources/dataset.graphql).

SPARQL Endpoint URL and SPARQL query are written in the GraphQL comment of the type in a special form. SPARQL Endpoint is specified after the `--- endpoint ---` line. SPARQL query is placed after the `--- sparql ---` line.

We can access the parameters on GraphQL query in the SPARQL query. In this example, we filter the triples by `iri` parameter via `{{filter-by-iri}}` helper, which generates `FILTER ?iri IN (...)`.

The query returns a RDF graph by the `CONSTRUCT` query form.  The graph has triples which consist of the IRI identifying the object, the predicate corresponding to the field name of the object, and its value.

See the first part of the SPARQL query:

```sparql
PREFIX : <https://github.com/dbcls/grasp/>
PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX db: <http://purl.jp/bio/03/dbcatalog/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
CONSTRUCT {
  ?iri :iri ?iri .
  ?iri :title_ja ?title_ja .
  ?iri :title_en ?title_en .
```

Here, we can see that the `Dataset` object has fields `iri`, `title_ja` and `title_en`, where`iri` works as an identifier.

We use predicates with the special namespace (`https://github.com/dbcls/grasp/`) in order to specify the field names.

After the comment block, we have `Dataset` GraphQL object type as follows. This corresponds to the above-mentioned SPARQL query.

```graphql
type Dataset {
  iri: String!
  title_ja: String!
  title_en: String
```

Note: `!` means that the field is non-nullable. See https://graphql.org/learn/schema/#lists-and-non-null
 for detail.

Now we've defined the `Dataset` object type. In addition, we need to define a field to query type in order to fetch a `Dataset` with a GraphQL query. We're showing the corresponding part of [resources/index.graphql](https://github.com/dbcls/grasp/blob/master/resources/index.graphql):

```graphql
type Query {
  # ...
  dataset(iri: String!): Dataset
  # ...
}
```

Here, we've defined the `dataset` field to fetch a `Dataset`.

### Fields with multiple values

SPARQL results may have multiple values for one field. In the previous example, as for `iri`, `title_ja` and `title_en`, Grasp returns only one value arbitrarily picked from found values.

If you want to have all values in GraphQL results, you need to use a list type in GraphQL schema:

```
type SequenceStatisticsReport {
  # ...
  contributor: [String!]!
  # ...
}
```

With this definition, you can all values for `contributor` field in a list of `String`s.

### Relations

You might notice that we have `references` in a `Dataset` object in the GraphQL result:

```javascript
{
  "data": {
    "dataset": {
      "iri": "http://purl.jp/bio/03/dbcatalog/nbdc00012",
      "title_en": "Atlas of Genetics and Cytogenetics in Oncology and Haematology",
      "references": [
        {
          "iri": "http://rdf.ncbi.nlm.nih.gov/pubmed/12520000",
          "title": "Atlas of Genetics and Cytogenetics in Oncology and Haematology, year 2003."
        },
        {
          "iri": "http://rdf.ncbi.nlm.nih.gov/pubmed/11125120",
          "title": "Atlas of Genetics and Cytogenetics in Oncology and Haematology, updated."
        },
        ...
      }
    }
  }
}
```

In  [resources/dataset.graphql](https://github.com/dbcls/grasp/blob/master/resources/dataset.graphql), `references` field is defined as follows:

```graphql
type Dataset {
   # ...
   references: [Pubmed!]!
   # ...
}
```

In this case, Grasp issues two SPARQL queries to complete a GraphQL query to fetch `Dataset` including all its `references` field. The first is to fetch a `Dataset`, with `references` having their IRIs. The second is to fetch `references` using the IRIs. The second query is processed according to your `Pubmed` resource definition ([resources/pubmed.graphql](https://github.com/dbcls/grasp/blob/master/resources/pubmed.graphql)). Grasp combines these SPARQL results from these queries into the final GraphQL response.

### Treat blank nodes as relations

We cannot handle relations with a blank node in the previously mentioned way, as the blank node can't be pointed with an IRI. In order to handle such relations, we introduce *embedded resources*.

Consider the following case:

<!--
``` uml
object dataset {
  iri = <http://purl.jp/bio/03/dbcatalog/nbdc00012>
  title_ja = "Atlas of Genetics and Cytogenetics in Oncology and Haematology"
  ...
}
object publisher <<blank node>> {
  name_ja = "ATLAS"
  name_en = "ATLAS"
  page = null
}

dataset *-- publisher
```
-->

![](https://raw.githubusercontent.com/dbcls/grasp/master/docs/embedded.svg?sanitize=true)

In [resources/pubmed.graphql](https://github.com/dbcls/grasp/blob/master/resources/publisher.graphql), we have the following definition of `Publisher`:

```graphql
type Dataset {
  # ...
  publisher: Publisher
  # ...
}
```

The `Publisher` resource is defined as follows:

```graphql
type Publisher @embedded {
  name_ja: String
  name_en: String
  page: String
}
```

Note that `Publisher` doesn't have a special comment containing an endpoint definition and SPARQL query, and that we marked `Publisher` as `@embedded`. When resolving resources with `@embedded`, Grasp doesn't fetch the resource with a separate query. Instead, fills the fields from the query of its parent resource.

The following query fetches `Dataset`. In this query, values of `publisher` are fetched all together:

```sparql
CONSTRUCT {
  ?iri :iri ?iri .
  ?iri :title_ja ?title_ja .
  # ...
  ?iri :publisher ?publisher .
  ?publisher :name_ja ?publisher_name_ja .
  ?publisher :name_en ?publisher_name_en .
  ?publisher :page ?publisher_page .
  # ...
}
# ...
WHERE
{
  # ...
  OPTIONAL { ?iri dcterms:publisher ?publisher . }
  OPTIONAL { ?publisher rdfs:label ?publisher_name_ja . FILTER (lang(?publisher_name_ja) = "ja") }
  OPTIONAL { ?publisher rdfs:label ?publisher_name_en . FILTER (lang(?publisher_name_en) = "en") }
  OPTIONAL { ?publisher foaf:page ?publisher_page . }
  # ...
}
```

This query returns triples representing a `Dataset` and representing the `Publisher` of the `Dataset` at the same time. Grasp distinguish them by their subjects (of a graph generated by the `CONSTRUCT` query form) and build GraphQL objects.

Note that we need to return graph containing triples whose 1) subject points the embedded resource and 2) predicate reflects its field name. `?publisher` is bound to the blank node representing the `Publisher`.


## Write your own definition

You can add your own definitions in `resources` directory.

You need to restart Grasp to reload the definitions. You can use `npm run watch` to restart the server automatically.

## Advanced Topics

### Filter triples by parameters other than IRIs in SPARQL Query

Consider that you want to query a `Dataset` with an `id` (like `dcterms:identifier`). Add the following field definition into the `Query`:

```graphql
type Query {
  # ...
  datasetById(id: String): Dataset
}
```

If we issue the following GraphQL query:

``` graphql
query {
  datasetById(id: "nbdc00012") {
    ...
  }
}
```

In this case, we can obtain `"ndbc0012"` with `{{id}}` in the SPARQL query.

```hbs
WHERE
{
  # ...
  ?iri dcterms:identifier ?id . FILTER (?id = "{{id}}")
}
```

For this situation, `{{filter-by}}` helper should be useful, as this helper generates `FILTER ... IN` from parameters with both a single value and a list of values:

```hbs
WHERE
{
  # ...
  {{#filter-by id as |_id|}}
    "{{_id}}"
  {{/filter-by}}
}
```

Further, `{{filter-by-iri}}` can be interpreted as the following:

```hbs
{{#filter-by iri as |_iri|}}
  <{{_iri}}>
{{{/filter-by}}
```

The SPARQL template is written in Handlebars. You can use Handlebars' built-in helpers such as `if` and `each`. See https://handlebarsjs.com/guide/ for details.
