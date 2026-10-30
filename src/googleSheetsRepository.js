import { auth, sheets } from "@googleapis/sheets";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
// Rapikan No Tag
const normalizeTag = (tag) => tag?.trim().toLowerCase() ?? "";
// Rapikan No WhatsApp ke format 62
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

// Letak kolom tiap sheet
const SHEET_COLUMNS = {
    redTag: { tag: "B", closedAt: "N", writes: { M: "solvedBy", N: "closedDate", P: "solution" } },
    orangeTag: { tag: "D", closedAt: "K", writes: { I: "solution", J: "solvedBy", K: "closedDate" } },
    workRequest: { tag: "B", closedAt: "I", writes: { I: "closedDate", K: "solvedBy", L: "solution" } }
};

// Kolom detail untuk AI, nama field disamakan supaya satu fungsi cari cukup
const DETAIL_COLUMNS = {
    redTag: { no: "A", noTag: "B", tahun: "C", tanggal: "D", equipment: "F", ditemukanOleh: "G", kategori: "I", deskripsi: "J", line: "K", pic: "L", diselesaikanOleh: "M", tglClose: "N", status: "O", penanggulangan: "P", bulan: "R", bulanClose: "S" },
    orangeTag: { no: "A", tanggal: "C", noTag: "D", deskripsi: "E", equipment: "F", ditemukanOleh: "G", kategori: "H", penanggulangan: "I", diselesaikanOleh: "J", tglClose: "K", status: "L", department: "M", line: "N", tahun: "O", bulan: "P", bulanClose: "R" },
    workRequest: { tahun: "A", noTag: "B", deskripsi: "C", department: "D", keterangan: "E", tanggal: "F", pic: "G", tglClose: "I", status: "J", diselesaikanOleh: "K", penanggulangan: "L", kategori: "M" }
};

const columnIndex = (column) => column.charCodeAt(0) - 65;

// Akses sheet Red Tag, Orange Tag, WR, dan teknisi
export function createRedTagRepository({ spreadsheetId, sheetNames, technicianSheetName }) {
    const sheetsClient = sheets({ version: "v4", auth: new auth.GoogleAuth({ scopes: [SHEETS_SCOPE] }) });

    // Diberi kutip karena nama sheet ada spasi
    const sheetRange = (type, cells) => `'${sheetNames[type]}'!${cells}`;

    // Ambil nomor dan tanggal close semua baris satu sheet
    async function listTags(type) {
        const { tag, closedAt } = SHEET_COLUMNS[type];
        const response = await sheetsClient.spreadsheets.values.get({ spreadsheetId, range: sheetRange(type, `${tag}:${closedAt}`) });
        const rows = response.data.values ?? [];
        const closedAtIndex = columnIndex(closedAt) - columnIndex(tag);
        return rows.flatMap((row, index) =>
            row[0] ? [{ rowNumber: index + 1, tagNumber: row[0].trim(), closedAt: row[closedAtIndex] ?? "" }] : []
        );
    }

    // Isi kolom penanggulangan, PIC, dan tanggal close
    async function closeTag(type, { rowNumber, ...values }) {
        const data = Object.entries(SHEET_COLUMNS[type].writes).map(([column, field]) => ({
            range: sheetRange(type, `${column}${rowNumber}`),
            values: [[values[field]]]
        }));
        await sheetsClient.spreadsheets.values.batchUpdate({
            spreadsheetId,
            requestBody: { valueInputOption: "USER_ENTERED", data }
        });
    }

    // Kosongkan kolom yang diisi saat close
    async function reopenTag(type, rowNumber) {
        const ranges = Object.keys(SHEET_COLUMNS[type].writes).map((column) => sheetRange(type, `${column}${rowNumber}`));
        await sheetsClient.spreadsheets.values.batchClear({ spreadsheetId, requestBody: { ranges } });
    }

    // Ambil detail satu sheet untuk AI, baris 1 judul dilewati
    async function listDetails(type) {
        const columns = DETAIL_COLUMNS[type];
        const response = await sheetsClient.spreadsheets.values.get({ spreadsheetId, range: sheetRange(type, "A2:S") });
        const rows = response.data.values ?? [];

        return rows.filter((row) => row[columnIndex(columns.noTag)]).map((row) =>
            Object.fromEntries(Object.entries(columns).map(([field, column]) => [field, row[columnIndex(column)]]))
        );
    }

    // Cek No WhatsApp di kolom E tab teknisi
    async function isTechnician(phone) {
        const response = await sheetsClient.spreadsheets.values.get({ spreadsheetId, range: `'${technicianSheetName}'!E:E` });
        const rows = response.data.values ?? [];
        return rows.some((row) => normalizePhone(row[0]) === normalizePhone(phone));
    }

    return { listTags, listDetails, closeTag, reopenTag, isTechnician };
}