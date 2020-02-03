import { ApolloServer } from 'apollo-server';
import { readFileSync } from 'fs';
import Handlebars = require('handlebars');

import { isListType } from './utils';
import { ResourceEntry } from './resource';
import { unwrapCompositeType } from './utils';
import Resources from './resources';
import SchemaLoader from './schema-loader';

type ResourceResolver = (parent: ResourceEntry, args: object) => Promise<ResourceEntry | ResourceEntry[]>;

Handlebars.registerHelper('filter-by-iri', function(this: {iri: string | string[]}): string {
  if (Array.isArray(this.iri)) {
    const refs = this.iri.map(iri => `<${iri}>`);
    return `FILTER (?iri IN (${refs.join(', ')}))`;
  } else {
    return `FILTER (?iri = <${this.iri}>)`;
  }
});

const loader = new SchemaLoader(readFileSync('./index.graphql', 'utf8'));
const resources = new Resources(loader.resourceTypeDefs);

const queryResolvers: Record<string, ResourceResolver> = {};

(loader.queryDef.fields || []).forEach(field => {
  queryResolvers[field.name.value] = async (_parent, args) => {
    const resourceName = unwrapCompositeType(field.type).name.value;
    const resource     = resources.lookup(resourceName);

    return await resource.fetch(args, !isListType(field.type));
  }
});

const resourceResolvers: Record<string, Record<string, ResourceResolver>> = {};

resources.all.forEach(resource => {
  const fieldResolvers: Record<string, ResourceResolver> = resourceResolvers[resource.definition.name.value] = {};

  (resource.definition.fields || []).forEach(field => {
    if (!loader.isUserDefined(field.type)) { return; }

    const resourceName = unwrapCompositeType(field.type).name.value;
    const resource     = resources.lookup(resourceName);

    fieldResolvers[field.name.value] = async (parent) => {
      const args = {iri: parent[field.name.value]};

      return await resource.fetch(args, !isListType(field.type));
    };
  });
});

const rootResolvers = {
  Query: queryResolvers,
  ...resourceResolvers
};

const port = process.env.PORT || 4000;

const server = new ApolloServer({
  typeDefs: loader.originalTypeDefs,
  resolvers: rootResolvers
});

server.listen({ port }).then(({ url }) => {
  console.log(`🚀 Server ready at ${url}`);
});
