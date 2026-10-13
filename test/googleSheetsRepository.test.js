import assert from "node:assert/strict";
import { test } from "node:test";
import { isSameTag } from "../src/googleSheetsRepository.js";

// No Tag lengkap harus sama persis, beda huruf besar kecil dan spasi diabaikan
test("isSameTag matches a full tag exactly, ignoring case and spaces", () => {
    assert.equal(isSameTag("RT/LINEB/07/2026/24308", " rt/lineb/07/2026/24308 "), true);
    assert.equal(isSameTag("RT/LINEB/07/2026/24308", "RT/LINEB/07/2026/24309"), false);
});

// Angka saja dicocokkan ke nomor belakang tag, nol di depan boleh tidak diketik
test("isSameTag matches a bare number against the trailing number, ignoring leading zeros", () => {
    assert.equal(isSameTag("RT/LINED1POUCH/04/2026/08530", "8530"), true);
    assert.equal(isSameTag("RT/LINEB/07/2026/24308", "4308"), false);
    assert.equal(isSameTag("No Tag", "24308"), false);
});
