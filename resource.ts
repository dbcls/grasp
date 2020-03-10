import Handlebars = require('handlebars');
import fetch from 'node-fetch';
import groupBy = require('lodash.groupby');
import mapValues = require('lodash.mapvalues');
import transform = require('lodash.transform');
import { ObjectTypeDefinitionNode } from 'graphql';
import { URLSearchParams } from 'url';

import Resources from './resources';
import { oneOrMany, isListType, unwrapCompositeType, ensureArray } from './utils';

interface Triple {
  s: string;
  p: string;
  o: string;
}

type CompiledTemplate = (args: object) => string;
export type ResourceEntry = Record<string, any>;

const handlebars = Handlebars.create();

handlebars.registerHelper('filter-by-iri', function(this: {iri: string | string[]}): string {
  const iris = ensureArray(this.iri);

  if (iris.length === 0) { return ''; }

  const wrapped = iris.map(iri => `<${iri}>`);

  return `FILTER (?iri IN (${wrapped.join(', ')}))`;
});

handlebars.registerHelper('filter-by', function(this: any, obj: string | string[], options: Handlebars.HelperOptions): string {
  const values = ensureArray(obj);

  if (values.length === 0) { return ''; }

  const iris = options.fn ? values.map(v => options.fn(this, {blockParams: [v]}).trim()) : values;

  return `FILTER (?iri IN (${iris.join(', ')}))`;
});

function buildEntry(bindingsGroupedBySubject: Record<string, Array<Triple>>, subject: string, resource: Resource, resources: Resources): ResourceEntry {
    const entry: ResourceEntry = {};

    const pValues = transform(bindingsGroupedBySubject[subject], (acc, {p, o}: Triple) => {
      const k = p.replace(/^https:\/\/github\.com\/dbcls\/grasp\//, '');

      (acc[k] || (acc[k] = [])).push(o);
    }, {} as Record<string, string[]>);

    (resource.definition.fields || []).forEach(field => {
      const type   = field.type;
      const name   = field.name.value;
      const values = pValues[name] || [];

      const targetType = unwrapCompositeType(type);
      const targetResource = resources.lookup(targetType.name.value);

      if (targetResource?.isEmbeddedType) {
        const entries = values.map(nodeId => buildEntry(bindingsGroupedBySubject, nodeId, targetResource, resources));
        entry[name] = oneOrMany(entries, !isListType(type));
      } else {
        entry[name] = oneOrMany(values, !isListType(type));
      }
    });

    return entry;
}


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

  async fetch(args: object): Promise<ResourceEntry[]> {
    const bindings = await this.query(args);

    const bindingGropuedBySubject = groupBy(bindings, 's');
    const primaryBindings = bindings.filter(binding => !binding.s.startsWith('_:'));

    const entries = Object.entries(groupBy(primaryBindings, 's')).map(([s, _sBindings]) => {
      return buildEntry(bindingGropuedBySubject, s, this, this.resources);
    });

    return entries;
  }

  async fetchByIRIs(iris: ReadonlyArray<string>): Promise<Array<ResourceEntry | null>> {
    const entries = await this.fetch({iri: iris});
    return iris.map(iri => entries.find(entry => entry.iri === iri) || null);
  }

  async query(args: object): Promise<Array<Triple>> {
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

    const res = await fetch(this.endpoint, opts);

    if (res.ok) {
      const data = await res.json();

      return data.results.bindings.map((b: Record<string, any>) => {
        return mapValues(b, ({value}) => value);
      });
    } else {
      const body = await res.text();

      throw new Error(`SPARQL endpoint returns ${res.status} ${res.statusText}: ${body}`)
    }
  }

  get isRootType(): boolean {
    return !this.definition.directives?.some(directive => directive.name.value === 'embedded');
  }

  get isEmbeddedType(): boolean {
    return !this.isRootType;
  }
}
