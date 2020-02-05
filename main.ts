import { ApolloServer } from 'apollo-server';
import { readFileSync } from 'fs';

import { isListType } from './utils';
import { ResourceEntry } from './resource';
import { unwrapCompositeType } from './utils';
import Resources from './resources';
import SchemaLoader from './schema-loader';

type ResourceResolver = (parent: ResourceEntry, args: object) => Promise<ResourceEntry | ResourceEntry[] | null>;

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
    const type = field.type;
    const name = field.name.value;

    if (!resources.isUserDefined(type)) { return; }

    const resourceName = unwrapCompositeType(type).name.value;
    const resource     = resources.lookup(resourceName);

    if (!resource.isRootType) { return; }

    fieldResolvers[name] = async (parent) => {
      const value = parent[name];

      if (value) {
        return await resource.fetch({iri: value}, !isListType(type));
      }

      return isListType(type) ? [] : null;
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
