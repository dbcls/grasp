import fs from 'fs';
import { ObjectTypeDefinitionNode, TypeNode, DocumentNode } from 'graphql';
import { join } from 'path';
import { parse } from 'graphql/language/parser';

const {readdir, readFile} = fs.promises;

export default class SchemaLoader {
  originalTypeDefs: DocumentNode;
  queryDef: ObjectTypeDefinitionNode;
  resourceTypeDefs: ObjectTypeDefinitionNode[];

  constructor(schema: string) {
    this.originalTypeDefs = parse(schema);

    const typeDefinitionNodes = this.originalTypeDefs.definitions.filter((def): def is ObjectTypeDefinitionNode => {
      return def.kind === 'ObjectTypeDefinition';
    });

    const queryDef = typeDefinitionNodes.find(def => def.name.value === 'Query');
    if (!queryDef) {
      throw new Error('Query is not defined');
    }
    this.queryDef = queryDef;

    this.resourceTypeDefs = typeDefinitionNodes.filter(def => def.name.value !== 'Query');
  }

  /**
   * Read all GraphQL schema files in resources directory and concatenate to a single schema string
   * 
   * @param baseDir Resources directory with graphql schema files
   * @returns SchemaLoader object as promise
   */
  static async loadFromDirectory(baseDir: string): Promise<SchemaLoader> {
    let schema = '';

    for (const path of await readdir(baseDir)) {
      if (!/^[0-9a-zA-Z].*\.graphql$/.test(path)) { continue; }

      schema += await readFile(join(baseDir, path), {encoding: 'utf-8'});
    }

    return new SchemaLoader(schema);
  }

  /**
   * Read GraphQL schema from a single schema file
   * 
   * @param baseDir Resources directory with graphql schema files
   * @returns SchemaLoader object as promise
   */
     static async loadFromFile(path: string): Promise<SchemaLoader> {
      let schema: string = await readFile(path, {encoding: 'utf-8'});
  
      return new SchemaLoader(schema);
    }
}
