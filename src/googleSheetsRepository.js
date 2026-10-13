import { auth, sheets } from "@googleapis/sheets";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
// Rapikan No Tag
const normalizeTag = (tag) => tag?.trim().toLowerCase() ?? "";
// Rapikan No WA ke format 62
export const normalizePhone = (phone) => String(phone ?? "").replace(/\D/g, "").replace(/^0/, "62");

// Cocokkan No Tag lengkap atau nomor belakang
export function isSameTag(storedTag, tagInput) {
    const stored = normalizeTag(storedTag);
    const input = normalizeTag(tagInput);

    if (/^\d+$/.test(input)) {
        const trailingNumber = stored.split("/").pop();
        return /^\d+$/.test(trailingNumber) && Number(trailingNumber) === Number(input);
    }

    return stored === input;
}

// Akses sheet Red Tag dan teknisi
export function createRedTagRepository({ spreadsheetId, sheetName, technicianSheetName }) {
    const sheetsClient = sheets({ version: "v4", auth: new auth.GoogleAuth({ scopes: [SHEETS_SCOPE] }) });

    // Diberi kutip karena nama sheet ada spasi
    const sheetRange = (cells) => `'${sheetName}'!${cells}`;

    // Ambil semua tag sekali baca, kolom B No Tag, N Tgl Close
    async function listRedTags() {
        const response = await sheetsClient.spreadsheets.values.get({ spreadsheetId, range: sheetRange("B:N") });
        const rows = response.data.values ?? [];

        return rows.flatMap((row, index) =>
            row[0] ? [{ rowNumber: index + 1, tagNumber: row[0].trim(), closedAt: row[12] ?? "" }] : []
        );
    }

    // Isi M, N, P, kolom O rumus jangan ditulis
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

    // Kosongkan M, N, P
    async function reopenRedTag(rowNumber) {
        await sheetsClient.spreadsheets.values.batchClear({
            spreadsheetId,
            requestBody: { ranges: [sheetRange(`M${rowNumber}:N${rowNumber}`), sheetRange(`P${rowNumber}`)] }
        });
    }

    // Cek No WA di kolom E tab teknisi
    async function isTechnician(phone) {
        const response = await sheetsClient.spreadsheets.values.get({ spreadsheetId, range: `'${technicianSheetName}'!E:E` });
        const rows = response.data.values ?? [];
        return rows.some((row) => normalizePhone(row[0]) === normalizePhone(phone));
    }

    return { listRedTags, closeRedTag, reopenRedTag, isTechnician };
}