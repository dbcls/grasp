import fs from "fs";
import { parse } from "graphql/language/parser.js";
import { ObjectTypeDefinitionNode } from "graphql";
import { join } from "path";
import Resource from "../lib/resource.js";
import SparqlClient from "sparql-http-client";
import ResourceIndex from "../lib/resource-index.js";

import { Readable } from "stream";
import * as url from 'url';
import {ensureArray} from '../lib/utils.js'
import { Headers, Response } from 'node-fetch'
const dirname = url.fileURLToPath(new URL('.', import.meta.url));

export function getTestFile(path: string): string {
  return fs.readFileSync(join(dirname, path), { encoding: "utf-8" });
}
export function getResourceTypeDefs(path: string): ObjectTypeDefinitionNode[] {
  const schema = getTestFile(path);
  return parse(schema).definitions.filter(
    (def): def is ObjectTypeDefinitionNode => {
      return def.kind === "ObjectTypeDefinition";
    }
  );
}
export function getTestResourceIndex(res?: Resource | Resource[]): ResourceIndex {
  return {
    all: ensureArray(res),
    root: ensureArray(res),
    isUserDefined: () => true,
    lookup: (name: string) => null,
  };
}
export function getTestResource(
  path: string,
  name: string = "Test",
  serviceIndex?: Map<string, SparqlClient>,
  templateIndex?: Map<string, string>
): Resource {
  const resourceTypeDefs = getResourceTypeDefs(path);
  const testResourceTypeDef = resourceTypeDefs.filter(
    (def) => def.name.value === name
  )[0];
  return Resource.buildFromTypeDefinition(
    getTestResourceIndex(),
    testResourceTypeDef,
    serviceIndex,
    templateIndex
  );
}

export function getTestSparqlClient(body:string): SparqlClient {

  const mockFetch = async function () {
    return new Response(Readable.from(body), {
      headers: new Headers({'Content-Type': 'text/turtle'}),
      status: 200
    })
  }
  mockFetch.Headers = Headers

  return new SparqlClient({
    endpointUrl: "http://example.org", fetch: mockFetch
  })
}

export function getTestPagedSparqlClient(basePath:string, threshold = 5): SparqlClient {

  const mockFetch = async function (fetchUrl: url.URL | string) {

    fetchUrl = fetchUrl instanceof url.URL ? fetchUrl : new url.URL(fetchUrl)
    const query = fetchUrl.searchParams.get('query')

    if (!query) {
      return new Response('No query parameter', {status: 400})
    }

    const match = query.match(/OFFSET\s+(\d+)\s+LIMIT\s+(\d+)$/);
    let limitValue = threshold, offsetValue = 0
    if (match) {
        offsetValue = parseInt(match[1], 10); // Convert the captured string to an integer
        limitValue = parseInt(match[2], 10); // Convert the captured string to an integer
    } 
    const body = getTestFile(basePath + `-offset-${offsetValue}-limit-${limitValue}.ttl`)

    return new Response(Readable.from(body), {
      headers: new Headers({'Content-Type': 'text/turtle'}),
      status: 200
    })
  }
  mockFetch.Headers = Headers

  return new SparqlClient({
    endpointUrl: "http://example.org", fetch: mockFetch
  })
}

export function compileEmptyTemplate(res: Resource) {
  return res.queryTemplate != null ? res.queryTemplate({}) : "";
}
