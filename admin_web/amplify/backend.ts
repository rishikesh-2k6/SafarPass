import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { transitGateway } from './functions/transit-gateway/resource';

export const backend = defineBackend({
  auth,
  data,
  transitGateway,
});

export { data };
