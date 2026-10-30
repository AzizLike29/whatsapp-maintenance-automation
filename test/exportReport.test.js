import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";
import { buildDoneMessage, buildFileName, buildWaitingMessage, fillTemplate, filterOpenRows, mapTemplateRow, reportYear } from "../src/exportReport.js";

const RECEIVED_AT = "2026-10-30T09:31:00+07:00";

const OPEN_RT = {
    no: "2238",
    noTag: "RT/LINEG1/03/2026/02475",
    tahun: "2026",
    equipment: "MC.LANGEN",
    ditemukanOleh: "SURYANI",
    deskripsi: "Cover buram",
    line: "G1",
    pic: "DAN",
    diselesaikanOleh: "",
    tglClose: "",
    status: "Open"
};

test("tahun otomatis dari tanggal pesan, kecuali user menyebut tahun", () => {
    assert.equal(reportYear(RECEIVED_AT), "2026");
    assert.equal(reportYear(RECEIVED_AT, "2025"), "2025");
    assert.equal(reportYear("2024-01-05T10:00:00+07:00"), "2024");
});

test("nama file pakai hari tanpa nol di depan dan bulan Indonesia", () => {
    assert.equal(buildFileName("RT", RECEIVED_AT), "RT 30OKT26.pdf");
    assert.equal(buildFileName("WR", "2026-01-03T08:00:00+07:00"), "WR 3JAN26.pdf");
    assert.equal(buildFileName("OT", "2026-08-26T08:00:00+07:00"), "OT 26AGS26.pdf");
});

test("hanya baris Open di tahun yang diminta, urutan atas ke bawah tetap", () => {
    const rows = [
        { ...OPEN_RT, noTag: "lama-2025", tahun: "2025", status: "Open" },
        { ...OPEN_RT, noTag: "close-2026", status: "Close" },
        { ...OPEN_RT, noTag: "open-a" },
        { ...OPEN_RT, noTag: "open-b", status: "open" }
    ];

    assert.deepEqual(filterOpenRows(rows, "2026").map((row) => row.noTag), ["open-a", "open-b"]);
});

test("mapping kolom RT, OT, dan WR sesuai template Excel", () => {
    assert.deepEqual(mapTemplateRow("redTag", OPEN_RT), [
        "2238", "RT/LINEG1/03/2026/02475", "2026", "MC.LANGEN", "SURYANI", "Cover buram", "G1", "DAN", "", ""
    ]);

    const orangeTag = {
        no: "1283",
        noTag: "OT/LINEB/04/2026/06399",
        deskripsi: "handrail",
        equipment: "HANDRAIL",
        ditemukanOleh: "IQBAL",
        diselesaikanOleh: "",
        tglClose: "",
        department: "Produksi",
        line: "B",
        tahun: "2026",
        status: "Open"
    };
    assert.deepEqual(mapTemplateRow("orangeTag", orangeTag), [
        "1283", "OT/LINEB/04/2026/06399", "handrail", "HANDRAIL", "IQBAL", "", "", "Produksi", "B", "2026"
    ]);

    const workRequest = {
        tahun: "2026",
        noTag: "183873",
        deskripsi: "pembuatan valve",
        department: "Produksi",
        pic: "Edi",
        tglClose: "",
        keterangan: "on progres",
        status: "Open"
    };
    assert.deepEqual(mapTemplateRow("workRequest", workRequest), [
        "2026", "183873", "pembuatan valve", "Produksi", "Edi", "", "on progres"
    ]);
});

test("pesan tunggu dan selesai menyebut tahun, nama file, dan link folder", () => {
    assert.equal(buildWaitingMessage(), "siap tuan saya akan buatkan, tolong tunggu ya");

    const done = buildDoneMessage({
        year: "2026",
        filename: "RT 30OKT26.pdf",
        folderLabel: "Tag",
        folderUrl: "https://sharepoint.example/tag"
    });
    assert.match(done, /tahun 2026/);
    assert.match(done, /RT 30OKT26\.pdf/);
    assert.match(done, /link template Tag/);
    assert.match(done, /https:\/\/sharepoint\.example\/tag/);
});

test("isi template RT tanpa menimpa file asli, header dan data ikut terisi", async () => {
    const buffer = await fillTemplate("redTag", [OPEN_RT], { year: "2026", receivedAt: RECEIVED_AT });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet("RT");

    assert.equal(String(sheet.getCell("B2").value), OPEN_RT.noTag);
    assert.match(sheet.headerFooter.oddHeader ?? "", /RED TAG 2026/);
    assert.match(sheet.headerFooter.oddHeader ?? "", /30 Okt 2026/);
    assert.equal(sheet.pageSetup.paperSize, 9);
    assert.equal(workbook.getWorksheet("OT").state, "hidden");
});