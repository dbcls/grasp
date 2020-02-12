import { ApolloServer } from 'apollo-server';

import { isListType } from './utils';
import { ResourceEntry } from './resource';
import { unwrapCompositeType } from './utils';
import Resources from './resources';
import SchemaLoader from './schema-loader';

type ResourceResolver = (parent: ResourceEntry, args: object) => Promise<ResourceEntry | ResourceEntry[] | null>;

SchemaLoader.loadFrom('./resources').then(loader => {
  const resources = new Resources(loader.resourceTypeDefs);

  const queryResolvers: Record<string, ResourceResolver> = {};

  (loader.queryDef.fields || []).forEach(field => {
    queryResolvers[field.name.value] = async (_parent, args) => {
      const resourceName = unwrapCompositeType(field.type).name.value;
      const resource     = resources.lookup(resourceName);
      if (!resource) {
        throw new Error(`resource ${resourceName} is not found`);
      }

      return await resource.fetch(args, !isListType(field.type));
    }
  });

  const resourceResolvers: Record<string, Record<string, ResourceResolver>> = {};

  resources.all.forEach(resource => {
    const fieldResolvers: Record<string, ResourceResolver> = resourceResolvers[resource.definition.name.value] = {};

    (resource.definition.fields || []).forEach(field => {
      const type = field.type;
      const name = field.name.value;

      const resourceName = unwrapCompositeType(type).name.value;
      const resource     = resources.lookup(resourceName);

      if (!resource || resource.isEmbeddedType) { return; }

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
});
