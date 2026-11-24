# VahanSync (SafarPass) — Project Engineering Progress & Onboarding Guide

> **Document Status**: Production MVP Complete  
> **Last Updated**: November 2026  
> **Repository**: [https://github.com/rishikesh-2k6/SafarPass](https://github.com/rishikesh-2k6/SafarPass)  
> **Target Audience**: Developers, DevOps Engineers, and Contributors continuing this project.

---

## 1. Executive Summary & Problem Statement

University and enterprise campus transit systems suffer from unpredictable bus timings, overcrowded fleets, ticket/pass fraud, and lack of real-time visibility for students and parents.

**VahanSync (SafarPass)** is an end-to-end, real-time campus transit operating system designed to solve these challenges:
- **Low-Cost Real-Time Telemetry**: Drivers broadcast high-accuracy GPS coordinates using their standard smartphones with no specialized proprietary OBD-II/GPS hardware required.
- **Fraud-Proof Boarding**: Students scan dynamic, time-windowed **HMAC-SHA256 encrypted QR passes** that prevent screenshot sharing and verify transit fee clearance in real time.
- **Operations Intelligence**: Administrators monitor live fleet maps, capacity utilization, emergency SOS alerts, and student attendance logs via a unified real-time dashboard.
- **Parent Peace of Mind**: Parents track their child's specific bus in real time with 1-click external navigation into Google Maps.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        VahanSync Architecture                          │
└────────────────────────────────────────────────────────────────────────┘

    [ Driver Phone ]              [ Student Phone ]             [ Parent Phone ]
   (GPS + QR Scanner)            (HMAC Dynamic Pass)          (Live Bus Tracking)
           │                              │                            │
           ▼                              ▼                            ▼
  Flutter Mobile App            Flutter Mobile App            Flutter Mobile App
           │                              │                            │
           └──────────────────────────────┼────────────────────────────┘
                                          │
                         AWS Amplify Gen 2 AppSync GraphQL
                                (Real-time Pub/Sub)
                                          │
                    ┌─────────────────────┴─────────────────────┐
                    ▼                                           ▼
          Amazon DynamoDB Tables                      Admin Operations Web
   - Bus (Fleet & Secrets)                       (React 19 + Vite + Leaflet)
   - UserProfile (Students/Staff)                 - Live Fleet Map & SOS Console
   - Trip (Status & Timestamps)                   - Fleet CRUD & Secret Rotation
   - BusLocation (Live Telemetry)                 - Students & Staff Governance
   - AttendanceLog (Scans & GPS)                  - Attendance Ledger & CSV Export
```

---

## 2. What We Have Built (Current State)

### A. Cloud Backend (AWS Amplify Gen 2 + AppSync + DynamoDB)
Located at [`admin_web/amplify/data/resource.ts`](file:///c:/Users/rishi/OneDrive/Desktop/transport%20website/campus-transit-mvp/admin_web/amplify/data/resource.ts):

| Model | Primary Identifier | Fields & Roles |
| :--- | :--- | :--- |
| **`Bus`** | `busId` (e.g. `BUS_01`) | `routeName`, `capacity` (seats), `qrSecret` (cryptographic salt for pass generation). |
| **`UserProfile`** | `userId` (UUID) | `loginId` (Roll No / Driver ID / Phone), `pin` (4-digit code), `fullName`, `role` (`student` \| `driver` \| `parent`), `assignedBusId`, `parentOfStudentId`, `feePaid` (boolean). |
| **`Trip`** | `id` (Auto UUID) | `busId`, `driverId`, `status` (`active` \| `completed` \| `sos`), `startedAt`. |
| **`BusLocation`** | `busId` | `tripId`, `lat`, `lng`, `speed` (km/h), `heading` (degrees), `boardedCount` (students on board). |
| **`AttendanceLog`** | `id` (Auto UUID) | `tripId`, `busId`, `studentId`, `studentName`, `scanLat`, `scanLng`, `scannedAt`. |

- **Real-Time Data Layer**: Enabled real-time `observeQuery()` pub/sub subscriptions for instant map and attendance propagation without manual polling.

---

### B. Admin Operations Web Console (React 19 + Vite + Leaflet)
Located at [`admin_web/src/`](file:///c:/Users/rishi/OneDrive/Desktop/transport%20website/campus-transit-mvp/admin_web/src/):

1. **Top Navigation System**:
   - **Live Operations**: Real-time KPI summary, interactive fleet map, active trips strip, and attendance ledger.
   - **Manage Buses**: Live count badge `${buses.length}`.
   - **Students & Staff**: Live count badge `${users.length}`.

2. **Live Operations Dashboard**:
   - **KPI Cards**: Active Buses, Students Boarded Today, Active SOS Alerts, and Fleet Capacity Occupancy percentage.
   - **Emergency SOS Banner**: Flashing alert banner with audio/visual urgency when a driver triggers SOS; 1-click administrative resolution.
   - **Active Trips Panel (`ActiveTripsPanel.tsx`)**: Shows buses currently broadcasting on the road with driver IDs, started times, speed, passenger count, and an administrative **Force End Trip** button.
   - **Interactive Leaflet Map**:
     - Custom high-contrast emerald bus markers with animated pulses.
     - Dual-layer toggle: **Street** (OpenStreetMap) and **Satellite** (Esri World Imagery) with zero API keys required.
     - Marker popup with live telemetry and 1-click **Open in Google Maps** external navigation.
   - **Live Attendance Ledger**:
     - Real-time stream of student scans with timestamps and boarding GPS coordinates.
     - Instant search by student name, roll number, or bus.
     - 1-click **Export CSV** download.

3. **Fleet Bus Management (`BusesManager.tsx`)**:
   - Card grid & table of all buses from DynamoDB.
   - **+ Register New Bus Modal**: Inputs for Bus ID, Route Name, Capacity, and HMAC-SHA256 secret key.
   - **Edit Bus**: Update route name or seating capacity.
   - **Rotate QR Secret**: 1-click cryptographic secret rotation in DynamoDB that invalidates old student screenshots instantly.
   - **Delete Bus**: Safe deletion with confirmation prompt.

4. **Students & Staff Governance (`UsersManager.tsx`)**:
   - Role filter pills: **All**, **Students**, **Drivers**, **Parents**.
   - Search bar across full names, roll numbers, and assigned buses.
   - **"Load Sample Campus Data" Seed Button**: 1-click initialization that provisions 1 bus (`BUS_01`), 1 driver, 2 students, and 1 parent into DynamoDB.
   - **Add / Edit User Modal**: Role selector, dynamic login ID labels, 4-digit PIN with random generator, assigned bus selector, linked child student dropdown (for parents), and fee clearance toggle.
   - **Interactive User Directory**: Masked/revealable PINs with **Copy Credentials** button, and interactive **Fee Status pill** (Paid green / Unpaid amber) that toggles `feePaid` directly in DynamoDB with one click.

---

### C. Multi-Role Mobile App (Flutter Material 3)
Located at [`mobile_app/lib/`](file:///c:/Users/rishi/OneDrive/Desktop/transport%20website/campus-transit-mvp/mobile_app/lib/):

1. **Design System & Global Theme (`main.dart`)**:
   - Custom Material 3 theme: Deep Slate-Navy (`#0F172A`), Emerald Accent (`#10B981`), Soft Off-White (`#F8FAFC`), crisp white cards with 16px radius.
   - Automated startup location permission handling for smooth Android onboarding.

2. **Unified Login Screen (`screens/login_screen.dart`)**:
   - Segmented 3-tab selector: **Driver**, **Student**, **Parent**.
   - Auto-fills demo credentials when toggling tabs for rapid evaluation.
   - Password reveal toggle and keyboard overflow-proof layout.

3. **Driver Mode (`screens/driver_screen.dart`)**:
   - **Continuous GPS Streaming (`driver_telemetry_service.dart`)**: Subscribes to `Geolocator.getPositionStream` with `AndroidSettings(accuracy: bestForNavigation, distanceFilter: 0, intervalDuration: 3s)`.
   - **Background WakeLock & Foreground Notification**: Prevents Android OS battery optimization from killing GPS broadcasting when the screen is locked.
   - **Camera Pass Scanner**: Powered by `mobile_scanner`, parses student QR payloads, validates HMAC-SHA256 crypto hashes, checks route clearance, and validates fee status.
   - **Text-to-Speech (TTS) Announcements**: Audibly speaks confirmation (e.g. *"Aarav Patel boarded successfully"* or *"Warning: Transit fee payment due"*).
   - **Emergency SOS Button**: Long-press SOS trigger that updates `Trip.status = 'sos'` to immediately sound the alarm in the admin portal.

4. **Student Mode (`screens/student_screen.dart`)**:
   - **Dynamic QR Bus Pass**: Generates time-windowed HMAC-SHA256 cryptographically signed tokens containing student ID, bus ID, timestamp, and salt.
   - **Live Bus Tracker**: Map tracking the assigned bus with Street/Satellite toggle.
   - **Google Maps Navigation**: External navigation button to launch turn-by-turn walking directions to the bus.

5. **Parent Mode (`screens/parent_screen.dart`)**:
   - Linked child profile information with school details.
   - Live transit status card (Waiting / On Board / Reached).
   - Real-time bus GPS tracking on map with satellite toggle and external Google Maps routing.

---

### D. Production CI/CD & DevOps Pipeline
Located at [`.github/workflows/ci-cd.yml`](file:///c:/Users/rishi/OneDrive/Desktop/transport%20website/campus-transit-mvp/.github/workflows/ci-cd.yml) & [`amplify.yml`](file:///c:/Users/rishi/OneDrive/Desktop/transport%20website/campus-transit-mvp/amplify.yml):

- **Job 1: `web-verify`**:
  - Runs on Ubuntu with **Node.js 22**.
  - Executes `npm ci` with `@opentelemetry/core` override resolution.
  - Verifies TypeScript static types (`npx tsc --noEmit`) and compiles Vite production bundle.
- **Job 2: `mobile-build`**:
  - Runs on Ubuntu with **Java 17 (Temurin)** and **Flutter Stable**.
  - Injects dual-identifier fallback configs (`amplifyConfig` & `amplifyconfig`).
  - Executes `flutter analyze --no-fatal-infos` and `flutter test`.
  - On push to `main`, compiles Android release APK with **Android Gradle Plugin 9.1.1** and uploads artifact `SafarPass-Android-APK`.
- **AWS Amplify Hosting**: Full-stack backend synthesis via `npx ampx pipeline-deploy` and frontend hosting via `dist`.

---

## 3. Technology Stack & Key Dependencies

| Layer | Technologies & Libraries |
| :--- | :--- |
| **Backend & Cloud** | AWS Amplify Gen 2, AWS CDK, AWS AppSync (GraphQL), Amazon DynamoDB, Amazon Cognito |
| **Web Admin Portal** | React 19, TypeScript 5.9, Vite 8.3, Leaflet 1.9, React-Leaflet 5, Lucide React, AWS Amplify Client |
| **Mobile App** | Flutter 3.27+, Dart 3.6+, Material 3, `amplify_flutter` 2.16, `amplify_api`, `geolocator` 14, `flutter_map` 8.3, `mobile_scanner` 7.5, `qr_flutter` 4.1, `flutter_tts` 4.2, `wakelock_plus` 1.8, `url_launcher` 6.3 |
| **CI/CD** | GitHub Actions, AWS Amplify Hosting, Gradle 9.3.1, AGP 9.1.1, Node.js 22 |

---

## 4. Repository Structure

```text
campus-transit-mvp/
├── .github/
│   └── workflows/
│       └── ci-cd.yml                  # Full GitHub Actions build & verification pipeline
├── admin_web/                         # Admin Operations Portal (React 19 + Vite)
│   ├── amplify/
│   │   ├── auth/resource.ts          # Cognito user pool configuration
│   │   ├── data/resource.ts          # AppSync GraphQL schema & DynamoDB definitions
│   │   └── backend.ts                # Amplify Gen 2 backend definition
│   ├── src/
│   │   ├── components/
│   │   │   ├── ActiveTripsPanel.tsx   # Active trips on road + Force End Trip
│   │   │   ├── BusesManager.tsx       # Fleet Bus CRUD & QR Secret rotation
│   │   │   └── UsersManager.tsx       # Students & Staff directory + Fee toggles
│   │   ├── App.tsx                    # Main portal orchestrator with 3 navigation tabs
│   │   ├── App.css                    # Dark slate & emerald design system
│   │   └── main.tsx                   # React root entry point
│   ├── amplify.yml                    # Amplify Hosting subfolder build spec
│   ├── package.json                   # Dependencies (with @opentelemetry/core override)
│   └── vite.config.ts                 # Vite bundler configuration
├── mobile_app/                        # Multi-Role Flutter App (Android / iOS / Web)
│   ├── android/                       # Native Android configuration
│   │   ├── app/build.gradle.kts       # Android module config (Java 17, minSdk, targetSdk)
│   │   └── settings.gradle.kts        # AGP 9.1.1 & Kotlin 2.4.0 plugins
│   ├── lib/
│   │   ├── screens/
│   │   │   ├── login_screen.dart      # Role switcher login (Driver, Student, Parent)
│   │   │   ├── driver_screen.dart     # GPS broadcast, camera scanner, TTS, SOS
│   │   │   ├── student_screen.dart    # Dynamic QR bus pass, live map, ETA
│   │   │   └── parent_screen.dart     # Child transit monitor & Google Maps navigation
│   │   ├── services/
│   │   │   ├── driver_telemetry_service.dart   # Continuous GPS streaming & throttling
│   │   │   └── student_boarding_service.dart   # QR HMAC generation & verification
│   │   ├── amplify_outputs.dart       # AWS AppSync cloud connection endpoints
│   │   └── main.dart                  # Material 3 theme & startup permission triggers
│   └── pubspec.yaml                   # Flutter dependencies & assets
├── amplify.yml                        # Root monorepo build spec for AWS Amplify Hosting
├── README.md                          # High-level overview & setup instructions
└── PROGRESS.md                        # This exhaustive progress & onboarding guide
```

---

## 5. Quick-Start Guide (How to Run Anywhere)

### Prerequisites
- **Node.js**: `v22.x` (LTS) & `npm v10+`
- **Flutter SDK**: `3.27+` (Stable channel)
- **Java**: OpenJDK 17 (Temurin recommended)
- **Android Studio / SDK**: Android Platform-Tools with `adb`

---

### Step 1: Run the Admin Operations Web Portal

```powershell
# 1. Navigate to the admin web directory
cd "campus-transit-mvp/admin_web"

# 2. Install dependencies (handles all peer dependencies cleanly)
npm install

# 3. Start the local Vite development server
npm run dev

# 4. Open in your browser:
# http://localhost:5173/
```

*Tip*: When opening the portal for the first time, click the **"Seed Demo Data"** button in the header or the **"Load Sample Campus Data"** button in the Students tab to immediately populate test buses, drivers, and students.

---

### Step 2: Run or Build the Multi-Role Mobile App

#### Option A: Run Live on a Connected Android Device (Recommended)
1. Enable **Developer Options** and **USB Debugging** on your Android phone.
2. Connect your phone via USB cable and allow the authorization prompt.
3. In your terminal:
   ```powershell
   cd "campus-transit-mvp/mobile_app"
   flutter pub get
   flutter run
   ```
4. The app will compile, install onto your phone, and open automatically with **Hot Reload** enabled (press `r` in the terminal to update code instantly).

#### Option B: Run in Chrome Browser
```powershell
cd "campus-transit-mvp/mobile_app"
flutter run -d chrome
```

#### Option C: Compile Standalone Release APK
```powershell
cd "campus-transit-mvp/mobile_app"
flutter build apk --release
```
The compiled APK will be output to:  
`campus-transit-mvp/mobile_app/build/app/outputs/flutter-apk/app-release.apk`

---

### Step 3: Test Credentials Matrix

| Role | Username / Identifier | PIN | What It Tests |
| :--- | :--- | :--- | :--- |
| **Driver** | `driver_01` | `1234` | Live GPS streaming, Student QR scanner, Audio TTS announcements, SOS trigger |
| **Student (Paid)** | `student_01` | `1234` | Dynamic QR Pass (Green fee status), Live bus map, Satellite toggle |
| **Student (Unpaid)** | `student_02` | `1234` | Scans will trigger audio warning *"Transit fee due"* |
| **Parent** | `9876543210` | `1234` | Live tracking of child's bus with external Google Maps navigation button |

---

## 6. How to Continue Building (Next Steps & Roadmap)

When picking up development from this state, here are the highest-value features to implement next:

### Phase 1: Push Notifications & Geofencing (P0)
- **Objective**: Alert students and parents when their bus is 5 minutes or 1 km away.
- **Implementation**:
  - Configure **Amazon SNS** or **Firebase Cloud Messaging (FCM)** inside `mobile_app`.
  - Use `geolocator` proximity checks or a Lambda trigger on `BusLocation.update` to calculate Euclidean distances to student pickup stops.
  - Send silent or heads-up notifications: *"Bus 01 is arriving at North Gate in 3 minutes"*.

### Phase 2: Route Polyline & Bus Stop Overlays (P1)
- **Objective**: Display scheduled pickup/drop-off stops on the map.
- **Implementation**:
  - Add a `stops` array or a new `RouteStop` model to `resource.ts` (`stopName`, `lat`, `lng`, `sequenceIndex`).
  - Render a `PolylineLayer` and stop `Marker` icons on both the Admin Leaflet map and Flutter's `flutter_map`.

### Phase 3: In-App Fee Payment Gateway (P1)
- **Objective**: Allow students/parents to pay overdue transit fees directly in the app.
- **Implementation**:
  - Integrate **Razorpay** or **Stripe** SDK into Flutter.
  - Upon successful payment verification webhook, update `UserProfile.feePaid = true` in DynamoDB, instantly re-enabling QR pass clearance.

### Phase 4: Production Android Keystore Signing & Play Store (P2)
- **Objective**: Distribute via Google Play Internal Testing / Production track.
- **Implementation**:
  - Generate a release keystore (`upload-keystore.jks`).
  - Add GitHub Secrets: `KEYSTORE_BASE64`, `KEY_ALIAS`, `KEY_PASSWORD`, and `STORE_PASSWORD`.
  - Update `mobile_app/android/app/build.gradle.kts` to sign release APKs and App Bundles (`.aab`) automatically in CI/CD.

---

## 7. Troubleshooting & Engineering FAQ

### Q1: `npm ci` fails with `Missing: @opentelemetry/core@2.0.0 from lock file`
- **Cause**: Known npm 10 dependency hoisting discrepancy with bundled Amplify constructs.
- **Fix**: Already solved via `"overrides": { "@opentelemetry/core": "^2.0.0" }` in `admin_web/package.json`. If modifying packages, always run `npm install` and commit the updated `package-lock.json`.

### Q2: Android build fails with `AGP version is lower than minimum 9.1.1`
- **Cause**: Flutter's Gradle plugin on Gradle 9 requires Android Gradle Plugin `9.1.1+`.
- **Fix**: Pinned to `id("com.android.application") version "9.1.1"` in `mobile_app/android/settings.gradle.kts`.

### Q3: Android permission prompt doesn't appear on startup
- **Cause**: On Android 11+, requesting `ACCESS_BACKGROUND_LOCATION` alongside `ACCESS_FINE_LOCATION` causes the OS to silently suppress the prompt.
- **Fix**: `ACCESS_BACKGROUND_LOCATION` has been removed from `AndroidManifest.xml`. Location permission is explicitly requested on startup in `main.dart` via `Geolocator.requestPermission()`.

### Q4: Map tiles fail to load or show 403 Forbidden
- **Cause**: CartoDB basemaps now require an account API key.
- **Fix**: We use standard open-access OpenStreetMap (`tile.openstreetmap.org`) for street view and Esri World Imagery (`server.arcgisonline.com`) for satellite view. Neither requires an API key.

---

*This document is maintained as part of the official VahanSync repository. For additional questions or pull request reviews, refer to the [GitHub Issues](https://github.com/rishikesh-2k6/SafarPass/issues).*
