import { defineFunction } from '@aws-amplify/backend';

export const transitGateway = defineFunction({
  name: 'transit-gateway',
  entry: './handler.ts',
  resourceGroupName: 'data',
  runtime: 22,
  timeoutSeconds: 15,
});
