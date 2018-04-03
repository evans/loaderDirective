import {
  SchemaDirectiveVisitor,
  makeExecutableSchema,
  IResolvers,
} from 'graphql-tools';
import fetch from 'node-fetch';
import {
  GraphQLResolveInfo,
  GraphQLArgument,
  GraphQLDirective,
  GraphQLEnumType,
  GraphQLEnumValue,
  GraphQLField,
  GraphQLInputField,
  GraphQLInputObjectType,
  GraphQLInterfaceType,
  GraphQLNamedType,
  GraphQLObjectType,
  GraphQLScalarType,
  GraphQLSchema,
  GraphQLUnionType,
  ListTypeNode,
  NamedTypeNode,
  NonNullTypeNode,
  defaultFieldResolver,
} from 'graphql';

export const deprecated = (defaultMessage: string) => {
  return class DeprecatedDirective extends SchemaDirectiveVisitor {
    visitObject(object: GraphQLObjectType) {
      this._deprecate(object);
    }

    visitFieldDefinition(field: GraphQLField<any, any>) {
      this._deprecate(field);
    }

    visitEnumValue(value: GraphQLEnumValue) {
      this._deprecate(value);
    }

    _deprecate(thing: any) {
      // Add some metadata to the object that the GraphQL server
      // can use later to display deprecation warnings.
      thing.isDeprecated = true;
      console.log('reason', this.args.reason);
      thing.deprecationReason = this.args.reason || defaultMessage;
    }
  };
};

interface ResolverArguments {
  root: any;
  directiveArgs: { [argName: string]: any };
  resolverArgs: { [argName: string]: any };
  context: any;
  info: GraphQLResolveInfo;
  field: GraphQLField<any, any>;
}

type DirectiveResolver = (src: any, options: ResolverArguments) => any;

const createStack = (stack: Array<DirectiveResolver>) =>
  class DirectiveStack extends SchemaDirectiveVisitor {
    visitFieldDefinition(field: GraphQLField<any, any>) {
      const defaultResolver = (res: any) => res;
      const resolve = field.resolve || defaultResolver;
      field.resolve = (root, args, context, info) => {
        return stack.reduce(
          (prev, next) =>
            prev.then(res =>
              next(res, {
                root,
                resolverArgs: args,
                directiveArgs: this.args,
                context,
                info,
                field,
              }),
            ),
          Promise.resolve(resolve(root, args, context, info)),
        );
      };
    }
  };

const debug: DirectiveResolver = (
  res,
  { root, resolverArgs, context, info, field, directiveArgs },
) => {
  console.group(`resolver ${field.name}`);
  console.log('root', root);
  console.log('args', resolverArgs);
  // console.log('context', context);
  // console.log('info', info);
  console.groupEnd();
  return res;
};

export class DebugDirective extends SchemaDirectiveVisitor {
  visitFieldDefinition(field: GraphQLField<any, any>) {
    const resolve = field.resolve || defaultFieldResolver;
    field.resolve = (root, args, context, info) => {
      console.group(`resolver ${field.name}`);
      console.log('root', root);
      console.log('args', args);
      // console.log('context', context);
      // console.log('info', info);
      console.groupEnd();

      return resolve
        ? resolve(root, args, context, info)
        : root[info.fieldName];
    };
  }
}

const use: DirectiveResolver = (
  res,
  { root, resolverArgs, context, info, field, directiveArgs },
) => {
  if (res[directiveArgs.key]) {
    console.log('use', res[directiveArgs.key]);
    return res[directiveArgs.key];
  } else {
    console.log('use', root[directiveArgs.key]);
    return root[directiveArgs.key];
  }
};

export class UseDirective extends SchemaDirectiveVisitor {
  visitFieldDefinition(field: GraphQLField<any, any>) {
    const defaultResolver = (res: any) => res;
    const resolve = field.resolve || defaultResolver;
    // const resolve = field.resolve || defaultFieldResolver;
    field.resolve = (root, args, context, info) => {
      // console.log('use', root[this.args.key]);
      return resolve(root[this.args.key], args, context, info);
    };
  }
}

export class DefaultDirective extends SchemaDirectiveVisitor {}

export class TraceDirective extends SchemaDirectiveVisitor {
  visitFieldDefinition(field: GraphQLField<any, any>) {
    const resolve = field.resolve || defaultFieldResolver;
    field.resolve = (root, args, context, info) => {
      try {
        return resolve
          ? resolve(root, args, context, info)
          : root[info.fieldName];
      } catch (e) {
        // console.log(info.path, e);
        throw e;
      }
    };
  }
}
