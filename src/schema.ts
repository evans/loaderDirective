import {
  SchemaDirectiveVisitor,
  makeExecutableSchema,
  IResolvers,
} from 'graphql-tools';
import DataLoader from 'dataloader';
import fetch from 'node-fetch';
import { GraphQLField } from 'graphql';
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

      field.resolve = (root, args, context, info) => {
        let key;

        //This serves OPTION 1 and 2
        if (this.args.id) {
          const id = this.args.id as string;
          const test = /({(.*?)}.?)+/;
          const keys = [];
          const str = id.split(regex);
          key = str
            .map((elem, i) => {
              if (i % 2 === 1) {
                //OPTION 2
                if (
                  elem.startsWith('root.') ||
                  elem.startsWith('args.') ||
                  elem.startsWith('context.') ||
                  elem.startsWith('info.')
                ) {
                  return eval(elem);
                  //OPTION 1
                } else if (elem.startsWith('$')) {
                  return args[elem.substring(1)];
                } else {
                  return root[elem] || args[elem];
                }
              }
              return elem;
            })
            .join('');

          //OPTION 3
        } else if (this.args.root) {
          key = root[this.args.root];
        } else if (this.args.args) {
          key = args[this.args.root];
        } else if (this.args.context) {
          key = context[this.args.context];
        } else if (this.args.info) {
          key = (info as any)[this.args.info];
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
      };
    }
  };
};

const typeDefs = gql`
  type Post {
    id: ID!
    title: String
  }

  type Fortune {
    id: ID!
    msg: String @use(key: "message")
  }

  type User {
    id: ID!
    name: String

    #The directives here are used to generate the ids passed to dataloader
    #When dataloader is run, the returned value will be passed as the rootValue to the resolver function

    #OPTION 1
    #The key inside of {} is references root value first, then the arguments, unless prefixed with $
    v1_fortune: Fortune! @get(id: "fortunes/{id}")
    v1_fortune_var(var: String!): Fortune! @get(id: "fortunes/{var}")
    v1_fortune_arg(id: String!): Fortune! @get(id: "fortunes/{$id}")

    #The ids passed to dataloader for ^ are:
    #id = fortunes/\${root.id}
    #id = fortunes/\${args.var}
    #id = fortunes/\${args.id}

    #OPTION 2
    #We explicitly provide where we generate the id passed to dataloader
    v2_fortune_root: Fortune! @get(id: "fortunes/{root.id.hi}")
    v2_fortune_args(id: String!): Fortune! @get(id: "fortunes/{args.id}")
    v2_fortune_context: Fortune! @get(id: "fortunes/{context.id}")
    v2_fortune_info: Fortune! @get(id: "fortunes/{info.id}")

    #The ids passed to dataloader for ^ are:
    #id = fortunes/\${root.id}
    #id = fortunes/\${args.id}
    #id = fortunes/\${context.id}
    #id = fortunes/\${info.id}

    #OPTION 3
    #These would be directly referenced: i.e. root.id
    v3_fortune_root: Fortune! @get(root: "id")
    v3_fortune_args(id: String!): Fortune! @get(args: "id")
    v3_fortune_context: Fortune! @get(context: "id")
    v3_fortune_info: Fortune! @get(info: "id")

    #The ids passed to dataloader for ^ are:
    #id = \${root.id}
    #id = \${args.id}
    #id = \${context.id}
    #id = \${info.id}

    #Notes
    #\${} unfortunately fails to lex

    fortunes: [Fortune]! @get(id: "fortunes")
    posts: [Post]! @load(root: "postsIds")
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
};

const findByIds = (ids: Array<any>) => {
  console.log(`Find by ids ${ids}.`);
  // this would normally be a database call where you lookup multiple ids at once
  return Promise.resolve(posts.filter(post => ids.indexOf(post.id) > -1));
};

const fetcher = (url: string) => (ids: any[]) => {
  console.log(`Find by ids ${ids}.`);
  //could check if field requested is a String and just get text, otherwise return json
  return Promise.all(
    ids.map(id => {
      return fetch(url + id)
        .then(res => res.text())
        .then(res => JSON.parse(res))
        .then(res => {
          if (!res.id) res.id = id;
          // console.log('fetched', res);
          return res;
        });
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
    use: UseDirective,
  },
});
