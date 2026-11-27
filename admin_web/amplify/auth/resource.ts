import { defineAuth } from '@aws-amplify/backend';

/**
 * Define and configure Cognito authentication with an ADMINS group
 * for the Fleet Operations Console.
 * @see https://docs.amplify.aws/gen2/build-a-backend/auth
 */
export const auth = defineAuth({
  loginWith: {
    email: true,
  },
  groups: ['ADMINS'],
});
