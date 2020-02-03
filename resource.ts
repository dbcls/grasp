import { ObjectTypeDefinitionNode } from 'graphql';
import { URLSearchParams } from 'url';
import fetch from 'node-fetch';
import groupBy = require('lodash.groupby');
import Handlebars = require('handlebars');
import mapValues = require('lodash.mapvalues');

import {oneOrMany, isListType} from './utils';

type CompiledTemplate = (args: object) => string;
type Binding = Record<string, any>;
export type ResourceEntry = Record<string, any>;

export default class Resource {
  definition: ObjectTypeDefinitionNode;
  endpoint: string;
  queryTemplate: CompiledTemplate;

  constructor(definition: ObjectTypeDefinitionNode, endpoint: string, sparql: string) {
    this.definition    = definition;
    this.endpoint      = endpoint;
    this.queryTemplate = Handlebars.compile(sparql, { noEscape: true });
  }

  static buildFromTypeDefinition(def: ObjectTypeDefinitionNode): Resource {
    if (!def.description) {
      throw new Error(`description for type ${def.name.value} is not defined`);
    }
    const description = def.description.value;
    const lines = description.split(/\r?\n/);

    let endpoint: string | null = null,
      sparql = '';

    enum State {
      Default,
        Endpoint,
        Sparql,
    };
    let state: State = State.Default;

    lines.forEach((line: string) => {
      switch (line) {
        case '--- endpoint ---':
          state = State.Endpoint;
          return;
        case '--- sparql ---':
          state = State.Sparql;
          return;
      }

      switch (state) {
        case State.Endpoint:
          endpoint = line;
          state = State.Default;
          break;
        case State.Sparql:
          sparql += line + '\n';
          break;
      }
    });

    if (!endpoint) {
      throw new Error(`endpoint is not defined for type ${def.name.value}`);
    }
    return new Resource(def, endpoint, sparql);
  }

  async fetch(args: object, one: boolean): Promise<ResourceEntry[] | ResourceEntry> {
    const bindings = await this.query(args);

    const entries = Object.entries(groupBy(bindings, 's')).map(([_s, sBindings]) => {
      const entry: ResourceEntry = {};
      const pValues = mapValues(groupBy(sBindings, 'p'), bs => bs.map(({o}) => o));

      (this.definition.fields || []).forEach(field => {
        entry[field.name.value] = oneOrMany(pValues[field.name.value], !isListType(field.type));
      });

      return entry;
    });

    return oneOrMany(entries, one);
  }

  async query(args: object): Promise<Array<Binding>> {
    const sparqlQuery = this.queryTemplate(args);

    console.log('--- SPARQL QUERY ---', sparqlQuery);

    const sparqlParams = new URLSearchParams();
    sparqlParams.append('query', sparqlQuery);

    const opts = {
      method: 'POST',
      body: sparqlParams,
      headers: {
        Accept: 'application/sparql-results+json'
      }
    };
    const data = await fetch(this.endpoint, opts).then(res => res.json());
    console.log('--- SPARQL RESULT ---', JSON.stringify(data, null, '  '));

    return data.results.bindings.map((b: Binding) => {
      return mapValues(b, ({value}) => value);
    });
  }
}
