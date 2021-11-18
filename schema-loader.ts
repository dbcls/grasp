import fs from 'fs';
import { ObjectTypeDefinitionNode, TypeNode, DocumentNode } from 'graphql';
import { join } from 'path';
import { parse } from 'graphql/language/parser';

const {readdir, readFile} = fs.promises;

export default class SchemaLoader {
  originalTypeDefs: DocumentNode;
  queryDef: ObjectTypeDefinitionNode;
  resourceTypeDefs: Array<ObjectTypeDefinitionNode>;

  constructor(graphql: string) {
    this.originalTypeDefs = parse(graphql);

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
   * Read all GraphQL schema files in resources directory and concatenate to string
   * 
   * @param baseDir Resources directory with graphql schema files
   * @returns SchemaLoader object as promise
   */
  static async loadFrom(baseDir: string): Promise<SchemaLoader> {
    let schema = '';

    for (const path of await readdir(baseDir)) {
      if (!/^[0-9a-zA-Z].*\.graphql$/.test(path)) { continue; }

      schema += await readFile(join(baseDir, path));
    }

    return new SchemaLoader(schema);
  }
}
