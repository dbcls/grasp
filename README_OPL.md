# Grasp - Binding to Virtuoso and DBpedia

2021-May-27  
Carl Blakeley

Branch `opl_develop` includes slight changes to how Grasp POSTs queries to a SPARQL endpoint, to allow it to work against Virtuoso. Two simple GraphQL query examples have been added to demonstrate Grasp querying [DBpedia](https://www.dbpedia.org/).

## Requirements

Node.js 14 or later

## To Install

```
git clone https://github.com/OpenLinkSoftware/grasp.git
cd grasp
git checkout opl_develop
npm install
```

## To Run

If using nvm  
`$ nvm use system`

`$ RESOURCES_DIR=./examples npm run watch`

This loads the example resource definitions from `./examples`. The resource definitions targetting DBpedia are contained in `./examples/dbpedia1.graphql` and `./examples/dbpedia2.graphql`

Visit <http://localhost:4000>. You will see GraphQL Playground.

Enter either of the following GraphQL queries into the query editor.

### Example 1: Select a single object

```
query {
  dbpedia1(iri: "http://dbpedia.org/resource/Corona_(novel)") {
    iri
    bookTitle
    authorUri
    authorName
  }
}
```

**Result**

```
{
  "data": {
    "dbpedia1": {
      "iri": "http://dbpedia.org/resource/Corona_(novel)",
      "bookTitle": "Corona (novel)",
      "authorUri": "http://dbpedia.org/resource/Greg_Bear",
      "authorName": "Greg Bear"
    }
  }
}
```

### Example 2: Select multiple objects

```
query {
  dbpedia2(iris: 
	[ 
		"http://dbpedia.org/resource/AI_Superpowers"
		"http://dbpedia.org/resource/A_History_of_British_Birds"
		"http://dbpedia.org/resource/A_Brief_History_of_Time"
	]
   ) {
    iri
    bookTitle
    authorUri
    authorName
  }
}
```

**Result**

```
{
  "data": {
    "dbpedia2": [
      {
        "iri": "http://dbpedia.org/resource/AI_Superpowers",
        "bookTitle": "AI Superpowers",
        "authorUri": "http://dbpedia.org/resource/Kai-Fu_Lee",
        "authorName": "Kai-Fu Lee"
      },
      {
        "iri": "http://dbpedia.org/resource/A_Brief_History_of_Time",
        "bookTitle": "A Brief History of Time",
        "authorUri": "http://dbpedia.org/resource/Stephen_Hawking",
        "authorName": "Stephen Hawking"
      },
      {
        "iri": "http://dbpedia.org/resource/A_History_of_British_Birds",
        "bookTitle": "A History of British Birds",
        "authorUri": "http://dbpedia.org/resource/Thomas_Bewick",
        "authorName": "Thomas Bewick"
      }
    ]
  }
}
```
