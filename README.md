# Extrusion Downtime Log

A shift clock for an aluminium extrusion line. Operators log what each machine is doing, and the app keeps one running clock: every minute of the shift counts as either **extrusion** or **downtime**, broken down by machine, state, alarm and machine mode.

It runs in any browser and installs on phones and tablets as an app (PWA). Everything is stored in a shared cloud database (Firebase Firestore), so every screen sees new entries within a second or two.

## What it does

- **Dashboard:** a line card (state, cause, availability gauge, this shift's numbers and timeline) and one card per machine (state, alarm, mode, who logged it, and its stops and downtime this shift). Filter by down or running, or switch to a compact list. Live timers and each machine's history open when you tap the machine.
- **Line check:** clocking in asks for the state of every machine once. Only changes are logged.
- **Logging:** pick the machine, then what it is doing. For an Issue, pick the alarm from the machine's list, or pick Other and describe it. Every entry also records the machine mode: Auto, Semi-auto, Manual or Maintenance. Undo is available for a few seconds after each entry.
- **Line rules:**
  - The **press** (main machine) sets the line state. Extrusion is running time. Every other press state is downtime.
  - **Puller and stretcher** stop the extrusion clock right away when they have an issue.
  - **Feeding line** issues do not stop extrusion. If a fix takes long, press **Stop the press**, and the downtime goes to the feeding line from that moment.
  - **ZPE A and ZPE B** form a group. One down does not stop the line. Both down together for 5 minutes stops the press. Use **ZPE both** to log both at once.
- **Analysis:** availability, MTTR, average die change, a Pareto of downtime causes, downtime over time, issues and alarms per machine (including the ones the line ran through), and splits by machine mode and by shift.
- **History:** every entry. Owners and admins can correct entries. Exports to CSV for Excel.
- **Maintenance log (maintenance team and admins):** any job on any equipment or place, not only the line: final saw, crane, forklift, preventive work. Each job records the equipment, technicians, type (breakdown, preventive, improvement, other), status (in progress, waiting for parts, fixed), problem or task, diagnosis, solution, notes, parts used (part number, description, quantity) and start and finish times. Start a job now and mark it fixed later, or enter it afterwards. Open jobs show at the top with buttons for Fixed and Waiting for parts / Parts arrived. **The job time stops while a job waits for parts** and starts again when the parts arrive (the Parts arrived button). Every wait shows in the job form with its **Waiting for parts from** and **Parts arrived** times, and the technician can correct both, remove a wait, or add one with **+ Wait for parts** when entering a job afterwards. Marking a waiting job fixed fills in Parts arrived with the current time, ready to correct. Time on jobs, the job list and the reports count only the working time; the time spent waiting is shown next to it. On the work order, Duration is the working time, Breakdown Time is the whole time from start to fixed (the equipment was down while waiting too), and each wait is written on the Notes lines. A job can list more than one technician. **Shift report PDF** is a daily report for one technician and one shift: pick the shift (the last six are listed, with how many jobs were finished in each) and, for admins, the technician. It covers only the jobs that person logged or was added to and that were marked fixed during that shift. The first page has the shift, the technician, the totals (jobs, time on jobs, breakdowns, preventive, parts used) and a list of the jobs; then each job follows as a work order, one per page (Letter), in the same layout as the plant's paper work order: company heading, an empty Work Order box to write the number in, the type band, the component and work order fields, Comments (the problem), Diagnosis, Solution, Notes (the job notes, then the parts used), and Work completed with type, technicians and status above the signature, date, duration and breakdown time line. Fields the app does not track are left blank. Each job also has its own PDF button. The company name is set in **Admin > Maintenance**.
- **Shift report PDF:** the operator, date, clock-in and clock-out times, totals, a timeline, downtime by cause and a time-ordered log. Available any time during a shift and when clocking out.
- **English and French:** every screen, message, CSV export and shift report is available in both languages, for all users and admins. Press **FR** or **EN** at the top of the screen to switch; the choice is kept on that device, and a new device starts in the language of its browser. The default machine, state, alarm and equipment names are shown in French too (Presse, Extracteur, Changement de matrice…), but they stay stored in English, so entries logged in either language add up together in the analysis. Names an admin types in **Admin** are shown as typed. The maintenance work order PDF keeps the plant's English form; the text people type in a job is printed as typed.

## Sign-in and roles

- People sign in with **Google** or with **email and password**.
- A new account waits as **pending** until an admin approves it.
- Admins can **turn off** a user (blocked for good) or **delete** them (their app account is removed, their past entries stay in the history; signing in again makes a new request). Admins can't delete other admins; the main admin can delete anyone but themselves. Deleting does not remove the person's Google or email login itself; to remove that too, delete them in Firebase console > Authentication > Users.
- **Users** clock in, log entries and see all the analysis. They can correct their own entries.
- Every user is on a **team**: **Operator** (the default) or **Maintenance**. Admins set it in **Admin > Users**. Maintenance users also get the **Maintenance** tab. They see the whole team's jobs and can edit their own.
- Maintenance users log the line like operators. On entries logged by someone else they can change only the description (notes), never the time, state, mode or alarm, and they can't delete them. Operators can't change entries logged by maintenance (or by anyone else).
- **Admins** also approve or turn off users, edit machines, states, alarms and shifts, see all clock-ins, and download anyone's shift report.
- The **main admin** is the email in `js/config.js` (`superAdminEmail`). Only that account can make or remove admins. It must sign in with a verified email. Google sign-in is always verified. Email/password accounts must open the verification link first.

The Firestore rules in `firestore.rules` enforce all of the above on the server, so the rules hold even if someone edits the app code in their browser.

## Works with a weak connection

- The database keeps a copy on the device. Entries logged while offline are saved locally and sent automatically when the connection comes back.
- The header shows **Offline** or **Syncing** when entries are waiting.
- Live updates reconnect on their own.
- In the account menu, **Keep this screen on** stops a mounted tablet from sleeping, where the browser allows it.

## Setup

### 1. Firebase project (free Spark plan is enough)

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com).
2. **Authentication > Sign-in method:** enable **Google** and **Email/Password**.
3. **Authentication > Settings > Authorized domains:** add the domain the app is served from, for example `thamizhazhagan-murugan.github.io`.
4. **Firestore Database:** create a database in production mode.
5. **Firestore Database > Rules:** paste the whole of `firestore.rules` and press **Publish**.
6. **Project settings > Your apps > Web app:** copy the `firebaseConfig` values into `js/config.js`.

The two indexes in `firestore.indexes.json` make start-up faster. Without them the app still works and uses a slower fallback. To create them, open the link that Firestore prints in the browser console, or deploy them with the Firebase CLI:

```bash
npm install -g firebase-tools
firebase login
firebase use --add            # pick your project
firebase deploy --only firestore   # deploys rules and indexes
```

### 2. Hosting on GitHub Pages

In the repository, go to **Settings > Pages**. Under **Build and deployment**, choose **Deploy from a branch**, pick `main` and `/ (root)`, and save. The site appears at `https://<user>.github.io/downtime-log/` and updates on every push.

### 3. First sign-in

Open the site and sign in as the main admin. The app creates your admin profile and the default line setup (machines, states, alarms and shifts). Change any of these in the **Admin** tab.

### Install on a phone or tablet

- **Android (Chrome):** open the site, then use the menu's **Install app**, or **Install as an app** in the account menu.
- **iPhone/iPad (Safari):** tap **Share**, then **Add to Home Screen**.

## Run locally

Any static web server works:

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

Add `localhost` to the authorized domains in Firebase to sign in locally. Without Firebase settings in `js/config.js`, the app runs in demo mode with generated example data.

## Data model (Firestore)

| Collection | Contents |
| --- | --- |
| `config/line` | Machines (name, role on the line, running state, downtime states with alarm lists, group and delay), shifts, and the maintenance equipment list |
| `users/{uid}` | Name, email, role (`user` or `admin`), team (`operator` or `maintenance`), status (`pending`, `active` or `disabled`) |
| `events/{id}` | One entry per state change: machine, state, alarm, mode, start time, notes, who logged it, and whether the press was stopped |
| `sessions/{id}` | Clock-in and clock-out per person, and the start-of-shift line check |
| `work/{id}` | Maintenance jobs: equipment, type, problem, work done, parts, start and finish, who did it |

The line timeline is not stored. It is rebuilt from the entries, so correcting an entry's time or state updates every report.

## Files

```
index.html               app shell
css/app.css              styles (light and dark)
js/config.js             Firebase settings and main admin email
js/i18n.js               French text (screen, messages, PDFs) and default names
js/app.js                the app
vendor/jspdf.umd.min.js  PDF library (jsPDF 2.5.1, MIT)
sw.js, manifest.webmanifest, icons/   installable app and offline start-up
firestore.rules          database security rules
firestore.indexes.json   database indexes
```

## Updating the database rules

When `firestore.rules` changes in this repository, paste the whole file into **Firebase console > Firestore Database > Rules** again and press **Publish**. Until then the database keeps the old rules, and any feature that needs the new ones is refused.

## Adding or changing a French translation

All French text is in `js/i18n.js`. Each line pairs the English text exactly as it appears in the app with its French version. `{0}`, `{1}` are filled in by the app (a name, a time, a count), and `{0^}` does the same with a capital first letter. Machine, state, alarm and equipment names go in the `DATA` list. After editing, raise the version number (`?v=` in `index.html` and `VERSION` in `sw.js`) so phones pick up the change.
