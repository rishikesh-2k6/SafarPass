import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { transitGateway } from '../functions/transit-gateway/resource';

const schema = a
  .schema({
    // Server-only signing key storage; inherits only schema-level transitGateway access
    SystemSecret: a
      .model({
        keyId: a.id().required(),
        secretValue: a.string().required(),
      })
      .identifier(['keyId']),

    // Bus fleet registry; qrSecret is protected from public API callers
    Bus: a
      .model({
        busId: a.id().required(),
        routeName: a.string().required(),
        capacity: a.integer().default(45),
        qrSecret: a.string().required(),
        isActive: a.boolean().default(true),
      })
      .identifier(['busId'])
      .authorization((allow) => [allow.group('ADMINS')]),

    // User registry; stores salted SHA-256 pinHash and lockout counters, never cleartext PINs
    UserProfile: a
      .model({
        userId: a.id().required(),
        loginId: a.string().required(),
        pinHash: a.string().required(),
        fullName: a.string().required(),
        role: a.string().required(),
        assignedBusId: a.string(),
        parentOfStudentId: a.string(),
        feePaid: a.boolean().default(true),
        failedAttempts: a.integer().default(0),
        lockedUntil: a.datetime(),
      })
      .identifier(['userId'])
      .secondaryIndexes((index) => [
        index('loginId'),
        index('assignedBusId'),
      ])
      .authorization((allow) => [allow.group('ADMINS')]),

    Trip: a
      .model({
        busId: a.string().required(),
        driverId: a.string().required(),
        status: a.string().required(),
        startedAt: a.datetime(),
        endedAt: a.datetime(),
      })
      .secondaryIndexes((index) => [index('busId'), index('status')])
      .authorization((allow) => [
        allow.group('ADMINS'),
        allow.publicApiKey().to(['read']),
      ]),

    // Anonymous live bus coordinates/speed/occupancy; writes gated via transitGateway or ADMINS
    BusLocation: a
      .model({
        busId: a.id().required(),
        tripId: a.string().required(),
        lat: a.float().required(),
        lng: a.float().required(),
        speed: a.float().default(0),
        heading: a.float().default(0),
        boardedCount: a.integer().default(0),
      })
      .identifier(['busId'])
      .authorization((allow) => [
        allow.group('ADMINS'),
        allow.publicApiKey().to(['read']),
      ]),

    // Boarding ledger containing student PII & GPS; protected from unauthenticated reads/writes
    AttendanceLog: a
      .model({
        tripId: a.string().required(),
        busId: a.string().required(),
        studentId: a.string().required(),
        studentName: a.string().required(),
        scanLat: a.float(),
        scanLng: a.float(),
        scannedAt: a.datetime(),
      })
      .secondaryIndexes((index) => [index('tripId'), index('studentId')])
      .authorization((allow) => [allow.group('ADMINS')]),

    mobileLogin: a
      .mutation()
      .arguments({
        loginId: a.string().required(),
        pin: a.string().required(),
        role: a.string().required(),
      })
      .returns(a.json())
      .authorization((allow) => [allow.publicApiKey()])
      .handler(a.handler.function(transitGateway)),

    driverTripAction: a
      .mutation()
      .arguments({
        sessionToken: a.string().required(),
        action: a.string().required(),
        tripId: a.string(),
        lat: a.float(),
        lng: a.float(),
        speed: a.float(),
        heading: a.float(),
      })
      .returns(a.json())
      .authorization((allow) => [allow.publicApiKey()])
      .handler(a.handler.function(transitGateway)),

    verifyStudentBoarding: a
      .mutation()
      .arguments({
        sessionToken: a.string().required(),
        qrPayload: a.string().required(),
        scanLat: a.float(),
        scanLng: a.float(),
        bypassGpsCheck: a.boolean(),
      })
      .returns(a.json())
      .authorization((allow) => [allow.publicApiKey()])
      .handler(a.handler.function(transitGateway)),

    getParentWardStatus: a
      .query()
      .arguments({
        sessionToken: a.string().required(),
      })
      .returns(a.json())
      .authorization((allow) => [allow.publicApiKey()])
      .handler(a.handler.function(transitGateway)),
  })
  .authorization((allow) => [allow.resource(transitGateway)]);

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
    apiKeyAuthorizationMode: {
      expiresInDays: 365,
    },
  },
});
