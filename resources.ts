import { ObjectTypeDefinitionNode } from 'graphql';

import Resource from './resource';

export default class Resources {
  all: Array<Resource>;

  constructor(resourceTypeDefs: ObjectTypeDefinitionNode[]) {
    this.all = resourceTypeDefs.map(def => Resource.buildFromTypeDefinition(def));
  }

  lookup(name: string): Resource {
    const resource = this.all.find((resource: Resource) => resource.definition.name.value === name);

    if (!resource) {
      throw new Error(`resource ${name} not found`);
    }

    return resource;
  }
}
