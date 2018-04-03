import {
  SchemaDirectiveVisitor,
  makeExecutableSchema,
  IResolvers,
} from 'graphql-tools';
import DataLoader from 'dataloader';
import fetch from 'node-fetch';
import {
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
import { posts, users } from './data';

const gql = String.raw;

const deprecated = (defaultMessage: string) => {
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
      thing.deprecationReason = this.args.reason || defaultMessage;
    }
  };
};

class DebugDirective extends SchemaDirectiveVisitor {
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

class UseDirective extends SchemaDirectiveVisitor {
  visitFieldDefinition(field: GraphQLField<any, any>) {
    const resolve = field.resolve || defaultFieldResolver;
    field.resolve = (root, args, context, info) => {
      console.log('use', root[this.args.key]);
      return resolve(root[this.args.key], args, context, info);
    };
  }
}

class TraceDirective extends SchemaDirectiveVisitor {
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

const dataloader = (load: DataLoader.BatchLoadFn<any, any>) => {
  const instance = new DataLoader(load);
  return class DataloaderDirective extends SchemaDirectiveVisitor {
    visitFieldDefinition(field: GraphQLField<any, any>) {
      const resolve = field.resolve || defaultFieldResolver;
      field.resolve = (root, args, context, info: any) => {
        let key;
        if (this.args.id) {
          key = this.args.id;
        } else if (this.args.root) {
          key = root[this.args.root];
        } else if (this.args.args) {
          key = args[this.args.root];
        } else if (this.args.context) {
          key = context[this.args.context];
        } else if (this.args.info) {
          key = info[this.args.info];
        }

        if (field.astNode) {
          switch (field.astNode.type.kind) {
            case 'ListType':
              return instance
                .loadMany(key)
                .then(res => {
                  console.log('load', res);
                  return res;
                })
                .then(val => resolve(val, args, context, info));
            case 'NamedType':
              return instance
                .load(key || 1)
                .then(res => {
                  console.log('load', res);
                  return res;
                })
                .then(val => resolve(val, args, context, info));
            case 'NonNullType':
              if (field.astNode.type.type.kind === 'ListType') {
                return instance
                  .loadMany(key)
                  .then(res => {
                    console.log('load', res);
                    return res;
                  })
                  .then(val => resolve(val, args, context, info));
              } else {
                return instance
                  .load(key || 1)
                  .then(res => {
                    console.log('load', res);
                    return res;
                  })
                  .then(val => resolve(val, args, context, info));
              }
          }
        }
      };
    }
  };
};

const typeDefs = gql`
  type Post {
    id: ID!
    title: String
  }

  type Game {
    id: ID!
    title: String
  }

  type Fortune {
    id: ID!
    msg: String @use(key: "message")
  }

  type User {
    id: ID! @deprecated(reason: "lol")
    name: String @deprecated(reason: "lol")
    posts: [Post]! @load(root: "postsIds") @log
    game: Game! @load(args: "gameId") @log
    fortune: Fortune! @getFortune @log @stack
    fortunes: [Fortune]! @getFortune @use(key: "fortune") @log @stack
  }

  type Query {
    users(gameId: Int!): [User] @cacheControl(maxAge: 36000)
  }
`;

const resolvers: IResolvers = {
  Query: {
    users: (root, args, context) => {
      // execute some data request to return a set of users
      // call number one to the db
      return Promise.resolve(users);
    },
  },
  User: {
    posts: root => root,
    // fortunes: () => {
    //   return fetch('http://fortunecookieapi.herokuapp.com/v1/cookie')
    //     .then(res => res.json())
    //     .then(res => {
    //       return res[0].fortune.message;
    //     });
    // },
  },
  Fortune: {
    msg: msg => {
      console.log('msg', msg);
      console.trace();
      return msg;
    },
  },
};

const findByIds = (ids: Array<any>) => {
  console.log(`Find by ids ${ids}.`);
  // this would normally be a database call where you lookup multiple ids at once
  return Promise.resolve(posts.filter(post => ids.indexOf(post.id) > -1));
};

const fetcher = (url: string) => (ids: any) => {
  console.log(`Find by ids ${ids}.`);
  //could check if result is a String and just get text, otherwise return json
  return (
    fetch(url)
      .then(res => res.text())
      // .then(res => {
      //   console.log(res);
      //   return res;
      // })
      .then(res => JSON.parse(res))
      .then(res => {
        console.log('fetched', res);
        return res;
      })
  );
};

export const schema = makeExecutableSchema({
  typeDefs,
  resolvers,
  schemaDirectives: {
    deprecated: deprecated('default'),
    load: dataloader(findByIds),
    getFortune: dataloader(
      fetcher('http://fortunecookieapi.herokuapp.com/v1/cookie'),
    ),
    log: DebugDirective,
    use: UseDirective,
    stack: TraceDirective,
  },
});

export function context() {
  return {
    // Intitialize the dataloader with the batch function.
    // Note, we create a new DataLoader per request to ensure the cache is flushed.
    loader: new DataLoader(findByIds),
  };
}
