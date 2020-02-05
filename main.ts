import { ApolloServer } from 'apollo-server';
import { readFileSync } from 'fs';

import { isListType } from './utils';
import { ResourceEntry } from './resource';
import { unwrapCompositeType } from './utils';
import Resources from './resources';
import SchemaLoader from './schema-loader';

type ResourceResolver = (parent: ResourceEntry, args: object) => Promise<ResourceEntry | ResourceEntry[]>;

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

resources.root.forEach(resource => {
  const fieldResolvers: Record<string, ResourceResolver> = resourceResolvers[resource.definition.name.value] = {};

  (resource.definition.fields || []).forEach(field => {
    if (!resources.isUserDefined(field.type)) { return; }

    const resourceName = unwrapCompositeType(field.type).name.value;
    const resource     = resources.lookup(resourceName);
    if (!resource.isRootType) { return; }

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
