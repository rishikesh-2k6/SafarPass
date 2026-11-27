# SafarPass / VahanSync — Feature Enhancement Blueprint (`ideas.md`)

> Consolidated product & engineering plan captured from design notes and brainstorming sessions.  
> **Scope status:** Specification / Blueprint (no source code modified yet).

---

## Summary of Core Enhancements

1. **Terminology, Password Visibility & UI Decluttering** — Rename *Student* → *Passenger* (keeping *Parent Mode* & *Login ID*), add password/PIN eye toggles (`👁️`) everywhere, remove unused UI clutter while keeping *Load Sample Data* and *Simulate*.
2. **Fee Clarity, Automated CSV/Excel Upload & Temporary Grace Override** — Bulk `.csv` / `.xlsx` upload with schema guide & sample table, transparent fee assignment, unpaid map access, and an Admin *Allow Unpaid Boarding* grace toggle.
3. **Bus Management, Map Pin-Drop Route Builder & Single-Bus Focus** — Admin-only Bus Detail view, per-bus numeric occupancy (`18 / 45 seats`), ordered stops via interactive map pin-drop + location search (`+ Add Stop`), auto-reversed return route, and automatic Source → Destination map routing.
4. **Admin Split Dashboard: Map + Movable Calendar + Trip Distance & History** — Left-half filtered live GPS map, right-top movable monthly calendar (`← NOV →`) + Live Attendance, and date-click trip/passenger summaries (distance & analytics restricted to Admin; Driver only sees Start & Stop times).
5. **Parent Portal Overhaul (Fix Cut-off Card & Two-Trip Status)** — Fix horizontal text truncation in top status card and clearly track **Trip 1 (To Campus)** and **Trip 2 (To Home)** completion & ward boarding status.
6. **Categorized Smart SOS (>50% Rule) & Emergency Buzzer System** — *Medical Emergency / Accident / Mechanical* categories, automatic >50% Passenger escalation triggering Driver audio buzzer + Admin alert, separate Admin SOS Console, and disaster-style **Emergency Buzzer Broadcast** to Driver & Passenger devices.

---

## Detailed Breakdown by Module & Feature Area

### 1. Terminology, Password Visibility & UI Cleanup

#### Mobile App & Admin Web UI Changes
- **Terminology Update**:
  - Rename user-facing labels from **Student** → **Passenger** across Mobile (`Passenger Mode`) and Admin Portal (`Passengers`, `Passenger Roster`, `Boarded Passengers`).
  - Keep **Parent Mode** unchanged.
  - Keep login credential label as **`Login ID`**.
  - Keep internal DynamoDB `role` value (`'student'`) backward-compatible in backend/database so existing users and tokens continue working seamlessly.
- **Password / PIN Eye Toggle (`👁️`)**:
  - Add show/hide eye icon buttons to **all** password and PIN inputs across Admin Web (Cognito Admin sign-in, Add User PIN, Edit User PIN) and verify consistency across all Mobile login fields.
- **Remove Unused Clutter (Keep Demo Tools)**:
  - **Mobile (Passenger screen)**: Remove the unused static **`My ID Pass` QR** tab/view while keeping **`Scan Bus QR`** active for verified boarding attendance.
  - **Admin (Users table)**: Remove the redundant static **`PIN Security` (`SHA-256 Protected`)** column; display an inline **`Locked (Unlock)`** badge/button inside the user row only when an account is temporarily locked.
  - **Retain**: Keep **`Load Sample Data`** (Admin Web) and **`Simulate`** route toggle (Driver Mobile).

---

### 2. Fee Assignment, Automated CSV/Excel Upload & Temporary Entry Override

#### How Fee Assignment Works
- Each passenger (`UserProfile`) stores:
  - `feePaid` (`boolean`) — baseline fee status.
  - Optional `feeReceiptId` (`string`) and `feeValidUntil` (`datetime`) for clear auditability of when/how fee status was granted.
- **Unpaid Passengers Can Still Track Bus**:
  - Passengers with `feePaid = false` can log in and view live bus location, destination, and bus details.
  - Only **QR Boarding Attendance** enforces fee verification—unless Admin enables a temporary override.

#### Admin Web Changes
- **Automated Bulk Fee Upload (`.csv` & `.xlsx`)**:
  - Parse both `.csv` and Excel `.xlsx` spreadsheets client-side (e.g. via `xlsx` library).
  - Display a prominent **File Format Requirements Note + Sample Preview Table** directly inside the upload modal before file selection:

    | Login ID | Full Name *(optional)* | Fee Status | Receipt No *(optional)* | Valid Until *(optional)* |
    | :--- | :--- | :--- | :--- | :--- |
    | `AIE24141` | `Jaya` | `PAID` | `REC-2026-081` | `2027-05-31` |
    | `student_02` | `Sneha Reddy` | `UNPAID` | | |

  - Show a dry-run reconciliation summary before committing: e.g., *Matched rows, Newly Paid, Newly Unpaid, Unknown Login IDs*.
  - Batch-update DynamoDB profiles cleanly.
- **Temporary "Allow Unpaid Boarding" Override Toggle**:
  - Admin toggle (with optional expiry date, e.g. *"Allow unpaid candidates to board until end of today / selected date"*) stored in backend config (`SystemSecret` / `Bus` / transit settings).
  - When enabled, `verifyStudentBoarding` allows unpaid passengers assigned to that bus to board and logs `unpaidOverride: true` on their `AttendanceLog` for audit visibility without mutating their underlying `feePaid = false` status.

#### Backend Changes
- Add optional `feeReceiptId`, `feeValidUntil` on `UserProfile`, `unpaidOverride` on `AttendanceLog`, and `allowUnpaidUntil` setting checked by `verifyStudentBoarding`.
- Keep strict **Dedicated Bus Check**: `verifyStudentBoarding` rejects scanning a bus if `profile.assignedBusId !== trip.busId` with an explicit error naming their assigned bus.

---

### 3. Bus Management, Interactive Map Route Builder & Single-Bus Display

#### Admin Web Changes
- **Bus Registration & Editing (`BusesManager`)**:
  - **Bus Name / ID** (e.g. `BUS_01`).
  - **Seating Capacity in exact number** (e.g. `45 seats`, never fleet `%`).
  - **Interactive Ordered Route Stop Builder (`+ Add Stop`)**:
    - Admin adds stops in exact sequence: **Source → Intermediate Stops → Destination**.
    - Selecting/editing a stop provides **both**:
      1. **Location Search box** (geocoding via OpenStreetMap Nominatim), and
      2. **Interactive Map Pin-Drop** (click/drag marker on Leaflet map to set exact `lat, lng` & stop name).
    - Up/Down reorder buttons & Delete stop controls.
  - **Single Route with Auto-Reverse**:
    - Store one canonical ordered stop list (`stopsJson`: Source → Campus).
    - Return trips (`To Home`) automatically reverse the stop order (`Destination → ... → Source`) without requiring duplicate route entry.
- **Route Auto-Plotting Source → Destination**:
  - Automatically render numbered stop pins (`1, 2, 3...`) and draw the connecting path (OSRM road-geometry polyline with straight-segment fallback) from Source to Destination on Admin, Driver, and Passenger maps.
- **Admin-Only Bus Detail Page & Strict Bus Filtering**:
  - Dedicated **Bus Detail** view accessible **only to Admin**, showing:
    - Route stops & live single-bus map (hiding unrelated buses).
    - Assigned Driver details.
    - **Per-Bus Occupancy in numbers**: e.g. `24 / 45 seats` (never whole-fleet `%`).
    - Assigned Passengers table with Fee Status + override indicator.
    - Historical trips ledger for that bus.
- **Mobile Tracking Scope**:
  - Passenger & Parent maps strictly display **only their assigned bus**, its live marker, and its active directional route stops.

#### Backend Changes
- Add `stopsJson: a.string()` (JSON array of `{ order, name, lat, lng }`) to `Bus` and `BusLocation` (only Admin writes `Bus`; `BusLocation` exposes read-only active stops for assigned passengers/parents).

---

### 4. Driver Start/Stop Times & Admin Split-View (Map + Movable Calendar)

#### Role Separation (Strict Privacy & Access)
- **Driver Mobile App**:
  - Displays **Trip Start Time** and **Trip Stop/End Time** (plus trip direction `To Campus` / `To Home` and QR / boarded count).
  - **Hides** distance covered (`km`) and historical trip logs (restricted to Admin only).
- **Admin Web Portal (All Analytics)**:
  - Stores every trip permanently in `Trip` (`busId`, `driverId`, `tripDirection`, `startedAt`, `endedAt`, `distanceKm`, `boardedCount`, `dateKey`).
  - Computes **`distanceKm`** server-side in `handler.ts` by summing Haversine distances between sequential valid GPS fixes (filtering small GPS noise < 15m and outlier jumps).

#### Admin Split Dashboard Layout
- **Left Half**: Live GPS map showing **only the selected/filtered bus**, its live telemetry, and its ordered route stops.
- **Right Top**:
  - **Movable Month Calendar** (`← NOV 2026 →`, clickable day grid `1..31`) + **Bus Filter** + **Live Attendance** quick view.
- **Right Bottom (Date Click Summary)**:
  - Clicking any date renders that day's summary for the selected bus (or fleet filter):
    - Total **number of trips** completed/started on that date.
    - Each trip's **Start Time – End Time**, direction (`To Campus` / `To Home`), driver, and **Distance Covered (`km`)**.
    - **Overall total passengers** who used the bus service on that date + expandable attendee list.
    - If no trips occurred on that date, renders a clean message (e.g., *"No trips or attendance recorded on Nov 14, 2026"*).

---

### 5. Parent Portal Improvements

#### Mobile App Changes (`parent_screen.dart` & `getParentWardStatus`)
- **Fix Cut-Off Top Status Card**:
  - Remove single-line `TextOverflow.ellipsis` constraints on ward details, boarding status, driver name, and destination; use clean multi-line responsive layout so **all details are readable without clipping**.
- **Two-Trip Daily Status ("Reaching Campus" & "Reaching Home")**:
  - Driver selects trip direction (**`To Campus`** vs **`To Home`**) when tapping **Start Trip**.
  - `getParentWardStatus` returns today's trip-wise summary for the ward's assigned bus:
    - **Trip 1 — Reaching Campus**: Shows bus progress (*Not Started / On the Way / Reached Campus ✅* with end timestamp) **AND** whether the ward boarded (*Boarded at 08:42 AM / Not Boarded*).
    - **Trip 2 — Reaching Home**: Shows bus progress (*Not Started / On the Way / Reached Home ✅* with end timestamp) **AND** whether the ward boarded.
- Keep **Locate** button, live bus map, and active route destination card cleanly below.

---

### 6. Categorized Smart SOS (>50% Rule) & Emergency Buzzer System

#### SOS Categories (Driver & Passenger)
- Both Driver and Passengers choose an emergency reason before triggering SOS:
  1. **Medical Emergency**
  2. **Accident**
  3. **Mechanical Breakdown**

#### Escalation & Notification Rules
1. **Driver Triggers SOS**:
   - Driver taps **SOS** (picks category) → immediately updates `Trip` / `BusLocation` SOS state with **live GPS coordinates**, **notifies Admin** on the SOS Console, and **alerts + sounds buzzer on all Passengers on that bus**.
2. **Passenger Triggers SOS (>50% Consensus Rule)**:
   - Any passenger on the active trip can tap **SOS** (picks category). Backend records unique `sosReporterIds` on the active `Trip` (preventing duplicate votes from the same passenger).
   - Once **more than 50%** of passengers on the bus press SOS:
     - Automatically activates the bus's **Emergency SOS** status.
     - Sends high-priority alert to **Admin SOS Console**.
     - Automatically triggers **loud emergency buzzer sound + full-screen/top alert banner on the Driver's phone**.
3. **Admin Emergency Buzzer ("Disaster Alert Siren") — No Phone Calls**:
   - Dedicated **SOS Console Page** in Admin Web showing active & resolved alerts, SOS category badge, live map coordinates, and passenger vote count (e.g., `11 / 20`).
   - Admin has an **Alert / Sound Buzzer** broadcast button (and Resolve/Acknowledge controls) that triggers a **loud weather/disaster-style buzzer sound + visual alert** on **both the Driver and Passenger mobile apps** (explicitly excluded from Parent devices).

#### Backend Changes
- Add SOS tracking fields on `Trip` and `BusLocation`:
  - `sosCategory` (`medical` | `accident` | `mechanical`)
  - `sosTriggerSource` (`driver` | `passengers_majority` | `admin_buzzer`)
  - `sosReporterIdsJson` (JSON array of `{ userId, category, triggeredAt }`)
  - `buzzerAlertId` / `buzzerTriggeredAt` (timestamp/ID observed via AppSync subscription + 4s polling on Driver & Passenger devices to trigger audio buzzer once per alert event).
- Add AppSync mutation/actions: `passengerSosAction` (gated to active trip + passenger boarded on that trip) and `adminBuzzerAction` / `resolveSos` (for Admin).

---

## Finalized Decisions (Locked In)

- **Passenger & Parent Naming**: Rename *Student* → *Passenger* across UI; keep **Parent Mode** and **`Login ID`**.
- **Cleanup & Demo Controls**: Remove static `My ID Pass` QR tab and redundant `PIN Security` table column; keep **`Load Sample Data`** (Admin) and **`Simulate`** (Driver); add `👁️` eye toggle on all password/PIN inputs.
- **Driver Trip Visibility**: Driver sees only **Start Time** and **Stop/End Time** (plus trip direction `To Campus` / `To Home`); distance covered (`km`) and trip analytics remain **Admin-only**.
- **Fee Automation & Grace Override**:
  - `.csv` & `.xlsx` upload merges cleanly without wiping existing records: updates existing passengers' `feePaid` + `feeValidUntil` and inserts any newly listed passengers.
  - Admin Directory includes filters + bulk cleanup/delete controls to remove inactive/old passenger records safely.
  - *"Allow Unpaid Boarding"* toggle is **Bus-wise** (`BUS_01`, etc., with optional expiry date).
- **SOS & Buzzer Scope**:
  - Passenger SOS is enabled **only while a trip is active AND the passenger has boarded that bus** (`> 50%` of boarded passengers triggers Driver buzzer + Admin SOS).
  - Buzzer audio is **in-app / foreground-service** (Driver + Passenger devices only; never Parents).

---

## Critical Checks & Things to Watch Out For (So Nothing Breaks)

1. **QR Boarding Dependency for SOS, Occupancy & Parent "Boarded" Status**:
   - Because Passenger SOS, per-bus numeric occupancy (`18 / 45 seats`), and Parent trip status (`Boarded` vs `Not Boarded`) all depend on **QR boarding**, every passenger must scan `Scan Bus QR` upon boarding.
   - *Design safeguard (approved)*: Show a clear banner on the Passenger screen (*"Scan Bus QR on boarding to unlock Trip Pass & SOS"*), and allow Admin to manually mark a passenger boarded on the **Bus Detail** page if someone misses the scan.
2. **New Users Added via CSV / Excel Need a PIN & Bus (Phone First-6-Digits Rule + Change PIN)**:
   - Upserting *brand-new* passengers during fee file upload requires `Assigned Bus` and an initial `PIN` so they can log in.
   - *Solution (approved)*: Store optional `phone` on `UserProfile`. When importing new passengers without an explicit PIN column, automatically hash and assign the **first 6 digits of their phone number** as their initial PIN, and provide an in-app **Change PIN** option so users can update it anytime after logging in.
3. **Auto-Expiry Logic on `feeValidUntil`**:
   - Both Admin UI and `verifyStudentBoarding` Lambda must evaluate `isPaidAndValid = feePaid && (!feeValidUntil || feeValidUntil >= now)` (unless the bus's `allowUnpaidUntil` override is active) so expired passes automatically become `Pending` without manual flips.
4. **DynamoDB Single-GSI Deployment Safety (AWS Amplify)**:
   - Adding multiple new GSIs in one Amplify deployment causes CloudFormation rollback failures. Keep all new fields (`stopsJson`, `distanceKm`, `tripDirection`, `allowUnpaidUntil`, `feeValidUntil`, `sosReporterIdsJson`, `buzzerAlertId`) as scalar/JSON attributes on existing tables (`Bus`, `UserProfile`, `Trip`, `BusLocation`, `AttendanceLog`)—**zero new GSIs needed**.
5. **Offline Resilience for Map Routing & Android Battery Savers**:
   - Cache OSRM road route polylines in DynamoDB (`routePolylineJson` or client fallback to straight stop-to-stop lines) so map rendering still works if OSRM/Nominatim is slow or offline.
   - Prompt Android Drivers to disable battery optimization for **VahanSync** so long-running GPS broadcasts and emergency buzzers aren't throttled by OEM battery managers (Vivo/Xiaomi/OnePlus/Samsung).

---

## Suggested Implementation Phases

- **Phase 1 — Quick UI & Parent Portal Wins**: Passenger rename (`Login ID` & `Parent Mode` kept), password `👁️` toggles, remove static QR tab & `PIN Security` column, fix cut-off Parent status card, Driver `To Campus` / `To Home` + Start/Stop time only, Parent two-trip status.
- **Phase 2 — Bus Detail, Map Route Builder & Split Calendar Analytics**: Map pin-drop + Nominatim search for ordered stops (`+ Add Stop`), auto-reversed return route & polyline rendering, Admin-only Bus Detail page with numeric per-bus occupancy, server `distanceKm` tracking, and Admin Map + Movable Calendar + Date Attendance Summary.
- **Phase 3 — Fee Automation, Bulk Cleanup & Bus-Wise Unpaid Override**: `.csv` + `.xlsx` upload parser with sample table guide + non-destructive upsert (add new / update existing & validity date), Passenger table filter + bulk delete cleanup, bus-wise *Allow Unpaid Boarding* Admin toggle.
- **Phase 4 — Smart SOS (>50%) & Disaster Buzzer System**: Separate Admin SOS Console, 3 emergency categories, Passenger >50% majority SOS escalation (active trip + boarded gate), Driver/Passenger loud in-app buzzer playback (`audioplayers` + alert banner) & Admin broadcast buzzer button.
