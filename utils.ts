import { TypeNode, NamedTypeNode } from 'graphql';

export function isListType(type: TypeNode): boolean {
  switch (type.kind) {
    case 'NamedType':
      return false;
    case 'ListType':
      return true;
    case 'NonNullType':
      return isListType(type.type);
    default:
      throw new Error(`unsupported type: ${(type as TypeNode).kind}`);
  }
}

export function oneOrMany<T>(xs: T[], one: boolean): T | T[] {
  return one ? xs[0] : xs;
}

export function unwrapCompositeType(type: TypeNode): NamedTypeNode {
  switch (type.kind) {
    case 'NamedType':
      return type;
    case 'ListType':
    case 'NonNullType':
      return unwrapCompositeType(type.type);
    default:
      throw new Error(`unsupported type: ${(type as TypeNode).kind}`);
  }
}