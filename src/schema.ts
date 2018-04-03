import {
  SchemaDirectiveVisitor,
  makeExecutableSchema,
  IResolvers,
} from 'graphql-tools';
import DataLoader from 'dataloader';
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
import { posts, users } from './data';
import {
  deprecated,
  DebugDirective,
  TraceDirective,
  UseDirective,
} from './directives';

const gql = String.raw;

const createLoaderDirective = (load: DataLoader.BatchLoadFn<any, any>) => {
  const instance = new DataLoader(load);
  const regex = /{(.*?)}/g;
  return class DataloaderDirective extends SchemaDirectiveVisitor {
    visitFieldDefinition(field: GraphQLField<any, any>) {
      const defaultResolver = (res: any) => res;
      const resolve = field.resolve || defaultResolver;

      field.resolve = (root, args, context, info: any) => {
        let key;

        if (this.args.id) {
          const id = this.args.id as string;
          // key.replace(':', '$');
          const test = /({(.*?)}.?)+/;
          const keys = [];
          // let result = regex.exec(key);
          // while (result) {
          //   keys.push(result[1]);
          //   result = regex.exec(key);
          // }
          const str = id.split(regex);
          // console.log('split', str);
          key = str
            .map((elem, i) => {
              if (i % 2 === 1) {
                console.log('elem', elem, root[elem], args[elem]);
                if (elem.startsWith('$')) {
                  return args[elem.substring(1)];
                } else {
                  return root[elem] || args[elem];
                }
              }
              return elem;
            })
            .join('');
        } else if (this.args.root) {
          key = root[this.args.root];
        } else if (this.args.args) {
          key = args[this.args.root];
        } else if (this.args.context) {
          key = context[this.args.context];
        } else if (this.args.info) {
          key = info[this.args.info];
        }

        if (Array.isArray(key)) {
          return instance
            .loadMany(key)
            .then(val => resolve(val, args, context, info));
        } else {
          return instance
            .load(key)
            .then(val => resolve(val, args, context, info));
        }

        // console.log('key', key);
        // if (field.astNode) {
        //   switch (field.astNode.type.kind) {
        //     case 'ListType':
        //       return instance
        //         .loadMany(key || ['res_0'])
        //         .then(res => {
        //           console.log('load', res);
        //           return res;
        //         })
        //         .then(val => resolve(val, args, context, info));
        //     case 'NamedType':
        //       return instance
        //         .load(key || 'res_1')
        //         .then(res => {
        //           console.log('load', res);
        //           return res;
        //         })
        //         .then(val => resolve(val, args, context, info));
        //     case 'NonNullType':
        //       if (field.astNode.type.type.kind === 'ListType') {
        //         return instance
        //           .loadMany(key || ['res_0'])
        //           .then(res => {
        //             console.log('load', res);
        //             return res;
        //           })
        //           .then(val => resolve(val, args, context, info));
        //       } else {
        //         return instance
        //           .load(key || 'res_1')
        //           .then(res => {
        //             console.log('load', res);
        //             return res;
        //           })
        //           .then(val => resolve(val, args, context, info));
        //       }
        //   }
        // }
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
    id: ID! @deprecated(reason: "too lit")
    name: String @deprecated
    posts: [Post]! @load(root: "postsIds")
    game: Game! @load(args: "gameId")

    #pulls from root value first, then from the arguments, unless prefixed with $
    fortune: Fortune! @get(id: "fortunes/{id}")
    fortune_(lol: String!): Fortune! @get(id: "fortunes/{lol}")
    fortune_arg(id: String!): Fortune! @get(id: "fortunes/{$id}")

    #\${} unfortunately fails to lex
    fortune_root: Fortune! @get(id: "fortunes/{root.id}")
    fortune_args(id: String!): Fortune! @get(id: "fortunes/{args.id}")
    fortune_context: Fortune! @get(id: "fortunes/{context.id}")
    fortune_info: Fortune! @get(id: "fortunes/{info.id}")

    #These would be directly referenced: i.e. root.id
    fortune_root: Fortune! @get(root: "id")
    fortune_args(id: String!): Fortune! @get(args: "id")
    fortune_context: Fortune! @get(context: "id")
    fortune_info: Fortune! @get(id: "id")

    fortunes: [Fortune]! @get(id: "fortunes")
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
    // posts: root => root,
    // fortunes: root => root,
    // fortunes: () => {
    //   return fetch('http://fortunecookieapi.herokuapp.com/v1/cookie')
    //     .then(res => res.json())
    //     .then(res => {
    //       return res[0].fortune.message;
    //     });
    // },
  },
  Fortune: {
    // msg: msg => {
    //   // console.trace();
    //   return msg;
    // },
  },
};

const findByIds = (ids: Array<any>) => {
  console.log(`Find by ids ${ids}.`);
  // this would normally be a database call where you lookup multiple ids at once
  return Promise.resolve(posts.filter(post => ids.indexOf(post.id) > -1));
};

const fetcher = (url: string) => (ids: any[]) => {
  console.log(`Find by ids ${ids}.`);
  //could check if result is a String and just get text, otherwise return json
  return Promise.all(
    ids.map(id => {
      return (
        fetch(url + id)
          .then(res => res.text())
          // .then(res => {
          //   console.log(res);
          //   return res;
          // })
          .then(res => JSON.parse(res))
          .then(res => {
            if (!res.id) res.id = id;
            // console.log('fetched', res);
            return res;
          })
      );
    }),
  );
};

export const schema = makeExecutableSchema({
  typeDefs,
  resolvers,
  schemaDirectives: {
    deprecated: deprecated('default'),
    load: createLoaderDirective(findByIds),
    get: createLoaderDirective(
      fetcher('http://fortunecookieapi.herokuapp.com/v1/'),
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
