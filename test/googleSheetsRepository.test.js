import assert from "node:assert/strict";
import { test } from "node:test";
import { isSameTag } from "../src/googleSheetsRepository.js";

test("No Tag lengkap harus sama, huruf besar kecil dan spasi diabaikan", () => {
    assert.equal(isSameTag("RT/LINEB/07/2026/24308", " rt/lineb/07/2026/24308 "), true);
    assert.equal(isSameTag("RT/LINEB/07/2026/24308", "RT/LINEB/07/2026/24309"), false);
});

test("nomor saja dicocokkan ke nomor belakang tag, nol di depan diabaikan", () => {
    assert.equal(isSameTag("RT/LINED1POUCH/04/2026/08530", "8530"), true);
    assert.equal(isSameTag("RT/LINEB/07/2026/24308", "4308"), false);
    assert.equal(isSameTag("No Tag", "24308"), false);
});
