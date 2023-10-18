import { ObjectTypeDefinitionNode, TypeNode, UnionTypeDefinitionNode } from 'graphql';
import SparqlClient from "sparql-http-client";

import Resource, { IResource } from './resource.js';
import { unwrapCompositeType } from './utils.js';
import logger from "./logger.js";


export default class Resources {
  //TODO: split into root array and rest array for quicker lookup
  all: IResource[];

  constructor(resourceTypeDefs: ReadonlyArray<ObjectTypeDefinitionNode>, unionTypeDefs: ReadonlyArray<UnionTypeDefinitionNode> = [], serviceIndex?: Map<string, SparqlClient>, templateIndex?:Map<string, string>) {
    this.all = resourceTypeDefs.map(def => Resource.buildFromTypeDefinition(this, def, serviceIndex, templateIndex));
    //this.all.push(unionTypeDefs.map(def => UnionResource.buildFromUnionTypeDefinition(this,def)))
  }
  
  /**
   * Getter for all root resources
   */
  get root(): IResource[] {
    return this.all.filter(resource => resource.isRootType)
  }

  /**
   * Get a resource by name
   * @param name 
   * @returns 
   */
  lookup(name: string): IResource | null {
    return this.all.find(resource => resource.name === name) || null;
  }

  /**
   * Check whether this type is defined by a user
   * @param type 
   * @returns 
   */
  isUserDefined(type: TypeNode): boolean {
    const unwrapped = unwrapCompositeType(type);

    return this.all.some(resource => resource.name === unwrapped.name.value);
  }
}
