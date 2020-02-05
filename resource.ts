import { ObjectTypeDefinitionNode } from 'graphql';
import { URLSearchParams } from 'url';
import fetch from 'node-fetch';
import groupBy = require('lodash.groupby');
import Handlebars = require('handlebars');
import mapValues = require('lodash.mapvalues');

import { oneOrMany, isListType, unwrapCompositeType } from './utils';
import Resources from './resources';

type CompiledTemplate = (args: object) => string;
type Binding = Record<string, any>;
export type ResourceEntry = Record<string, any>;

const handlebars = Handlebars.create();

function wrapIRI(iri: string): string {
  return iri.startsWith("_:") ? iri : `<${iri}>`;
}

handlebars.registerHelper('filter-by-iri', function(this: {iri: string | string[]}): string {
  if (Array.isArray(this.iri)) {
    const refs = this.iri.map(wrapIRI);
    return `FILTER (?iri IN (${refs.join(', ')}))`;
  } else {
    return `FILTER (?iri = ${wrapIRI(this.iri)})`;
  }
});

export default class Resource {
  resources: Resources;
  definition: ObjectTypeDefinitionNode;
  endpoint: string | null;
  queryTemplate: CompiledTemplate | null;

  constructor(resources: Resources, definition: ObjectTypeDefinitionNode, endpoint: string | null, sparql: string | null) {
    this.resources     = resources;
    this.definition    = definition;
    this.endpoint      = endpoint;
    this.queryTemplate = sparql ? handlebars.compile(sparql, {noEscape: true}) : null;
  }

  static buildFromTypeDefinition(resources: Resources, def: ObjectTypeDefinitionNode): Resource {
    if (def.directives?.some(directive => directive.name.value === 'embedded')) {
      return new Resource(resources, def, null, null);
    }

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
    return new Resource(resources, def, endpoint, sparql);
  }

  async fetch(args: object, one: boolean): Promise<ResourceEntry[] | ResourceEntry> {
    const bindings = await this.query(args);

    const bindingGropuedByS = groupBy(bindings, 's');
    const primaryBindings = bindings.filter(binding => !binding.s.startsWith('_:'));

    const entries = Object.entries(groupBy(primaryBindings, 's')).map(([s, sBindings]) => {
      const entry: ResourceEntry = {};
      const pValues = mapValues(groupBy(sBindings, 'p'), bs => bs.map(({o}) => o));

      (this.definition.fields || []).forEach(field => {
        const targetType = unwrapCompositeType(field.type);
        if (this.resources.isUserDefined(targetType)) {
          const targetDef = this.resources.lookup(targetType.name.value);
          console.log(targetDef);

          // TODO
        }

        entry[field.name.value] = oneOrMany(pValues[field.name.value], !isListType(field.type));
      });

      return entry;
    });

    return oneOrMany(entries, one);
  }

  async query(args: object): Promise<Array<Binding>> {
    if (!this.queryTemplate || !this.endpoint) {
      throw new Error('query template and endpoint should be specified in order to query');
    }
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

  get isRootType(): boolean {
    return !this.definition.directives?.some(directive => directive.name.value === 'embedded');
  }
}
