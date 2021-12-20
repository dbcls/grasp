import { ObjectTypeDefinitionNode, TypeNode } from 'graphql';
import SparqlClient from "sparql-http-client";

import Resource from './resource';
import { unwrapCompositeType } from './utils';


export default class Resources {
  //TODO: split into root array and rest array for quicker lookup
  all: Resource[];

  constructor(resourceTypeDefs: ObjectTypeDefinitionNode[], serviceIndex?: Map<string, SparqlClient>, templateIndex?:Map<string, string>) {
    this.all = resourceTypeDefs.map(def => Resource.buildFromTypeDefinition(this, def, serviceIndex, templateIndex));
  }
  
  /**
   * Getter for all root resources
   */
  get root(): Resource[] {
    return this.all.filter(resource => resource.isRootType)
  }

  /**
   * Get a resource by name
   * @param name 
   * @returns 
   */
  lookup(name: string): Resource | null {
    return this.all.find(resource => resource.definition.name.value === name) || null;
  }

  /**
   * Check whether this type is defined by a user
   * @param type 
   * @returns 
   */
  isUserDefined(type: TypeNode): boolean {
    const unwrapped = unwrapCompositeType(type);

    return this.all.some(resource => resource.definition.name.value === unwrapped.name.value);
  }
}
