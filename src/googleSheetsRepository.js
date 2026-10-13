import { auth, sheets } from "@googleapis/sheets";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

// Samakan format No Tag supaya beda huruf besar kecil dan spasi tidak berpengaruh
const normalizeTag = (tag) => tag?.trim().toLowerCase() ?? "";

// Angka saja dicocokkan ke nomor belakang tag ("8530" sama dengan ".../08530"), selain itu harus sama persis
export function isSameTag(storedTag, tagInput) {
    const stored = normalizeTag(storedTag);
    const input = normalizeTag(tagInput);

    if (/^\d+$/.test(input)) {
        const trailingNumber = stored.split("/").pop();
        return /^\d+$/.test(trailingNumber) && Number(trailingNumber) === Number(input);
    }

    return stored === input;
}

// Akses sheet Red Tag: cari tag, close, dan buka kembali
export function createRedTagRepository({ spreadsheetId, sheetName }) {
    const sheetsClient = sheets({ version: "v4", auth: new auth.GoogleAuth({ scopes: [SHEETS_SCOPE] }) });

    // Nama sheet diberi tanda kutip supaya nama yang ada spasinya tetap valid
    const sheetRange = (cells) => `'${sheetName}'!${cells}`;

    // Cari semua baris yang No Tag-nya cocok, kolom B = No Tag dan kolom N = Tgl Close (index 12 dalam B:N)
    async function findRedTags(tagInput) {
        const response = await sheetsClient.spreadsheets.values.get({ spreadsheetId, range: sheetRange("B:N") });
        const rows = response.data.values ?? [];

        return rows.flatMap((row, index) =>
            row[0] && isSameTag(row[0], tagInput)
                ? [{ rowNumber: index + 1, tagNumber: row[0].trim(), closedAt: row[12] ?? "" }]
                : []
        );
    }

    // Isi PIC, Tgl Close, dan Penanggulangan, kolom O (Status) tidak ditulis karena berisi rumus
    async function closeRedTag({ rowNumber, solvedBy, closedDate, solution }) {
        await sheetsClient.spreadsheets.values.batchUpdate({
            spreadsheetId,
            requestBody: {
                valueInputOption: "USER_ENTERED",
                data: [
                    { range: sheetRange(`M${rowNumber}:N${rowNumber}`), values: [[solvedBy, closedDate]] },
                    { range: sheetRange(`P${rowNumber}`), values: [[solution]] }
                ]
            }
        });
    }

    // Kosongkan PIC, Tgl Close, dan Penanggulangan, Status otomatis kembali Open
    async function reopenRedTag(rowNumber) {
        await sheetsClient.spreadsheets.values.batchClear({
            spreadsheetId,
            requestBody: { ranges: [sheetRange(`M${rowNumber}:N${rowNumber}`), sheetRange(`P${rowNumber}`)] }
        });
    }

    return { findRedTags, closeRedTag, reopenRedTag };
}
