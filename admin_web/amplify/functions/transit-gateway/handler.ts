import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import type { Schema } from '../../data/resource';

type AppSyncEvent = {
  typeName?: string;
  fieldName?: string;
  info?: { fieldName?: string };
  arguments?: Record<string, unknown>;
};

type SessionPayload = {
  sub: string;
  loginId: string;
  role: 'driver' | 'student' | 'parent';
  busId: string;
  studentId?: string;
  iat: number;
  exp: number;
};

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000;
const SESSION_TTL_SECONDS = 24 * 60 * 60;
const MAX_QR_AGE_SECONDS = 30;
const MAX_BOARDING_DISTANCE_METERS = 50.0;
const DEFAULT_CAMPUS_LAT = 16.4632;
const DEFAULT_CAMPUS_LNG = 80.5064;

let clientPromise: Promise<ReturnType<typeof generateClient<Schema>>> | null = null;
let cachedSigningKey: string | null = null;

async function getClient() {
  if (!clientPromise) {
    clientPromise = (async () => {
      type EnvArg = Parameters<typeof getAmplifyDataClientConfig>[0];
      const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(
        process.env as unknown as EnvArg,
      );
      Amplify.configure(resourceConfig, libraryOptions);
      return generateClient<Schema>();
    })();
  }
  return clientPromise;
}

async function getSigningKey(
  client: ReturnType<typeof generateClient<Schema>>,
): Promise<string> {
  if (cachedSigningKey) return cachedSigningKey;

  const { data: existing } = await client.models.SystemSecret.get({
    keyId: 'SESSION_SIGNING_KEY',
  });
  if (existing?.secretValue) {
    cachedSigningKey = existing.secretValue;
    return existing.secretValue;
  }

  const generated = randomBytes(32).toString('hex');
  try {
    await client.models.SystemSecret.create({
      keyId: 'SESSION_SIGNING_KEY',
      secretValue: generated,
    });
    cachedSigningKey = generated;
    return generated;
  } catch {
    const { data: raceWinner } = await client.models.SystemSecret.get({
      keyId: 'SESSION_SIGNING_KEY',
    });
    const resolvedKey = raceWinner?.secretValue || generated;
    cachedSigningKey = resolvedKey;
    return resolvedKey;
  }
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

function verifyPinHash(pin: string, storedHash: string): boolean {
  if (!storedHash.startsWith('v1$')) {
    return false;
  }
  const parts = storedHash.split('$');
  if (parts.length !== 3) return false;
  const [, salt, expectedHex] = parts;
  const computedHex = createHash('sha256')
    .update(`${salt}:${pin}`)
    .digest('hex');
  return safeEqualHex(computedHex, expectedHex);
}

function signSessionToken(payload: SessionPayload, signingKey: string): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = createHmac('sha256', signingKey)
    .update(encodedPayload)
    .digest('base64url');
  return `${encodedPayload}.${signature}`;
}

function verifySessionToken(
  token: string | undefined,
  signingKey: string,
): SessionPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encodedPayload, sig] = parts;

  const expectedSig = createHmac('sha256', signingKey)
    .update(encodedPayload)
    .digest('base64url');
  if (!safeEqualHex(sig, expectedSig)) return null;

  try {
    const decoded = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as SessionPayload;
    const nowSec = Math.floor(Date.now() / 1000);
    if (!decoded.exp || decoded.exp < nowSec) return null;
    if (!decoded.sub || !decoded.loginId || !decoded.role) return null;
    return decoded;
  } catch {
    return null;
  }
}

function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function isValidCoordinate(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

async function handleMobileLogin(
  client: ReturnType<typeof generateClient<Schema>>,
  args: Record<string, unknown>,
) {
  const loginId = String(args.loginId ?? '').trim();
  const pin = String(args.pin ?? '').trim();
  const role = String(args.role ?? '').trim().toLowerCase();

  if (!loginId || !pin || !['driver', 'student', 'parent'].includes(role)) {
    return { success: false, message: 'Login ID, PIN, and valid role are required.' };
  }

  const { data: profiles } = await client.models.UserProfile.listUserProfileByLoginId({
    loginId,
  });

  const user = profiles?.find((p) => p.role === role) ?? profiles?.[0];
  if (!user || user.role !== role) {
    return { success: false, message: 'Invalid login ID or role.' };
  }

  if (user.lockedUntil) {
    const lockedMs = Date.parse(user.lockedUntil);
    if (!Number.isNaN(lockedMs) && lockedMs > Date.now()) {
      const remainingSec = Math.ceil((lockedMs - Date.now()) / 1000);
      return {
        success: false,
        message: `Account temporarily locked due to failed attempts. Try again in ${remainingSec}s.`,
      };
    }
  }

  if (!verifyPinHash(pin, user.pinHash)) {
    const nextAttempts = (user.failedAttempts ?? 0) + 1;
    const lockedUntil =
      nextAttempts >= MAX_FAILED_ATTEMPTS
        ? new Date(Date.now() + LOCKOUT_MS).toISOString()
        : null;
    await client.models.UserProfile.update({
      userId: user.userId,
      failedAttempts: nextAttempts >= MAX_FAILED_ATTEMPTS ? 0 : nextAttempts,
      lockedUntil,
    });
    return {
      success: false,
      message: lockedUntil
        ? 'Too many failed PIN attempts. Account locked for 5 minutes.'
        : 'Invalid PIN. Please check your credentials.',
    };
  }

  if ((user.failedAttempts ?? 0) > 0 || user.lockedUntil) {
    await client.models.UserProfile.update({
      userId: user.userId,
      failedAttempts: 0,
      lockedUntil: null,
    });
  }

  let effectiveBusId = user.assignedBusId || 'BUS_01';
  let wardProfile: {
    loginId: string;
    fullName: string;
    assignedBusId: string;
    feePaid: boolean;
  } | null = null;

  if (role === 'parent' && user.parentOfStudentId) {
    const { data: wardMatches } = await client.models.UserProfile.listUserProfileByLoginId({
      loginId: user.parentOfStudentId,
    });
    const ward = wardMatches?.[0];
    if (ward) {
      effectiveBusId = ward.assignedBusId || effectiveBusId;
      wardProfile = {
        loginId: ward.loginId,
        fullName: ward.fullName,
        assignedBusId: effectiveBusId,
        feePaid: ward.feePaid ?? true,
      };
    }
  }

  const { data: bus } = await client.models.Bus.get({ busId: effectiveBusId });
  const signingKey = await getSigningKey(client);
  const nowSec = Math.floor(Date.now() / 1000);

  const sessionToken = signSessionToken(
    {
      sub: user.userId,
      loginId: user.loginId,
      role: role as 'driver' | 'student' | 'parent',
      busId: effectiveBusId,
      studentId: wardProfile?.loginId ?? (role === 'student' ? user.loginId : undefined),
      iat: nowSec,
      exp: nowSec + SESSION_TTL_SECONDS,
    },
    signingKey,
  );

  return {
    success: true,
    message: 'Authenticated successfully.',
    sessionToken,
    user: {
      userId: user.userId,
      loginId: user.loginId,
      fullName: user.fullName,
      role: user.role,
      assignedBusId: effectiveBusId,
      parentOfStudentId: user.parentOfStudentId ?? null,
      feePaid: user.feePaid ?? true,
    },
    bus: bus
      ? {
          busId: bus.busId,
          routeName: bus.routeName,
          capacity: bus.capacity ?? 45,
          // Only drivers need the bus HMAC key locally to mint rotating QR codes
          qrSecret: role === 'driver' ? bus.qrSecret : null,
        }
      : null,
    ward: wardProfile,
  };
}

async function handleDriverTripAction(
  client: ReturnType<typeof generateClient<Schema>>,
  args: Record<string, unknown>,
) {
  const signingKey = await getSigningKey(client);
  const session = verifySessionToken(args.sessionToken as string | undefined, signingKey);
  if (!session || session.role !== 'driver') {
    return { success: false, message: 'Unauthorized driver session.' };
  }

  const action = String(args.action ?? '').trim().toLowerCase();
  const busId = session.busId;
  const driverId = session.loginId;

  if (action === 'start') {
    // Close any stale open trips for this bus so orphaned trips cannot linger
    const { data: existingTrips } = await client.models.Trip.listTripByBusId({
      busId,
    });
    const openTrips = (existingTrips ?? []).filter(
      (t) => t.status === 'active' || t.status === 'sos',
    );
    const nowIso = new Date().toISOString();
    await Promise.all(
      openTrips.map((t) =>
        client.models.Trip.update({
          id: t.id,
          status: 'completed',
          endedAt: nowIso,
        }),
      ),
    );

    const { data: createdTrip, errors } = await client.models.Trip.create({
      busId,
      driverId,
      status: 'active',
      startedAt: nowIso,
    });
    if (errors?.length || !createdTrip) {
      return { success: false, message: 'Failed to create trip record.' };
    }

    const lat = isValidCoordinate(args.lat, args.lng)
      ? (args.lat as number)
      : DEFAULT_CAMPUS_LAT;
    const lng = isValidCoordinate(args.lat, args.lng)
      ? (args.lng as number)
      : DEFAULT_CAMPUS_LNG;

    const { data: existingLoc } = await client.models.BusLocation.get({ busId });
    if (existingLoc) {
      await client.models.BusLocation.update({
        busId,
        tripId: createdTrip.id,
        lat,
        lng,
        speed: 0,
        heading: 0,
        boardedCount: 0,
      });
    } else {
      await client.models.BusLocation.create({
        busId,
        tripId: createdTrip.id,
        lat,
        lng,
        speed: 0,
        heading: 0,
        boardedCount: 0,
      });
    }

    return {
      success: true,
      tripId: createdTrip.id,
      status: 'active',
      boardedCount: 0,
    };
  }

  const tripId = String(args.tripId ?? '').trim();
  if (!tripId) {
    return { success: false, message: 'tripId is required.' };
  }

  const { data: trip } = await client.models.Trip.get({ id: tripId });
  if (!trip || trip.busId !== busId) {
    return { success: false, message: 'Trip not found for assigned bus.' };
  }

  if (action === 'location') {
    if (trip.status === 'completed') {
      return {
        success: false,
        tripStatus: 'completed',
        message: 'Trip was ended by dispatch.',
      };
    }
    if (!isValidCoordinate(args.lat, args.lng)) {
      return { success: false, message: 'Invalid GPS coordinates.' };
    }
    const rawSpeed = typeof args.speed === 'number' && Number.isFinite(args.speed) ? args.speed : 0;
    const speed = Math.min(Math.max(rawSpeed, 0), 150);
    const heading =
      typeof args.heading === 'number' && Number.isFinite(args.heading)
        ? ((args.heading % 360) + 360) % 360
        : 0;

    const { data: updatedLoc } = await client.models.BusLocation.update({
      busId,
      tripId,
      lat: args.lat as number,
      lng: args.lng as number,
      speed,
      heading,
    });

    return {
      success: true,
      tripStatus: trip.status,
      boardedCount: updatedLoc?.boardedCount ?? 0,
    };
  }

  if (action === 'sos') {
    if (trip.status === 'completed') {
      return { success: false, message: 'Cannot trigger SOS on a completed trip.' };
    }
    await client.models.Trip.update({ id: tripId, status: 'sos' });
    return { success: true, tripStatus: 'sos' };
  }

  if (action === 'end') {
    await client.models.Trip.update({
      id: tripId,
      status: 'completed',
      endedAt: new Date().toISOString(),
    });
    const { data: existingLoc } = await client.models.BusLocation.get({ busId });
    if (existingLoc && existingLoc.tripId === tripId) {
      await client.models.BusLocation.update({
        busId,
        speed: 0,
      });
    }
    return { success: true, tripStatus: 'completed' };
  }

  return { success: false, message: 'Unsupported trip action.' };
}

async function handleVerifyStudentBoarding(
  client: ReturnType<typeof generateClient<Schema>>,
  args: Record<string, unknown>,
) {
  const signingKey = await getSigningKey(client);
  const session = verifySessionToken(args.sessionToken as string | undefined, signingKey);
  if (!session || session.role !== 'student') {
    return { success: false, message: 'Unauthorized student session.' };
  }

  const { data: student } = await client.models.UserProfile.get({ userId: session.sub });
  if (!student) {
    return { success: false, message: 'Student profile not found.' };
  }
  if (student.feePaid === false) {
    return {
      success: false,
      message: 'Boarding Denied: Transit fee pending. Please clear dues with accounts.',
    };
  }

  const qrPayload = String(args.qrPayload ?? '').trim();
  const parts = qrPayload.split('|');
  if (parts.length !== 4) {
    return {
      success: false,
      message: 'Invalid QR format. Expected busId|tripId|timestamp|signature.',
    };
  }

  const [qrBusId, qrTripId, qrTimestampStr, qrSignature] = parts;
  if (student.assignedBusId && student.assignedBusId !== qrBusId) {
    return {
      success: false,
      message: `Boarding Denied: Pass is assigned to ${student.assignedBusId}, scanned ${qrBusId}.`,
    };
  }

  const { data: bus } = await client.models.Bus.get({ busId: qrBusId });
  if (!bus) {
    return { success: false, message: 'Bus not registered in fleet.' };
  }

  const rawData = `${qrBusId}|${qrTripId}|${qrTimestampStr}`;
  const expectedSig = createHmac('sha256', bus.qrSecret).update(rawData).digest('hex');
  if (!safeEqualHex(qrSignature, expectedSig)) {
    return {
      success: false,
      message: 'Anti-Proxy Check Failed: Invalid QR signature.',
    };
  }

  const qrTimestamp = Number.parseInt(qrTimestampStr, 10);
  if (Number.isNaN(qrTimestamp)) {
    return { success: false, message: 'Anti-Proxy Check Failed: Malformed QR timestamp.' };
  }

  const nowEpoch = Math.floor(Date.now() / 1000);
  const ageSeconds = nowEpoch - qrTimestamp;
  if (ageSeconds > MAX_QR_AGE_SECONDS || ageSeconds < -5) {
    return {
      success: false,
      message: `Anti-Proxy Check Failed: QR Code expired (${ageSeconds}s old > ${MAX_QR_AGE_SECONDS}s limit).`,
    };
  }

  const { data: trip } = await client.models.Trip.get({ id: qrTripId });
  if (!trip || trip.busId !== qrBusId || (trip.status !== 'active' && trip.status !== 'sos')) {
    return { success: false, message: 'Trip is not active or has already ended.' };
  }

  const bypassGps = Boolean(args.bypassGpsCheck);
  const { data: busLoc } = await client.models.BusLocation.get({ busId: qrBusId });

  let scanLat: number | null = isValidCoordinate(args.scanLat, args.scanLng)
    ? (args.scanLat as number)
    : null;
  let scanLng: number | null = isValidCoordinate(args.scanLat, args.scanLng)
    ? (args.scanLng as number)
    : null;

  if (!bypassGps) {
    if (scanLat === null || scanLng === null) {
      return {
        success: false,
        message: 'Location Error: Valid student GPS coordinates are required to board.',
      };
    }
    if (!busLoc) {
      return { success: false, message: 'Live bus GPS location unavailable.' };
    }
    const distance = haversineMeters(scanLat, scanLng, busLoc.lat, busLoc.lng);
    if (distance > MAX_BOARDING_DISTANCE_METERS) {
      return {
        success: false,
        message: `Anti-Proxy Check Failed: You are ${distance.toFixed(1)}m from the bus (> 50m radius).`,
      };
    }
  } else if (scanLat === null && busLoc) {
    scanLat = busLoc.lat;
    scanLng = busLoc.lng;
  }

  const { data: existingLogs } = await client.models.AttendanceLog.listAttendanceLogByStudentId({
    studentId: student.loginId,
  });
  const duplicate = (existingLogs ?? []).some((log) => log.tripId === qrTripId);
  if (duplicate) {
    return {
      success: false,
      message: `Duplicate Boarding: Already boarded for Trip ${qrTripId}.`,
    };
  }

  const boardedAt = new Date().toISOString();
  await client.models.AttendanceLog.create({
    tripId: qrTripId,
    busId: qrBusId,
    studentId: student.loginId,
    studentName: student.fullName,
    scanLat: scanLat ?? DEFAULT_CAMPUS_LAT,
    scanLng: scanLng ?? DEFAULT_CAMPUS_LNG,
    scannedAt: boardedAt,
  });

  if (busLoc) {
    await client.models.BusLocation.update({
      busId: qrBusId,
      boardedCount: (busLoc.boardedCount ?? 0) + 1,
    });
  }

  return {
    success: true,
    message: 'Boarding Verified! Attendance logged securely.',
    tripId: qrTripId,
    busId: qrBusId,
    studentId: student.loginId,
    studentName: student.fullName,
    boardedAt,
  };
}

async function handleGetParentWardStatus(
  client: ReturnType<typeof generateClient<Schema>>,
  args: Record<string, unknown>,
) {
  const signingKey = await getSigningKey(client);
  const session = verifySessionToken(args.sessionToken as string | undefined, signingKey);
  if (!session || session.role !== 'parent') {
    return { success: false, message: 'Unauthorized parent session.' };
  }

  const { data: parent } = await client.models.UserProfile.get({ userId: session.sub });
  if (!parent || !parent.parentOfStudentId) {
    return { success: false, message: 'No linked student found for this parent.' };
  }

  const { data: wardMatches } = await client.models.UserProfile.listUserProfileByLoginId({
    loginId: parent.parentOfStudentId,
  });
  const ward = wardMatches?.[0];
  if (!ward) {
    return { success: false, message: 'Linked student profile not found.' };
  }

  const assignedBusId = ward.assignedBusId || 'BUS_01';
  const [{ data: logs }, { data: busTrips }] = await Promise.all([
    client.models.AttendanceLog.listAttendanceLogByStudentId({
      studentId: ward.loginId,
    }),
    client.models.Trip.listTripByBusId({ busId: assignedBusId }),
  ]);

  const activeTrip = (busTrips ?? []).find(
    (t) => t.status === 'active' || t.status === 'sos',
  );

  const todayPrefix = new Date().toISOString().slice(0, 10);
  const sortedLogs = [...(logs ?? [])].sort((a, b) =>
    (b.scannedAt ?? '').localeCompare(a.scannedAt ?? ''),
  );
  const relevantLog =
    (activeTrip ? sortedLogs.find((l) => l.tripId === activeTrip.id) : undefined) ??
    sortedLogs.find((l) => (l.scannedAt ?? '').startsWith(todayPrefix));

  return {
    success: true,
    wardName: ward.fullName,
    wardLoginId: ward.loginId,
    assignedBusId,
    feePaid: ward.feePaid ?? true,
    boarded: Boolean(relevantLog),
    boardedAt: relevantLog?.scannedAt ?? null,
    boardedBusId: relevantLog?.busId ?? null,
    activeTripStatus: activeTrip?.status ?? 'idle',
    activeDriverId: activeTrip?.driverId ?? null,
  };
}

export const handler = async (event: AppSyncEvent) => {
  const client = await getClient();
  const fieldName = event.fieldName ?? event.info?.fieldName;
  const args = event.arguments ?? {};

  switch (fieldName) {
    case 'mobileLogin':
      return JSON.stringify(await handleMobileLogin(client, args));
    case 'driverTripAction':
      return JSON.stringify(await handleDriverTripAction(client, args));
    case 'verifyStudentBoarding':
      return JSON.stringify(await handleVerifyStudentBoarding(client, args));
    case 'getParentWardStatus':
      return JSON.stringify(await handleGetParentWardStatus(client, args));
    default:
      return JSON.stringify({ success: false, message: `Unknown operation: ${fieldName}` });
  }
};
