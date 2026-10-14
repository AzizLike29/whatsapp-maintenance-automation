import assert from "node:assert/strict";
import { test } from "node:test";
import { searchRedTags } from "../src/redTagSearch.js";

// Data contoh
const TAGS = [
    { noTag: "RT/A/21/01/0001", status: "Close", line: "A", kategori: "Safety", equipment: "Meja Packer", bulan: "1", tglClose: "30 Jan 2021" },
    { noTag: "RT/D/21/01/001", status: "Close", line: "D1", kategori: "Elektrik", equipment: "Case packer D1", bulan: "1", tglClose: "21 Jan 2021" },
    { noTag: "RT/LINEB/07/2026/24308", status: "Open", line: "B", kategori: "Elektrik", equipment: "Conveyor", bulan: "10", tglClose: "" }
];

test("saring tag lalu rekap jumlah per kolom", () => {
    const result = searchRedTags(TAGS, { kategori: "elektrik", kelompokkan: "status" });

    assert.equal(result.jumlah, 2);
    assert.deepEqual(result.rekap, [{ nilai: "Close", jumlah: 1 }, { nilai: "Open", jumlah: 1 }]);
});

test("angka harus sama persis, equipment cukup cocok sebagian, No Tag pakai nomor belakang", () => {
    assert.equal(searchRedTags(TAGS, { bulan: "1" }).jumlah, 2);
    assert.equal(searchRedTags(TAGS, { equipment: "packer" }).jumlah, 2);
    assert.equal(searchRedTags(TAGS, { noTag: "24308" }).jumlah, 1);
    assert.equal(searchRedTags(TAGS, { tahunClose: "2021" }).jumlah, 2);
});
