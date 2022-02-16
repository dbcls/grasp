import {
  TypeNode,
  NamedTypeNode,
  ValueNode,
  ObjectTypeDefinitionNode,
  DirectiveNode,
} from "graphql";

export function isListType(type: TypeNode): boolean {
  switch (type.kind) {
    case "NamedType":
      return false;
    case "ListType":
      return true;
    case "NonNullType":
      return isListType(type.type);
  }
}

export function oneOrMany<T>(xs: T[], one: boolean): T | T[] {
  return one ? xs[0] : xs;
}

export function unwrapCompositeType(type: TypeNode): NamedTypeNode {
  switch (type.kind) {
    case "NamedType":
      return type;
    case "ListType":
    case "NonNullType":
      return unwrapCompositeType(type.type);
  }
}

export function hasDirective(
  def: ObjectTypeDefinitionNode,
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
  if (!value || value.kind !== "StringValue") return undefined;

  return value.value;
}

export function ensureArray<T>(obj: T | Array<T>): Array<T> {
  if (Array.isArray(obj)) {
    return obj;
  } else {
    return obj ? [obj] : [];
  }
}
