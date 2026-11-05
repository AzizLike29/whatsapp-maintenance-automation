import { PublicClientApplication } from "@azure/msal-node";
import ExcelJS from "exceljs";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ASIA_JAKARTA } from "./constants.js";
import { logger } from "./logger.js";
import { matchesFilter } from "./redTagSearch.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const MSAL_CACHE = path.join(ROOT, "auth_info", "msal-cache.json");
const GRAPH = "https://graph.microsoft.com/v1.0";
const MONTHS_FILE = ["JAN", "FEB", "MAR", "APR", "MEI", "JUN", "JUL", "AGS", "SEP", "OKT", "NOV", "DES"];
const MONTHS_HEADER = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];
const SCOPES = ["Files.ReadWrite.All", "offline_access"];
const SOFFICE_CANDIDATES = [
    "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
    "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe"
];
const FONT_DIR = path.join(ROOT, "fonts");
const REPORT_FONT = "Kalbe Rounded";
const CELL_INDENT = 1;
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
        header: (year, dateText) => `&C&"Kalbe Rounded,Bold"&48&K002060RED TAG ${year}&R&"Kalbe Rounded"&26 ${dateText}`
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
            return `&C&"Kalbe Rounded,Bold"&48&K002060ORANGE TAG ${year}&R&"Kalbe Rounded"&36 ${day} ${monthName}&K002060 ${updateYear}`;
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
        header: (_year, _dateText, receivedAt) => {
            const { day, month, year } = jakartaParts(receivedAt);
            const stamp = `${day}${MONTHS_FILE[month - 1]}${year.slice(-2)}`;
            return `&C&"Kalbe Rounded Medium"&28WR PRINT ${stamp}`;
        }
    }
};

// Pecah tanggal pesan zona Jakarta
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

// Tahun dari permintaan atau hari ini
export function reportYear(receivedAt, requestedYear) {
    const requested = String(requestedYear ?? "").trim();
    return requested || jakartaParts(receivedAt).year;
}

// Nama file PDF
export function buildFileName(prefix, receivedAt) {
    const { day, month, year } = jakartaParts(receivedAt);
    return `${prefix} ${day}${MONTHS_FILE[month - 1]}${year.slice(-2)}.pdf`;
}

// Tanggal di header PDF
export function headerDate(receivedAt) {
    const { day, month, year } = jakartaParts(receivedAt);
    return `${day} ${MONTHS_HEADER[month - 1]} ${year}`;
}

// Baris Open sesuai tahun dan filter
export function filterOpenRows(rows, year, filters = {}) {
    const activeFilters = Object.entries(filters).filter(([, value]) => value !== undefined && String(value).trim() !== "");
    return rows.filter((row) =>
        String(row.status ?? "").trim().toLowerCase() === "open"
        && String(row.tahun ?? "").trim() === String(year)
        && activeFilters.every(([field, value]) => matchesFilter(row, field, value))
    );
}

// Nilai sel sesuai kolom template
export function mapTemplateRow(type, row) {
    return REPORT_TYPES[type].fields.map((field) => row[field] ?? "");
}

// Pesan tunggu
export function buildWaitingMessage() {
    return "Siap, saya buatkan dulu ya";
}

// Pesan setelah PDF terkirim
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

// Pesan PDF terkirim saat upload menunggu IT
export function buildPendingUploadMessage({ year, filename, folderLabel, folderUrl }) {
    return [
        `Berikut format PDF yang aku berikan untuk tahun ${year}.`,
        "",
        filename,
        "",
        `Upload ke link template ${folderLabel} masih menunggu izin IT. Kalau sudah disetujui, minta PDF lagi ya.`,
        folderUrl
    ].join("\n");
}

// Pesan gagal PDF
export function buildPdfFailedMessage() {
    return "Maaf, gagal membuat PDF. Silakan coba kembali beberapa saat lagi ya";
}

// Isi sel jadi angka atau teks
function cellValue(value) {
    const text = value == null ? "" : String(value);
    if (text === "") {
        return null;
    }
    return /^\d+$/.test(text) ? Number(text) : text;
}

// Salin gaya sel
function snapshotStyle(cell) {
    return {
        font: cell.font ? { ...cell.font } : undefined,
        alignment: cell.alignment ? { ...cell.alignment } : undefined,
        border: cell.border ? JSON.parse(JSON.stringify(cell.border)) : undefined,
        fill: cell.fill ? JSON.parse(JSON.stringify(cell.fill)) : undefined,
        numFmt: cell.numFmt
    };
}

// Tempel gaya ke sel baru
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

// Pakai Kalbe Rounded, ukuran dari template
function applyReportLook(cell) {
    cell.font = {
        ...(cell.font || {}),
        name: REPORT_FONT
    };
    cell.alignment = {
        ...(cell.alignment || {}),
        indent: Math.max(Number(cell.alignment?.indent) || 0, CELL_INDENT),
        vertical: cell.alignment?.vertical || "middle",
        wrapText: true
    };
}

// Jumlah baris bungkus di lebar kolom
function wrappedLineCount(text, columnWidth, fontSize) {
    const raw = String(text ?? "").trim();
    if (!raw) {
        return 1;
    }

    const size = Number(fontSize) || 20;
    const charsPerLine = Math.max(4, Math.floor(((Number(columnWidth) || 10) - CELL_INDENT - 1) * 11 / size));
    let lines = 0;

    for (const paragraph of raw.split(/\r?\n/)) {
        const words = paragraph.split(/\s+/).filter(Boolean);
        if (words.length === 0) {
            lines += 1;
            continue;
        }

        let current = 0;
        for (const word of words) {
            const extra = current === 0 ? word.length : word.length + 1;
            if (current > 0 && current + extra > charsPerLine) {
                lines += 1;
                current = 0;
            }
            if (word.length > charsPerLine) {
                if (current > 0) {
                    lines += 1;
                }
                lines += Math.floor(word.length / charsPerLine);
                current = word.length % charsPerLine;
            } else {
                current += extra;
            }
        }
        lines += 1;
    }

    return Math.max(1, lines);
}

// Tinggi baris dari jumlah baris teks
function heightForLines(lines, fontSize) {
    const point = Number(fontSize) || 20;
    return Math.max(point + 4, lines * (point + 4));
}

// Kata terpanjang tanpa pecah di tengah
function longestToken(text) {
    const parts = String(text ?? "").split(/\s+/).filter(Boolean);
    return Math.max(1, ...parts.map((part) => part.length));
}

// Lebar kolom supaya kata utuh tidak kepotong
function fitColumnWidth(sheet, col, texts, fontSize) {
    const longest = Math.max(1, ...texts.map(longestToken));
    sheet.getColumn(col).width = longest * ((Number(fontSize) || 20) / 11) * 1.35 + 3;
}

// Isi template Excel
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
    const sampleHeight = sample.height;
    const sampleSize = sample.getCell(1).font?.size || 20;
    sample.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        styleCells[colNumber] = snapshotStyle(cell);
    });
    const oldCount = sheet.rowCount;

    if (oldCount > 1) {
        sheet.spliceRows(2, oldCount - 1);
    }

    rows.forEach((row, index) => {
        const dest = sheet.getRow(index + 2);
        const values = mapTemplateRow(type, row);
        let lines = 1;
        values.forEach((value, colIndex) => {
            const cell = dest.getCell(colIndex + 1);
            if (styleCells[colIndex + 1]) {
                applyStyle(styleCells[colIndex + 1], cell);
            }
            applyReportLook(cell);
            cell.value = cellValue(value);
            lines = Math.max(lines, wrappedLineCount(value, sheet.getColumn(colIndex + 1).width, cell.font?.size || sampleSize));
        });
        dest.height = Math.max(sampleHeight || 0, heightForLines(lines, sampleSize));
        dest.commit();
    });

    const lastRow = Math.max(rows.length + 1, 1);
    const lastColNumber = sheet.getColumn(report.lastCol).number;
    const headerRow = sheet.getRow(1);
    for (let col = 1; col <= lastColNumber; col++) {
        const header = headerRow.getCell(col);
        if (/diselesaikan\s+oleh/i.test(String(header.value ?? "").replace(/\n/g, " "))) {
            header.value = "Diselesaikan\nOleh";
        }
        header.alignment = {
            ...(header.alignment || {}),
            horizontal: "center",
            vertical: "middle",
            wrapText: true,
            indent: 0
        };
    }

    for (const field of ["pic", "tahun", "diselesaikanOleh"]) {
        const col = report.fields.indexOf(field) + 1;
        if (col > 0) {
            fitColumnWidth(sheet, col, [
                headerRow.getCell(col).value,
                ...rows.map((row) => row[field])
            ], sampleSize);
        }
    }
    const leftoverEnd = Math.max(sheet.actualRowCount || 0, sheet.rowCount || 0);
    for (let r = lastRow + 1; r <= leftoverEnd; r++) {
        const leftover = sheet.getRow(r);
        for (let col = 1; col <= lastColNumber; col++) {
            leftover.getCell(col).value = null;
        }
        leftover.hidden = true;
        leftover.height = 0.1;
    }
    sheet.autoFilter = undefined;

    sheet.headerFooter.oddHeader = report.header(year, headerDate(receivedAt), receivedAt);
    sheet.pageSetup.paperSize = 9;
    sheet.pageSetup.fitToPage = true;
    sheet.pageSetup.fitToWidth = 1;
    sheet.pageSetup.fitToHeight = 0;
    sheet.pageSetup.printTitlesRow = "1:1";
    sheet.pageSetup.printArea = `A1:${report.lastCol}${lastRow}`;

    // OT saja, judul tidak tenggelam dan Dept Line tidak mepet garis
    if (type === "orangeTag") {
        sheet.pageSetup.margins = {
            ...(sheet.pageSetup.margins || {}),
            header: 0.45,
            top: 1.4
        };
        for (const field of ["department", "line"]) {
            const col = report.fields.indexOf(field) + 1;
            if (col <= 0) {
                continue;
            }
            for (let r = 2; r <= lastRow; r++) {
                const cell = sheet.getRow(r).getCell(col);
                cell.alignment = {
                    ...(cell.alignment || {}),
                    horizontal: "left",
                    indent: Math.max(Number(cell.alignment?.indent) || 0, 2)
                };
            }
        }
    }

    // WR saja, jarak tipis di Tahun PIC dan Description
    if (type === "workRequest") {
        for (let r = 2; r <= lastRow; r++) {
            const row = sheet.getRow(r);
            const tahun = row.getCell(1);
            tahun.alignment = {
                ...(tahun.alignment || {}),
                horizontal: "right",
                indent: Math.max(Number(tahun.alignment?.indent) || 0, 1)
            };
            for (const field of ["deskripsi", "pic"]) {
                const col = report.fields.indexOf(field) + 1;
                const cell = row.getCell(col);
                cell.alignment = {
                    ...(cell.alignment || {}),
                    horizontal: "left",
                    indent: Math.max(Number(cell.alignment?.indent) || 0, 2)
                };
            }
        }
    }

    for (let col = lastColNumber + 1; col <= Math.max(sheet.columnCount, lastColNumber); col++) {
        sheet.getColumn(col).hidden = true;
        sheet.getColumn(col).width = 0;
    }
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

// Klien login Microsoft
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

// Token Microsoft dari cache
async function getSilentAccessToken(clientId) {
    const app = getMsalApp(clientId);
    const accounts = await app.getTokenCache().getAllAccounts();

    if (!accounts[0]) {
        throw new Error("Login Microsoft belum ada");
    }

    const silent = await app.acquireTokenSilent({ account: accounts[0], scopes: SCOPES });
    if (!silent?.accessToken) {
        throw new Error("Token Microsoft tidak tersedia");
    }
    return silent.accessToken;
}

// Unggah ke Graph
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

// Salin font Kalbe ke profil LibreOffice
async function copyKalbeFonts(profile) {
    if (!existsSync(FONT_DIR)) {
        return;
    }

    const dest = path.join(profile, "user", "fonts");
    await mkdir(dest, { recursive: true });
    const files = (await readdir(FONT_DIR)).filter((file) => /^KalbeRounded-.*\.ttf$/i.test(file));
    await Promise.all(files.map((file) => copyFile(path.join(FONT_DIR, file), path.join(dest, file))));
}

// Cari soffice di Windows
export function resolveSofficePath(candidates = SOFFICE_CANDIDATES) {
    const found = candidates.find((candidate) => existsSync(candidate));
    if (!found) {
        throw new Error("LibreOffice belum terpasang");
    }
    return found;
}

// Jalankan LibreOffice headless
function runSoffice(soffice, dir, xlsxPath, profile) {
    return new Promise((resolve, reject) => {
        const child = spawn(soffice, [
            `-env:UserInstallation=${pathToFileURL(profile).href}`,
            "--headless",
            "--norestore",
            "--nologo",
            "--nolockcheck",
            "--convert-to",
            "pdf:calc_pdf_Export",
            "--outdir",
            dir,
            xlsxPath
        ], { windowsHide: true });
        let stderr = "";
        child.stderr.on("data", (chunk) => {
            stderr += chunk;
        });
        const timer = setTimeout(() => {
            child.kill();
            reject(new Error("LibreOffice timeout"));
        }, 60000);
        child.on("error", (error) => {
            clearTimeout(timer);
            reject(error);
        });
        child.on("close", (code) => {
            clearTimeout(timer);
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(`LibreOffice ${code}: ${stderr}`.trim()));
        });
    });
}

// Ubah Excel jadi PDF
export async function convertXlsxToPdf(xlsx, filename) {
    const soffice = resolveSofficePath();
    const dir = await mkdtemp(path.join(os.tmpdir(), "bot-pdf-"));
    const xlsxPath = path.join(dir, filename.replace(/\.pdf$/i, ".xlsx"));
    const pdfPath = path.join(dir, filename.replace(/\.pdf$/i, ".pdf"));
    const profile = path.join(dir, "lo-profile");

    try {
        await writeFile(xlsxPath, xlsx);
        await copyKalbeFonts(profile);
        await runSoffice(soffice, dir, xlsxPath, profile);
        if (!existsSync(pdfPath)) {
            throw new Error("LibreOffice tidak menghasilkan PDF");
        }
        return await readFile(pdfPath);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}

// Unggah PDF ke SharePoint
export async function uploadPdfToSharePoint({ type, filename, pdf }, { clientId, site }) {
    const report = REPORT_TYPES[type];
    const token = await getSilentAccessToken(clientId);
    const folderPath = `${report.folderPath}/${filename}`;
    await graphPut(
        `${GRAPH}/sites/${site}:/drive/root:/${folderPath}:/content`,
        pdf,
        "application/pdf",
        token
    );
}

// PDF dari data Open dashboard
export async function exportPdfReport({
    type,
    requestedYear,
    receivedAt,
    listDetails,
    fill = fillTemplate,
    convertXlsxToPdf: convertPdf = convertXlsxToPdf,
    uploadPdf,
    folderUrls = DEFAULT_LINKS,
    filters = {}
}) {
    const report = REPORT_TYPES[type];
    const year = reportYear(receivedAt, requestedYear);
    const rows = filterOpenRows(await listDetails(type), year, filters);
    const xlsx = await fill(type, rows, { year, receivedAt });
    const filename = buildFileName(report.prefix, receivedAt);
    const pdf = await convertPdf(xlsx, filename);
    let uploaded = false;

    if (uploadPdf) {
        try {
            await uploadPdf({ type, filename, pdf });
            uploaded = true;
        } catch (error) {
            logger.warn(`Upload SharePoint ditunda: ${error.message}`);
        }
    }

    return {
        filename,
        pdf,
        year,
        folderLabel: report.folderLabel,
        folderUrl: folderUrls[report.folderKey] || DEFAULT_LINKS[report.folderKey],
        uploaded
    };
}

// Hubungkan ekspor PDF ke dashboard LibreOffice dan SharePoint
export function createExportReport({ redTagRepository, clientId, site = DEFAULT_SITE, folderUrls = DEFAULT_LINKS }) {
    return ({ type, requestedYear, receivedAt, filters }) => exportPdfReport({
        type,
        requestedYear,
        receivedAt,
        filters,
        listDetails: (sheetType) => redTagRepository.listDetails(sheetType),
        convertXlsxToPdf,
        uploadPdf: (payload) => uploadPdfToSharePoint(payload, { clientId, site }),
        folderUrls
    });
}
