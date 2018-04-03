const bob = {
  id: 1,
  name: 'Bob',
  postsIds: [2, 3, 4, 5],
};

const sam = {
  id: 2,
  name: 'Sam',
  postsIds: [1],
};

const stephen = {
  id: 3,
  name: 'Stephen',
  postsIds: [3, 4],
};

const pete = {
  id: 4,
  name: 'Pete',
  postsIds: [5],
};

const chris = {
  id: 5,
  name: 'Chris',
  postsIds: [3],
};

const josh = {
  id: 6,
  name: 'Josh',
  postsIds: [1, 5],
};

const hello = {
  id: 1,
  title: 'hello from the future',
};
const graphql = {
  id: 2,
  title: 'graphql is great',
};
const engine = {
  id: 3,
  title: 'apollo engine is amazing!',
};
const support = {
  id: 4,
  title: 'the support subscription is super helpful',
};
const fast = {
  id: 5,
  title: 'look how fast our app is now!',
};

// think of these like db tables where the join is from user => post on postsIds
export const users = [bob, sam, stephen, pete, chris, josh];
export const posts = [hello, graphql, engine, support, fast];
