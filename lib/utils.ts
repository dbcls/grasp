import {
  TypeNode,
  NamedTypeNode,
  ValueNode,
  ObjectTypeDefinitionNode,
  DirectiveNode,
  Kind,
  TypeDefinitionNode
} from "graphql";
import isNull from 'lodash-es/isNull.js'
import logger from "./logger.js"

export function isListType(type: TypeNode): boolean {
  if (type.kind == Kind.NON_NULL_TYPE)
    return isListType(type.type);
  return type.kind == Kind.LIST_TYPE
}

export function isNonNullListType(type: TypeNode): boolean {
  if (type.kind == Kind.NON_NULL_TYPE)
    return isNonNullListType(type.type);
  if (type.kind == Kind.LIST_TYPE)
    return type.type.kind == Kind.NON_NULL_TYPE
  return false
}

export function oneOrMany<T>(xs: T[], type: TypeNode): T | T[] {
  if (isNonNullListType(type))
    return xs.filter((i) => {
      const itemIsNull: boolean = isNull(i)
      if (itemIsNull){
        logger.warn({type}, 'A null value was detected when resolving a GraphQL list with non-nullable items. This might indicate that a SPARQL query is not returning the desired triples.')
      }
      return !itemIsNull
    }
  );
  
  return !isListType(type) ? xs[0] : xs;
}

export function unwrapCompositeType(type: TypeNode): NamedTypeNode {
  return type.kind == Kind.NAMED_TYPE ? type : unwrapCompositeType(type.type);
}

export function hasDirective(
  def: TypeDefinitionNode,
  directiveName: string
): boolean {
  return (
    !!def.directives &&
    def.directives?.some((directive) => directive.name.value === directiveName)
  );
}

export function getDirective(
  def: ObjectTypeDefinitionNode,
  directiveName: string
): DirectiveNode | undefined {
  return def.directives?.find(
    (directive) => directive.name.value === directiveName
  );
}

export function getDirectiveArgumentValue(
  directive: DirectiveNode,
  argumentName: string
): string | undefined {
  const argument = directive.arguments?.find(
    (argument) => argument.name.value === argumentName
  );
  if (!argument) return undefined;
  return valueToString(argument.value);
}

export function valueToString(value: ValueNode): string | undefined {
  return (!value || value.kind !== Kind.STRING) ? undefined : value.value;
}

export function ensureArray<T>(obj?: T | Array<T>): Array<T> {
  if (Array.isArray(obj)) {
    return obj;
  }
  return obj ? [obj] : [];
}

export function ntriplesLiteral(strs: string | string[]): string[] {
  return ensureArray(strs).map((str) => `"${str}"`);
}

export function ntriplesIri(strs: string | string[]): string[] {
  return ensureArray(strs).map((str) => `<${str}>`);
}
