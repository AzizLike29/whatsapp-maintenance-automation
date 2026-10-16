# WhatsApp Maintenance Automation

Lets technicians close and reopen Red Tags, Orange Tags, and Work Requests in the maintenance dashboard by mentioning the bot in a WhatsApp group, and answers questions about Red Tag data with Gemini AI.

## How It Works

```text
Receive WhatsApp Message        (whatsAppClient.js)
  → Normalize Message            (normalizeMessage.js)
  → Validate Source Group        (processMessage.js)
  → Require Bot Mention
  → Check Sender Is a Technician (Data Teknisi tab)
  → With No RT / No OT / No WR:
      Split Message per Block    (extractField.js)
      Close or Reopen Each Row   (googleSheetsRepository.js)
      Send One Summary Reply     (acknowledgementMessages.js)
  → Without them:
      Answer with Gemini AI      (aiAssistant.js, redTagSearch.js)
```

- Messages from groups not listed in `ALLOWED_GROUP_IDS` are ignored.
- Only messages that mention the bot are processed. Messages with a `No RT:`, `No OT:`, or `No WR:` line close or reopen rows; other mentions are answered by the AI when `GEMINI_API_KEY` is set, otherwise ignored.
- Only senders whose WhatsApp number is in column E of the `Data Teknisi` tab can use the bot.
- Messages sent from the bot's own WhatsApp account are ignored, so test from another number.

## Message Format

Each field must be on its own line, below the mention. Labels are case-insensitive and tolerate extra spaces and WhatsApp bold (`*No RT*:`).

Close a Red Tag:

```text
@Bot
No RT: 24308
Penanggulangan: Ganti belt
PIC: Alim
```

Reopen a Red Tag:

```text
@Bot
No RT: 24308
Status: Open
```

Several tags in one message (mention the bot once, list numbers are optional, each number label line starts a new block):

```text
@Bot
1. No RT: 24308
Penanggulangan: Ganti belt
PIC: Alim

2. No RT: 24311
Status: Open
```

Each sheet has its own number label:

| Sheet        | Number label | Other labels                 |
| ------------ | ------------ | ---------------------------- |
| Red Tag      | `No RT`      | `Penanggulangan`, `PIC`      |
| Orange Tag   | `No OT`      | `Penanggulangan`, `PIC`      |
| Work Request | `No WR`      | `Penanggulangan`, `Executor` |

Close an Orange Tag and a Work Request in one message:

```text
@Bot
No OT: OT/LINEC/04/2026/06755
Penanggulangan: Pengelasan plat
PIC: Wahyu

No WR: 194889
Penanggulangan: Pasang sensor
Executor: Ripal
```

Reopen works the same for every sheet: the number label plus `Status: Open`.

The bot replies once with a summary of every tag, including the close date and time (WIB). A failed tag does not stop the others.

A number accepts the full value (`RT/LINEB/07/2026/24308`) or only its trailing number (`24308`, leading zeros optional). Trailing numbers repeat across years, so a close only matches rows that are still Open and a reopen only matches rows that are Closed. When more than one row still matches, nothing is changed and the bot asks for the full number.

## Sheet Columns

The bot never writes the Status column. Status is a formula that turns Close when the close date column is filled.

| Sheet      | Number          | Penanggulangan | PIC / Executor        | Close date    | Status formula |
| ---------- | --------------- | -------------- | --------------------- | ------------- | -------------- |
| Red Tag    | B               | P              | M (Diselesaikan Oleh) | N (Tgl Close) | O, follows N   |
| Orange Tag | D               | I              | J (PIC Perbaikan)     | K (Tgl Close) | L, follows K   |
| WR         | B (Sumber Data) | L              | K (Executor)          | I (Close)     | J, follows I   |

Close overwrites these three columns and reopen clears them. Close dates are written as real dates so week and month formulas keep working. For WR, only numeric values in Sumber Data (e.g. `194889`) can be matched.

## AI Questions

Mention the bot without a number label to ask about Red Tag data:

```text
@Bot berapa red tag yang masih open? rekap per line
```

The AI only reads data; counting and filtering are done in code (`redTagSearch.js`) and the AI summarizes the result. It cannot close or reopen rows. Set `GEMINI_API_KEY` (free from [Google AI Studio](https://aistudio.google.com/apikey)) to enable it, and optionally `GEMINI_MODEL` (default `gemini-flash-lite-latest`). On the free tier Google may use submitted data to improve its models, and quotas can change.

## Requirements

- Node.js 20 or newer
- A dedicated WhatsApp number for the bot. This project uses [Baileys](https://github.com/WhiskeySockets/Baileys), an unofficial WhatsApp Web client; WhatsApp may ban numbers that use it, so do not use a personal number.
- A Google Cloud service account with access to the target spreadsheet

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Google service account

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create or select a project.
2. Enable the **Google Sheets API** (APIs & Services → Library).
3. Create a service account (APIs & Services → Credentials → Create credentials → Service account).
4. Open the service account → **Keys** → **Add key** → **JSON**. Save the file as `credentials/service-account.json`.
5. Open the spreadsheet in Google Sheets → **Share** → add the service account email (`...@...iam.gserviceaccount.com`) as **Editor**.
6. The spreadsheet must be a Google Sheets file. If it shows an `.XLSX` badge next to its title, use **File → Save as Google Sheets** and use the new file's ID. Tab names must match `RED_TAG_SHEET_NAME`, `ORANGE_TAG_SHEET_NAME`, `WORK_REQUEST_SHEET_NAME`, and `TECHNICIAN_SHEET_NAME`.

### 3. Configure environment variables

Copy `.env.example` to `.env` and fill in the values. Leave `ALLOWED_GROUP_IDS` empty for now.

### 4. Link WhatsApp and find the group ID

```bash
npm start
```

1. Link the bot's phone: WhatsApp → **Linked devices** → **Link a device**, then either:
   - scan the QR code shown in the terminal, or
   - if `WHATSAPP_PHONE_NUMBER` is set, choose **Link with phone number instead** and enter the pairing code shown in the terminal. Use this when the terminal QR code cannot be scanned.
2. Send any message in the maintenance group.
3. Copy the `groupId` from the log line `Pesan diabaikan karena grup belum diizinkan, messageId=... groupId=...@g.us`.
4. Put it in `ALLOWED_GROUP_IDS` in `.env` and restart with `npm start`.

The session is saved in `auth_info/`, so the QR code is only needed once. If the session is logged out, delete `auth_info/` and link again.

## Testing

```bash
npm test
```

Tests cover field extraction, tag matching, data search, the close/reopen flow for all three sheets, and the AI reply flow using fake dependencies; they do not call WhatsApp, Google, or Gemini.

## Sensitive Files

Never commit or share these (already in `.gitignore`):

- `.env`
- `credentials/` — Google service account key
- `auth_info/` — WhatsApp session secrets
