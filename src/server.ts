import express from 'express';
import { graphqlExpress, graphiqlExpress } from 'apollo-server-express';
import { express as middleware } from 'graphql-voyager/middleware';
import bodyParser from 'body-parser';

import * as Schema from './schema';

const PORT = 3000;
const server = express();

const schemaFunction =
  Schema.schemaFunction ||
  function() {
    return Schema.schema;
  };
let schema;
const rootFunction =
  Schema.rootFunction ||
  function() {
    return schema.rootValue;
  };
const contextFunction =
  Schema.context ||
  function(headers, secrets) {
    return Object.assign(
      {
        headers: headers,
      },
      secrets,
    );
  };

server.use(
  '/graphql',
  bodyParser.json(),
  graphqlExpress(async request => {
    if (!schema) {
      schema = schemaFunction(process.env);
    }
    const context = await contextFunction(request.headers, process.env);
    const rootValue = await rootFunction(request.headers, process.env);

    return {
      schema: await schema,
      rootValue,
      context,
      tracing: true,
      debug: true,
    };
  }),
);

server.use(
  '/graphiql',
  graphiqlExpress({
    endpointURL: '/graphql',
    query: `# Welcome to GraphiQL

{
  users {
    id
    name
    # this next bit is only one extra db call
    posts {
      id
      title
    }
  }
}
`,
  }),
);

server.use('/voyager', middleware({ endpointUrl: '/graphql' }));

server.listen(PORT, () => {
  console.log(
    `GraphQL Server is now running on http://localhost:${PORT}/graphql`,
  );
  console.log(`View GraphiQL at http://localhost:${PORT}/graphiql`);
});
