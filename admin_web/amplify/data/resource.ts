import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

const schema = a
  .schema({
    Bus: a
      .model({
        busId: a.id().required(),
        routeName: a.string().required(),
        capacity: a.integer().default(45),
        qrSecret: a.string().required(),
      })
      .identifier(['busId']),

    UserProfile: a
      .model({
        userId: a.id().required(),
        loginId: a.string().required(),
        pin: a.string().required(),
        fullName: a.string().required(),
        role: a.string().required(),
        assignedBusId: a.string(),
        parentOfStudentId: a.string(),
        feePaid: a.boolean().default(true),
      })
      .identifier(['userId'])
      .secondaryIndexes((index) => [index('loginId')]),

    Trip: a.model({
      busId: a.string().required(),
      driverId: a.string().required(),
      status: a.string().required(),
      startedAt: a.datetime(),
    }),

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
      .identifier(['busId']),

    AttendanceLog: a.model({
      tripId: a.string().required(),
      busId: a.string().required(),
      studentId: a.string().required(),
      studentName: a.string().required(),
      scanLat: a.float(),
      scanLng: a.float(),
      scannedAt: a.datetime(),
    }),
  })
  .authorization((allow) => [allow.publicApiKey()]);

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'apiKey',
    apiKeyAuthorizationMode: {
      expiresInDays: 365,
    },
  },
});
