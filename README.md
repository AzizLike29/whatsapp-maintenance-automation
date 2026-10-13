# WhatsApp Maintenance Automation

Lets technicians close and reopen Red Tags in the "Red Tag" sheet of the maintenance dashboard by mentioning the bot in a WhatsApp group.

## How It Works

```text
Receive WhatsApp Message      (whatsAppClient.js)
  → Normalize Message          (normalizeMessage.js)
  → Validate Source Group      (processMessage.js)
  → Require Bot Mention + No Tag
  → Find Red Tag Row           (googleSheetsRepository.js)
  → Close or Reopen the Row    (googleSheetsRepository.js)
  → Send WhatsApp Reply
```

- Messages from groups not listed in `ALLOWED_GROUP_IDS` are ignored.
- Only messages that mention the bot and contain a `No Tag:` line are processed. Other chat messages are ignored.
- Messages sent from the bot's own WhatsApp account are ignored, so test from another number.

## Message Format

Each field must be on its own line, below the mention. Labels are case-insensitive and tolerate extra spaces and WhatsApp bold (`*No Tag*:`).

Close a tag:

```text
@Bot
No Tag: 24308
Penanggulangan: Ganti belt
PIC: Alim
```

Reopen a tag:

```text
@Bot
No Tag: 24308
Status: Open
```

`No Tag` accepts the full tag (`RT/LINEB/07/2026/24308`) or only its trailing number (`24308`, leading zeros optional). Trailing numbers repeat across years, so a close only matches tags that are still Open and a reopen only matches tags that are Closed. When more than one tag still matches, nothing is changed and the bot asks for the full tag.

## Sheet Columns

| Column | Header                              | Close         | Reopen  |
| ------ | ----------------------------------- | ------------- | ------- |
| B      | No Tag                              | Read          | Read    |
| M      | Diselesaikan Oleh                   | `PIC` value   | Cleared |
| N      | Tgl Close                           | Today's date  | Cleared |
| O      | Status                              | Not written   | Not written |
| P      | Keterangan/Kendala/Penanggulangan   | `Penanggulangan` value (overwrites) | Cleared |

Status is a formula (`=IF(N="","Open","Close")`), so it follows Tgl Close automatically. Tgl Close is written as a real date so the Close Week and Month Close formulas keep working.

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
6. The spreadsheet must be a Google Sheets file. If it shows an `.XLSX` badge next to its title, use **File → Save as Google Sheets** and use the new file's ID. The tab name must match `RED_TAG_SHEET_NAME`.

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
3. Copy the `groupId` from the log line `Ignoring messageId=... from non-allowed groupId=...@g.us`.
4. Put it in `ALLOWED_GROUP_IDS` in `.env` and restart with `npm start`.

The session is saved in `auth_info/`, so the QR code is only needed once. If the session is logged out, delete `auth_info/` and link again.

## Testing

```bash
npm test
```

Tests cover field extraction, tag matching, and the close/reopen flow using fake dependencies; they do not call WhatsApp or Google.

## Sensitive Files

Never commit or share these (already in `.gitignore`):

- `.env`
- `credentials/` — Google service account key
- `auth_info/` — WhatsApp session secrets
