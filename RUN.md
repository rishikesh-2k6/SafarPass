# VahanSync (SafarPass) — Complete Build & Run Manual

> **Purpose**: A clear, step-by-step developer guide on how to build, run, test, and deploy every component of the VahanSync Smart Campus Transit System (Admin Web Portal, Multi-Role Flutter App, and AWS Amplify Gen 2 Backend).

---

## ⚡ Quick Reference Cheat Sheet

| Component | Goal | Command | URL / Output |
| :--- | :--- | :--- | :--- |
| **Admin Web** | Start Dev Server | `cd admin_web && npm run dev` | [http://localhost:5173/](http://localhost:5173/) |
| **Admin Web** | Verify Build & Types | `cd admin_web && npm run build` | `admin_web/dist/` |
| **Mobile App** | Run Live on Android Phone | `cd mobile_app && flutter run` | Direct to USB device with Hot Reload (`r`) |
| **Mobile App** | Run on Web (Chrome) | `cd mobile_app && flutter run -d chrome` | Local Chrome window |
| **Mobile App** | Build Release APK | `cd mobile_app && flutter build apk --release` | `mobile_app/build/.../app-release.apk` |
| **Mobile App** | 1-Click Install via USB | `adb install -r <path-to-apk>` | Installed on phone |
| **Backend** | Run Cloud Sandbox | `cd admin_web && npx ampx sandbox` | Live AWS cloud sandbox |

---

## 🛠️ 1. System Prerequisites

Ensure the following tools are installed on your machine before running:

1. **Node.js**: `v22.x` (LTS) & `npm v10+`
   - Verify: `node -v` and `npm -v`
2. **Flutter SDK**: `3.27+` (Stable channel)
   - Verify: `flutter --version` and `flutter doctor`
3. **Java Development Kit**: OpenJDK 17 (Eclipse Temurin 17 recommended)
   - Verify: `java -version`
4. **Android SDK & Platform Tools**:
   - Includes `adb.exe` (typically at `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe`)
   - Verify: `adb devices`

---

## 💻 2. How to Run the Admin Web Console

The Admin Portal is built with **React 19 + TypeScript + Vite + Leaflet + AWS Amplify Gen 2**.

### Step 2.1 — Navigate to the Directory
```powershell
cd "campus-transit-mvp/admin_web"
```

### Step 2.2 — Install Dependencies
```powershell
npm install
```
> [!NOTE]
> `package.json` includes an override for `@opentelemetry/core` to ensure complete compatibility with AWS Amplify Gen 2 data constructs. Always use `npm install` rather than raw `npm ci` when adding packages.

### Step 2.3 — Start Local Development Server
```powershell
npm run dev
```
- Open your browser at: **[http://localhost:5173/](http://localhost:5173/)**
- **Hot Module Replacement (HMR)** is active: any edits in `admin_web/src/` reflect instantly in the browser.

### Step 2.4 — Verify Production Bundle
```powershell
npm run build
```
- Runs TypeScript checks (`tsc -b`) and bundles production assets into `dist/`.

### Step 2.5 — Seed Sample Campus Data
When you open the portal for the first time:
1. Click the **"Seed Demo Data"** button in the header (or **"Load Sample Campus Data"** in the *Students & Staff* tab).
2. This immediately creates in DynamoDB:
   - **Bus `BUS_01`**: Central Campus Express (45 seats, HMAC secret key)
   - **Driver `driver_01`**: Rajesh Sharma (PIN: `1234`)
   - **Student `student_01`**: Aarav Patel (PIN: `1234`, Fee Status: Paid)
   - **Student `student_02`**: Sneha Reddy (PIN: `1234`, Fee Status: Unpaid)
   - **Parent `9876543210`**: Vikram Patel (PIN: `1234`, linked to `student_01`)

---

## 📱 3. How to Build & Run the Multi-Role Mobile App

The mobile application is a single unified Flutter app supporting **Driver**, **Student**, and **Parent** roles.

### Step 3.1 — Navigate to the Directory
```powershell
cd "campus-transit-mvp/mobile_app"
```

### Step 3.2 — Fetch Flutter Dependencies
```powershell
flutter pub get
```

---

### Step 3.3 — Option A: Run Live on Your Android Phone (Recommended for Development)

This provides **instant interactive debugging and Hot Reload**:

1. **Enable USB Debugging on your phone**:
   - Go to phone **Settings** &rarr; **About Phone** &rarr; Tap **Build Number** 7 times to enable Developer Options.
   - Go to **Developer Options** &rarr; Turn on **USB Debugging**.
2. **Connect phone to laptop via USB cable**.
   - An alert dialog will pop up on your phone: *"Allow USB debugging?"*. Check *"Always allow"* and tap **Allow**.
3. **Verify phone is detected**:
   ```powershell
   flutter devices
   ```
   You should see your device listed (e.g., `RMX3998 (mobile) • android-arm64 • Android 16`).
4. **Launch the App**:
   ```powershell
   flutter run
   ```
5. **Interactive Controls in Terminal**:
   - Press **`r`**: Hot Reload (updates code on phone in < 1 second).
   - Press **`R`**: Full restart.
   - Press **`q`**: Quit/detach session.

---

### Step 3.4 — Option B: Run in Chrome Browser
If you don't have an Android device plugged in, you can test the UI in Google Chrome:
```powershell
flutter run -d chrome
```

---

### Step 3.5 — Option C: Build the Standalone APK

To distribute the app file to phones or team members:

#### 1. Compile the Release APK:
```powershell
flutter build apk --release
```
- **Output File**:  
  `campus-transit-mvp/mobile_app/build/app/outputs/flutter-apk/app-release.apk` (Size: ~74 MB)

#### 2. (Alternative) Compile Debug APK:
```powershell
flutter build apk --debug
```
- **Output File**:  
  `campus-transit-mvp/mobile_app/build/app/outputs/flutter-apk/app-debug.apk`

---

### Step 3.6 — Install APK onto Android Device

#### Method A: Direct 1-Click Install via USB (Fastest)
Using the Android SDK `adb` tool:
```powershell
& "C:\Users\rishi\AppData\Local\Android\Sdk\platform-tools\adb.exe" install -r "build\app\outputs\flutter-apk\app-release.apk"
```

#### Method B: Wireless / Manual Transfer
1. Send `app-release.apk` to the phone via **WhatsApp Web**, **Google Drive**, **Bluetooth**, or **Quick Share**.
2. On the phone, tap the downloaded `.apk` file.
3. If prompted by Android, toggle *"Allow from this source"* to grant installation permission, then tap **Install**.

---

## 👥 4. Testing with Two Mobiles (Driver + Student Live Demo)

Because both phones communicate over AWS AppSync in the cloud, you can test real-time transit interactions across separate phones:

```
[ Mobile 1: Driver ]                                [ Mobile 2: Student ]
1. Login as driver_01 / 1234                         1. Login as student_01 / 1234
2. Tap "START TRIP" (GPS streams)                    2. Student QR Pass displays on screen
3. Tap "Scan Pass" (Camera opens)                    3. Live map shows Bus 01 approaching
         │                                                    │
         └────────── Point Camera at Student QR ──────────────┘
                                  │
                                  ▼
                   Audio: "Aarav Patel Boarded"
                   Passenger Count increases to 1
                                  │
                                  ▼
               Admin Web (http://localhost:5173/)
               Instantly logs scan with GPS timestamp!
```

### On Phone 1 (Driver Portal):
1. Open **VahanSync**.
2. Select the **Driver** tab.
3. Enter ID: `driver_01` | PIN: `1234`.
4. Tap **Login as Driver**.
5. Tap **START TRIP** &rarr; phone turns on continuous GPS broadcasting to AWS.
6. Tap the floating **Scan Pass** button &rarr; camera scanner activates.

### On Phone 2 (Student Portal):
1. Open **VahanSync**.
2. Select the **Student** tab.
3. Enter Roll No: `student_01` | PIN: `1234`.
4. Tap **Login as Student**.
5. The screen displays the dynamic **HMAC-SHA256 QR Bus Pass** and the live tracking map.

### The Scan:
1. Point Phone 1's camera at Phone 2's QR code.
2. Phone 1 audibly announces: *"Aarav Patel boarded successfully"* and updates count.
3. Open the **Admin Web Portal** ([http://localhost:5173/](http://localhost:5173/)) &rarr; watch the **Live Attendance Ledger** update in real time!

---

## ☁️ 5. AWS Amplify Gen 2 Backend Operations

### Local Cloud Sandbox
To test backend schema modifications or run a personal cloud sandbox:
```powershell
cd "campus-transit-mvp/admin_web"
npx ampx sandbox
```
- Provisions a dedicated, isolated cloud sandbox on AWS with AppSync GraphQL and DynamoDB.
- Generates an updated `amplify_outputs.json`.

### Cloud Pipeline Deployment (CI/CD)
To deploy backend updates headlessly in a CI/CD pipeline:
```powershell
npx ampx pipeline-deploy --branch $AWS_BRANCH --app-id $AWS_APP_ID
```

---

## 🔧 6. Common Build Issues & Quick Fixes

### 1. `npm ci` fails with `Missing: @opentelemetry/core@2.0.0 from lock file`
- **Solution**: In `admin_web/package.json`, keep `"overrides": { "@opentelemetry/core": "^2.0.0" }`. Run `npm install` and commit `package-lock.json`.

### 2. Gradle build fails with `AGP version is lower than minimum supported version 9.1.1`
- **Solution**: In `mobile_app/android/settings.gradle.kts`, ensure line 22 is set to:
  ```kotlin
  id("com.android.application") version "9.1.1" apply false
  ```

### 3. Device shows `unauthorized` in `flutter devices`
- **Solution**: Unlock your phone screen, look for the system popup **"Allow USB Debugging?"**, check *"Always allow from this computer"*, and tap **Allow**.

### 4. `adb` command not recognized in PowerShell
- **Solution**: Use the full path:
  ```powershell
  & "C:\Users\rishi\AppData\Local\Android\Sdk\platform-tools\adb.exe" <command>
  ```
  Or add `C:\Users\rishi\AppData\Local\Android\Sdk\platform-tools` to your system `PATH`.

---

## 📂 7. Project Directories at a Glance

```text
campus-transit-mvp/
├── admin_web/                         # React 19 Admin Operations Portal
│   ├── amplify/                       # AWS Amplify Gen 2 Backend Schemas
│   ├── src/components/                # ActiveTripsPanel, BusesManager, UsersManager
│   └── package.json                   # Web dependencies & scripts
├── mobile_app/                        # Multi-Role Flutter App
│   ├── android/                       # Native Android project (AGP 9.1.1, Java 17)
│   ├── lib/screens/                   # DriverScreen, StudentScreen, ParentScreen, Login
│   ├── lib/services/                  # GPS Telemetry & QR Verification services
│   └── pubspec.yaml                   # Flutter dependencies
├── .github/workflows/ci-cd.yml        # Automated build & release pipeline
├── PROGRESS.md                        # Architecture & engineering progress guide
└── RUN.md                             # This build & execution manual
```
