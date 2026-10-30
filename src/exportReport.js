import { PublicClientApplication } from "@azure/msal-node";
import ExcelJS from "exceljs";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ASIA_JAKARTA } from "./constants.js";
import { logger } from "./logger.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const MSAL_CACHE = path.join(ROOT, "auth_info", "msal-cache.json");
const GRAPH = "https://graph.microsoft.com/v1.0";
const MONTHS_FILE = ["JAN", "FEB", "MAR", "APR", "MEI", "JUN", "JUL", "AGS", "SEP", "OKT", "NOV", "DES"];
const MONTHS_HEADER = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];
const SCOPES = ["Files.ReadWrite.All", "offline_access"];
const DEFAULT_SITE = "onekn-my.sharepoint.com:/personal/nila_agustina_kalbenutritionals_com";
const DEFAULT_LINKS = {
    wr: "https://onekn-my.sharepoint.com/shared?id=%2Fpersonal%2Fnila%5Fagustina%5Fkalbenutritionals%5Fcom%2FDocuments%2FData%20Sanghiang%2FOps%20Adm%2FTemplate%2FWR",
    tag: "https://onekn-my.sharepoint.com/shared?id=%2Fpersonal%2Fnila%5Fagustina%5Fkalbenutritionals%5Fcom%2FDocuments%2FData%20Sanghiang%2FOps%20Adm%2FTemplate%2FTag"
};

export const REPORT_TYPES = {
    redTag: {
        prefix: "RT",
        template: path.join(ROOT, "Eksekusi PDF", "RT & OT", "Template Tag.xlsx"),
        sheetName: "RT",
        fields: ["no", "noTag", "tahun", "equipment", "ditemukanOleh", "deskripsi", "line", "pic", "diselesaikanOleh", "tglClose"],
        lastCol: "J",
        folderKey: "tag",
        folderLabel: "Tag",
        folderPath: "Data Sanghiang/Ops Adm/Template/Tag",
        header: (year, dateText) => `&C&"-,Bold"&48&K002060RED TAG ${year}&R&26 ${dateText}`
    },
    orangeTag: {
        prefix: "OT",
        template: path.join(ROOT, "Eksekusi PDF", "RT & OT", "Template Tag.xlsx"),
        sheetName: "OT",
        fields: ["no", "noTag", "deskripsi", "equipment", "ditemukanOleh", "diselesaikanOleh", "tglClose", "department", "line", "tahun"],
        lastCol: "J",
        folderKey: "tag",
        folderLabel: "Tag",
        folderPath: "Data Sanghiang/Ops Adm/Template/Tag",
        header: (year, dateText) => {
            const [day, monthName, updateYear] = dateText.split(" ");
            return `&C&"-,Bold"&48&K002060ORANGE TAG ${year}&R&"-,Bold"&36 ${day} ${monthName}&K002060 ${updateYear}`;
        }
    },
    workRequest: {
        prefix: "WR",
        template: path.join(ROOT, "Eksekusi PDF", "WR", "Template WR.xlsx"),
        sheetName: "Pakai ini",
        fields: ["tahun", "noTag", "deskripsi", "department", "pic", "tglClose", "keterangan"],
        lastCol: "G",
        folderKey: "wr",
        folderLabel: "WR",
        folderPath: "Data Sanghiang/Ops Adm/Template/WR",
        header: (_year, dateText) => `&C&28WR PRINT ${dateText}`
    }
};

// Ambil tanggal pesan zona Jakarta
function jakartaParts(receivedAt) {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat("en-GB", {
            timeZone: ASIA_JAKARTA,
            day: "numeric",
            month: "numeric",
            year: "numeric"
        }).formatToParts(new Date(receivedAt)).map((part) => [part.type, part.value])
    );
    return { day: Number(parts.day), month: Number(parts.month), year: parts.year };
}

// Ambil tahun data dari permintaan atau hari ini
export function reportYear(receivedAt, requestedYear) {
    const requested = String(requestedYear ?? "").trim();
    return requested || jakartaParts(receivedAt).year;
}

// Buat nama file PDF
export function buildFileName(prefix, receivedAt) {
    const { day, month, year } = jakartaParts(receivedAt);
    return `${prefix} ${day}${MONTHS_FILE[month - 1]}${year.slice(-2)}.pdf`;
}

// Buat tanggal untuk header PDF
export function headerDate(receivedAt) {
    const { day, month, year } = jakartaParts(receivedAt);
    return `${day} ${MONTHS_HEADER[month - 1]} ${year}`;
}

// Saring baris Open sesuai tahun
export function filterOpenRows(rows, year) {
    return rows.filter((row) =>
        String(row.status ?? "").trim().toLowerCase() === "open"
        && String(row.tahun ?? "").trim() === String(year)
    );
}

// Susun nilai sel sesuai kolom template
export function mapTemplateRow(type, row) {
    return REPORT_TYPES[type].fields.map((field) => row[field] ?? "");
}

// Pesan tunggu saat PDF dibuat
export function buildWaitingMessage() {
    return "siap tuan saya akan buatkan, tolong tunggu ya";
}

// Pesan selesai setelah PDF dikirim
export function buildDoneMessage({ year, filename, folderLabel, folderUrl }) {
    return [
        `Berikut format PDF yang aku berikan untuk tahun ${year}.`,
        "",
        filename,
        "",
        `Tambahan info, pdf ini sudah saya upload ke dalam link template ${folderLabel}.`,
        folderUrl
    ].join("\n");
}

// Pesan gagal membuat PDF
export function buildPdfFailedMessage() {
    return "Maaf, gagal membuat PDF. Silakan coba kembali beberapa saat lagi ya";
}

// Ubah isi sel jadi angka atau teks
function cellValue(value) {
    const text = value == null ? "" : String(value);
    if (text === "") {
        return null;
    }
    return /^\d+$/.test(text) ? Number(text) : text;
}

// Salin gaya sel template
function snapshotStyle(cell) {
    return {
        font: cell.font ? { ...cell.font } : undefined,
        alignment: cell.alignment ? { ...cell.alignment } : undefined,
        border: cell.border ? JSON.parse(JSON.stringify(cell.border)) : undefined,
        fill: cell.fill ? JSON.parse(JSON.stringify(cell.fill)) : undefined,
        numFmt: cell.numFmt
    };
}

// Terapkan gaya sel ke baris baru
function applyStyle(snapshot, target) {
    target.style = {
        font: snapshot.font,
        alignment: snapshot.alignment,
        border: snapshot.border,
        fill: snapshot.fill
    };
    if (snapshot.numFmt) {
        target.numFmt = snapshot.numFmt;
    }
}

// Isi template Excel untuk satu jenis laporan
export async function fillTemplate(type, rows, { year, receivedAt }) {
    const report = REPORT_TYPES[type];
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(report.template);

    for (const sheet of workbook.worksheets) {
        sheet.state = sheet.name === report.sheetName ? "visible" : "hidden";
    }

    const sheet = workbook.getWorksheet(report.sheetName);
    const styleCells = [];
    const sample = sheet.getRow(2);
    sample.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        styleCells[colNumber] = snapshotStyle(cell);
    });
    const sampleHeight = sample.height;
    const oldCount = sheet.rowCount;

    if (oldCount > 1) {
        sheet.spliceRows(2, oldCount - 1);
    }

    rows.forEach((row, index) => {
        const dest = sheet.getRow(index + 2);
        dest.height = sampleHeight;
        mapTemplateRow(type, row).forEach((value, colIndex) => {
            const cell = dest.getCell(colIndex + 1);
            if (styleCells[colIndex + 1]) {
                applyStyle(styleCells[colIndex + 1], cell);
            }
            cell.value = cellValue(value);
        });
        dest.commit();
    });

    const lastRow = Math.max(rows.length + 1, 1);
    sheet.headerFooter.oddHeader = report.header(year, headerDate(receivedAt));
    sheet.pageSetup.paperSize = 9;
    sheet.pageSetup.fitToPage = true;
    sheet.pageSetup.fitToWidth = 1;
    sheet.pageSetup.fitToHeight = 0;
    sheet.pageSetup.printArea = `A1:${report.lastCol}${lastRow}`;
    workbook.views = [{ activeTab: workbook.worksheets.findIndex((item) => item.name === report.sheetName) }];

    return Buffer.from(await workbook.xlsx.writeBuffer());
}

const cachePlugin = {
    async beforeCacheAccess(context) {
        if (existsSync(MSAL_CACHE)) {
            context.tokenCache.deserialize(await readFile(MSAL_CACHE, "utf8"));
        }
    },
    async afterCacheAccess(context) {
        if (context.cacheHasChanged) {
            await mkdir(path.dirname(MSAL_CACHE), { recursive: true });
            await writeFile(MSAL_CACHE, context.tokenCache.serialize());
        }
    }
};

let msalApp;

// Buat klien login Microsoft
function getMsalApp(clientId) {
    msalApp ??= new PublicClientApplication({
        auth: {
            clientId,
            authority: "https://login.microsoftonline.com/organizations"
        },
        cache: { cachePlugin }
    });
    return msalApp;
}

// Ambil token Microsoft, minta kode login di terminal jika perlu
async function getAccessToken(clientId) {
    const app = getMsalApp(clientId);
    const accounts = await app.getTokenCache().getAllAccounts();

    if (accounts[0]) {
        try {
            const silent = await app.acquireTokenSilent({ account: accounts[0], scopes: SCOPES });
            if (silent?.accessToken) {
                return silent.accessToken;
            }
        } catch (error) {
            logger.warn(`Token Microsoft kedaluwarsa, minta login ulang: ${error.message}`);
        }
    }

    logger.info("Login Microsoft: buka tautan di HP lalu ketik kode yang muncul di bawah");
    const result = await app.acquireTokenByDeviceCode({
        scopes: SCOPES,
        deviceCodeCallback: (response) => logger.info(response.message)
    });
    return result.accessToken;
}

// Unggah file ke Graph
async function graphPut(url, body, contentType, token) {
    const response = await fetch(url, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
        body
    });
    if (!response.ok) {
        throw new Error(`Graph PUT ${response.status}: ${await response.text()}`);
    }
    return response;
}

// Ubah Excel jadi PDF lalu unggah ke SharePoint
export async function convertAndUploadSharePoint({ type, filename, xlsx }, { clientId, site, folderUrls }) {
    const report = REPORT_TYPES[type];
    const token = await getAccessToken(clientId);
    const tempName = `bot-temp-${Date.now()}.xlsx`;
    const tempPath = `/me/drive/root:/WhatsAppMaintenanceTemp/${tempName}`;

    await graphPut(
        `${GRAPH}${tempPath}:/content`,
        xlsx,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        token
    );

    const pdfResponse = await fetch(`${GRAPH}${tempPath}:/content?format=pdf`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    if (!pdfResponse.ok) {
        throw new Error(`Graph PDF ${pdfResponse.status}: ${await pdfResponse.text()}`);
    }
    const pdf = Buffer.from(await pdfResponse.arrayBuffer());

    const folderPath = `${report.folderPath}/${filename}`;
    await graphPut(
        `${GRAPH}/sites/${site}:/drive/root:/${folderPath}:/content`,
        pdf,
        "application/pdf",
        token
    );

    await fetch(`${GRAPH}${tempPath}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });

    return { pdf, folderUrl: folderUrls[report.folderKey] || DEFAULT_LINKS[report.folderKey] };
}

// Buat PDF dari data Open dashboard
export async function exportPdfReport({
    type,
    requestedYear,
    receivedAt,
    listDetails,
    convertAndUpload,
    folderUrls = DEFAULT_LINKS
}) {
    const report = REPORT_TYPES[type];
    const year = reportYear(receivedAt, requestedYear);
    const rows = filterOpenRows(await listDetails(type), year);
    const xlsx = await fillTemplate(type, rows, { year, receivedAt });
    const filename = buildFileName(report.prefix, receivedAt);
    const uploaded = await convertAndUpload({ type, filename, xlsx });
    return {
        filename,
        pdf: uploaded.pdf,
        year,
        folderLabel: report.folderLabel,
        folderUrl: uploaded.folderUrl || folderUrls[report.folderKey]
    };
}

// Hubungkan ekspor PDF ke dashboard dan SharePoint
export function createExportReport({ redTagRepository, clientId, site = DEFAULT_SITE, folderUrls = DEFAULT_LINKS }) {
    return ({ type, requestedYear, receivedAt }) => exportPdfReport({
        type,
        requestedYear,
        receivedAt,
        listDetails: (sheetType) => redTagRepository.listDetails(sheetType),
        convertAndUpload: (payload) => convertAndUploadSharePoint(payload, { clientId, site, folderUrls }),
        folderUrls
    });
}
