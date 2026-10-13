import assert from "node:assert/strict";
import { test } from "node:test";
import { extractField, splitByField } from "../src/extractField.js";

// Label terbaca walau beda format
test("extractField ignores case, spacing, bold markers, and CRLF line endings", () => {
    const messageText = "*no tag* :  RT/LINEB/07/2026/24308\r\nPENANGGULANGAN: Ganti belt\r\n";

    assert.equal(extractField(messageText, "No Tag"), "RT/LINEB/07/2026/24308");
    assert.equal(extractField(messageText, "Penanggulangan"), "Ganti belt");
});

// Kosong atau "-" dianggap null
test("extractField treats missing, empty, and dash values as null", () => {
    const messageText = "PIC: -\nPenanggulangan:";

    assert.equal(extractField(messageText, "PIC"), null);
    assert.equal(extractField(messageText, "Penanggulangan"), null);
    assert.equal(extractField(messageText, "No Tag"), null);
});

// Nomor urut di depan label diabaikan
test("extractField ignores a leading list number", () => {
    assert.equal(extractField("1. No Tag: 24308", "No Tag"), "24308");
    assert.equal(extractField("2) No Tag: 24311", "No Tag"), "24311");
});

// Pesan dipecah per blok No Tag, baris sebelum No Tag pertama dibuang
test("splitByField splits a message into one block per label", () => {
    const messageText = "@bot\n1. No Tag: 1\nPIC: Alim\n2. No Tag: 2\nPIC: Joko";

    assert.deepEqual(splitByField(messageText, "No Tag"), ["1. No Tag: 1\nPIC: Alim", "2. No Tag: 2\nPIC: Joko"]);
    assert.deepEqual(splitByField("@bot siap", "No Tag"), []);
});
