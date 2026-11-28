# JointSense

**Screen early. Refer on time.**

JointSense is a wearable-assisted knee osteoarthritis (OA) screening project designed to help frontline health workers collect movement and foot-pressure signals, guide patients through a short 3-test screening workflow, review OA risk indicators, and generate a plain-language screening report for referral.

> **Project status:** Academic prototype. JointSense is a screening-support concept, not a medical diagnostic device. Its outputs must not replace assessment by a qualified healthcare professional.

<p align="center">
  <a href="https://joint-sense.vercel.app/"><strong>Live Demo</strong></a>
  ·
  <a href="https://github.com/chaostestapp-coder/JointSense"><strong>Source Code</strong></a>
</p>

---

## Table of Contents

- [The Problem](#the-problem)
- [Our Solution](#our-solution)
- [How It Works](#how-it-works)
- [Project Architecture](#project-architecture)
- [Technology Stack](#technology-stack)
- [Repository Structure](#repository-structure)
- [Getting Started](#getting-started)
- [Firebase Configuration](#firebase-configuration)
- [ESP32 and Wearable Hardware](#esp32-and-wearable-hardware)
- [Working Demo](#working-demo)
- [Team](#team)
- [Pitch Materials](#pitch-materials)
- [Credits and References](#credits-and-references)
- [Limitations and Disclaimer](#limitations-and-disclaimer)

---

## The Problem

Knee osteoarthritis can progressively affect mobility and quality of life. In underserved and remote communities, access to specialists and diagnostic facilities may be limited. This can delay assessment and referral.

The gap identified by our team is the lack of an affordable, portable, easy-to-use screening workflow that can help frontline health workers identify people who may need further clinical evaluation.

The project pitch highlights the following India-focused figures and references:

- **62.35 million** people in India living with OA in 2019, compared with 23.46 million in 1990.
- **47%** knee OA prevalence among elderly Indians, as cited in the presentation.
- **28.7%** knee-OA prevalence across five Indian sites, as cited in the presentation.
- **17.4 million to 48.4 million** estimated knee-OA cases in India between 1990 and 2021, as cited in the presentation.

These figures are reproduced from the team's pitch materials. Please consult the original publications listed in the presentation before reusing them in research or clinical material.

## Our Solution

JointSense combines two ESP32-based wearables with a guided screening web application and an in-browser OA risk model:

1. **Knee sleeve** — captures dual-MPU6050 knee bend angle (`knee_angle_deg`), thigh/shin IMU data, and piezoelectric vibration (`piezo`).
2. **Smart insole** — captures 4-region foot pressure (`fsr`), pressure balance percentages (`balance`), foot contact state (`foot_contact`), and shoe angle (`shoe_angle_deg`).
3. **Web application** — guides the health worker through patient registration and 3 functional tests, displays a combined live Knee & Shoe angle chart in Doctor View, runs both clinical threshold checks and an in-browser Logistic Regression OA risk model (`oaModel.js`), and generates a downloadable PDF report.

The intended goal is to make preliminary screening more accessible. A screening result indicates that further evaluation may be appropriate; it does not confirm or rule out osteoarthritis.

## How It Works

The guided screening workflow includes:

1. **Register or select a patient** (with MRN tracking, baseline joint/side, and doctor-scoped access).
2. **Connect wearable sensors** via **Start sensor listener** (both `/knee_sleeve/live` and `/shoe/live` are monitored independently; screening continues normally even if one or both sensors are offline).
3. **Guide the patient through the 3 functional tests** (with optional multi-language read-aloud voice instructions):
   - **10-Metre Walk** (captures timed walking speed; falls back to `10 / walkDurationSec` if sensor speed is `0` or unavailable)
   - **5x Sit-to-Stand** (captures 5-cycle transition time)
   - **Knee Bend & Extend** (auto-captures peak knee bend angle from the live knee sleeve)
4. **Record symptoms & observations** (0–10 pain level, morning stiffness, joint swelling, clicking/grinding, buckling/giving way, and walking aid).
5. **Review results & OA risk estimate** (combines the clinical screening check with the 7-feature `oaModel.js` risk estimate and plain-language key takeaways, plus an optional toggle for raw technical sensor telemetry).
6. **Download PDF report** (generated locally in the browser with `jsPDF` so reports work immediately without requiring cloud storage).

## Project Architecture

### Current web application

The repository contains a React 19 + Vite web application (`app/`) and ESP32 firmware (`esp32/`).

The web application uses:

- **Firebase Authentication** for clinician sign-in.
- **Cloud Firestore** for doctor profiles, patients, MRN uniqueness checks, and screening records (scoped per `doctorId`).
- **Firebase Realtime Database** for live wearable telemetry (`onValue` subscriptions with 3,000 ms browser-receipt freshness detection).
- **In-browser ML inference (`oaModel.js`)** — a zero-dependency Logistic Regression + StandardScaler model evaluating 7 gait/movement features (`knee_angle_range`, `vibration_rms_avg`, `vibration_spikes_avg`, `walking_speed_ms`, `heel_to_forefoot_ratio`, `lateral_shift_ratio`, `shoe_angle_range`) with healthy-neutral fallbacks when a sensor stream is unavailable.
- **IndexedDB offline queue (`offlineSyncService.js`)** — queues screenings locally when offline and syncs idempotently to Firestore when connectivity returns.
- **Local PDF generation (`reportPdfService.js`)** — builds and downloads the clinical screening report directly in the browser, with optional best-effort Firebase Storage upload.

The current Realtime Database telemetry paths are:

| Device | Realtime Database path |
|---|---|
| Knee sleeve | `/knee_sleeve/live` |
| Smart insole | `/shoe/live` |

### Proposed product direction

The pitch deck also describes a BLE-connected Android application with native on-device inference. That represents the future product direction in the presentation and should not be confused with the current Firebase-connected React/Vite web application.

---

## Technology Stack

| Area | Technologies |
|---|---|
| Frontend | React 19, JavaScript, Vite 8 |
| Styling | Tailwind CSS v4 |
| Routing | React Router |
| Icons | Lucide React |
| Backend services | Firebase (Auth, Cloud Firestore, Realtime Database, optional Storage) |
| ML Inference | Pure-JS Logistic Regression + StandardScaler (`oaModel.js`) |
| PDF reports | jsPDF, jsPDF-AutoTable |
| Linting & Tests | `oxlint`, Node.js built-in test runner (`node --test`) |
| Hardware | ESP32-based wearable prototypes (dual MPU6050s, 4× FSRs, piezoelectric sensor) |

## Repository Structure

```text
JointSense/
├── app/                              # React + Vite web application
│   ├── src/
│   │   ├── app/                      # App router and global styles
│   │   ├── components/               # Common UI, layout shell, patient modals, screening charts
│   │   ├── config/                   # Firebase & API client configuration
│   │   ├── context/                  # Auth and language contexts
│   │   ├── pages/                    # Dashboard, Patients, Screening, Result, Settings, Login
│   │   ├── services/
│   │   │   ├── ml/                   # oaModel.js and 7-feature screeningFeatureExtractor.js
│   │   │   └── transports/           # Knee sleeve & smart insole RTDB transports and schemas
│   │   └── utils/                    # Formatters, translations, speech helper
│   ├── tests/                        # Unit tests for transports, OA model, and PDF generation
│   ├── firestore.rules               # Firestore security rules
│   └── storage.rules                 # Firebase Storage security rules
└── esp32/                            # ESP32 firmware sketches
    ├── KneeSleeve.ino                # Knee sleeve ESP32 sketch
    └── Shoe.ino                      # Smart insole ESP32 sketch
```

---

## Getting Started

### Prerequisites

- Node.js (current LTS release)
- npm
- Git
- A Firebase project configured for the application

### 1. Clone the repository

```bash
git clone https://github.com/chaostestapp-coder/JointSense.git
cd JointSense
```

### 2. Install frontend dependencies

```bash
cd app
npm install
```

### 3. Configure environment variables

Create an `.env` file inside `app/` (see `app/.env.example`):

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=jointsense-a5897
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=

VITE_FIREBASE_DATABASE_URL=https://jointsense-a5897-default-rtdb.asia-southeast1.firebasedatabase.app
VITE_FIREBASE_RTDB_KNEE_SLEEVE_PATH=/knee_sleeve/live
VITE_FIREBASE_RTDB_SHOE_PATH=/shoe/live
VITE_FIREBASE_STALE_TIMEOUT_MS=3000

# Optional: only configure these if an external analysis backend is active.
VITE_API_BASE_URL=
VITE_SCREENING_ENDPOINT=
```

Do not commit your local `.env` file.

### 4. Start the development server

```bash
npm run dev
```

Vite starts the local development server at `http://localhost:5173`.

### 5. Run tests, lint, and production build

```bash
node --test tests/*.test.mjs
npm run lint
npm run build
```

To preview the production build locally:

```bash
npm run preview
```

## Firebase Configuration

1. Create or select a Firebase project and register a **Web App**.
2. Copy the Firebase web configuration into `app/.env`.
3. Enable **Email/Password** in Firebase Authentication and add your local/deployed domains (`localhost`, `joint-sense.vercel.app`) to **Authorized domains**.
4. Create **Cloud Firestore** and deploy `app/firestore.rules`.
5. Enable **Firebase Realtime Database** in your region and ensure rules allow authenticated reads/writes for `/knee_sleeve/live` and `/shoe/live`.
6. *(Optional)* Enable **Firebase Storage** with `app/storage.rules` and bucket CORS if you want cloud-archived PDFs in addition to local browser downloads.

## ESP32 and Wearable Hardware

### Knee sleeve (`/knee_sleeve/live`)

- ESP32 microcontroller
- Two MPU6050 IMUs (`0x68` and `0x69` on `SDA=21`, `SCL=22`) for thigh and shin orientation (`knee_angle_deg`)
- Piezoelectric sensor (`GPIO 34`) for joint vibration (`piezo`)
- Expected RTDB fields: `knee_angle_deg`, `piezo`, `thigh.{acc, gyro}`, `shin.{acc, gyro}`, `timestamp` (also backward-compatible with `walking_speed_ms`, `steps`, and `vibration.{rms, peak, spikes}`)

### Smart insole (`/shoe/live`)

- ESP32 microcontroller
- One MPU6050 IMU (`0x68`) for `shoe_angle_deg`, `acc`, and `gyro`
- Four FSR pressure pads (`GPIO 32, 33, 34, 35`) for `heel`, `toe`, `inner`, and `outer`
- Expected RTDB fields: `fsr.{heel, inner, outer, toe, total}`, `balance.{heel_pct, inner_pct, outer_pct, toe_pct}`, `foot_contact`, `shoe_angle_deg`, `acc`, `gyro`, `timestamp`

> **Firmware setup:** Update `WIFI_SSID`, `WIFI_PASS`, and `FIREBASE_URL` in `esp32/KneeSleeve.ino` and `esp32/Shoe.ino` before flashing.

---

## Working Demo

**Live application:** [https://joint-sense.vercel.app/](https://joint-sense.vercel.app/)

For a complete demonstration:

1. Sign in as a clinician.
2. Register or select a test patient.
3. Click **Start sensor listener** to stream `/knee_sleeve/live` and `/shoe/live`.
4. Complete the 3 guided tests (optionally expanding **Doctor view** to show the combined Knee & Shoe angle chart).
5. Review the OA risk estimate, key takeaways, and download the generated PDF report.

Do not use real patient-identifiable information in public demonstrations.

---

## Team

**Team name:** 3 AM Chaoss!  
**Institution:** Graphic Era Hill University

| Team member | Responsibility |
|---|---|
| `Anshita Goyal` | `Researh and development + pitching` |
| `Shivika Rastogi` | `Researh and development + pitching` |
| `Mayank Pun` | `Web Application Implementatin and setup` |
| `Rakshit Nagarkoti` | `Hardware Assembly and Setup` |
| `Manthan Dhiman` | `Hardware Assembly and Setup` |

## Pitch Materials

- **Project presentation:** `docs/JointSense_Pitch_Deck.pptx`
- **Live demo:** [joint-sense.vercel.app](https://joint-sense.vercel.app/)
- **Source code:** [GitHub repository](https://github.com/chaostestapp-coder/JointSense)
- **Demo video:** `[Add YouTube / Drive link]`

## Credits and References

- Global Burden of Disease (GBD) 2019 India estimates, *Osteoarthritis and Cartilage* (2022).
- Global Burden of Disease (GBD) 2021 India estimates.
- American College of Rheumatology (ACR) 2024 abstract.
- Pal et al., *Indian Journal of Orthopaedics* (2016).
- Built with React, Vite, Tailwind CSS, React Router, Firebase, Lucide React, and jsPDF.

---

## Limitations and Disclaimer

- JointSense is an academic prototype and is not a certified medical device.
- It is intended to support preliminary screening and referral workflows, not to diagnose osteoarthritis.
- The included `oaModel.js` was trained on 2,000 synthetic gait windows and requires clinical validation before real-world medical use.
- Sensor measurements depend on hardware quality, calibration, placement, and data quality.
- The BLE/offline Android workflow in the pitch deck represents a proposed product direction, not the current Firebase-connected web deployment.

---

**Built by 3 AM Chaoss!**  
**Graphic Era University**
