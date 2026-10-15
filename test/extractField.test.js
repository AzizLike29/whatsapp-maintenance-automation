import assert from "node:assert/strict";
import { test } from "node:test";
import { extractField, splitByField } from "../src/extractField.js";

test("label tetap terbaca walau beda huruf besar kecil, spasi, tanda bold, dan enter Windows", () => {
    const messageText = "*no tag* :  RT/LINEB/07/2026/24308\r\nPENANGGULANGAN: Ganti belt\r\n";

    assert.equal(extractField(messageText, "No Tag"), "RT/LINEB/07/2026/24308");
    assert.equal(extractField(messageText, "Penanggulangan"), "Ganti belt");
});

test("label tidak ada, isi kosong, atau isi strip dianggap belum diisi", () => {
    const messageText = "PIC: -\nPenanggulangan:";

    assert.equal(extractField(messageText, "PIC"), null);
    assert.equal(extractField(messageText, "Penanggulangan"), null);
    assert.equal(extractField(messageText, "No Tag"), null);
});

test("nomor urut di depan label diabaikan", () => {
    assert.equal(extractField("1. No Tag: 24308", "No Tag"), "24308");
    assert.equal(extractField("2) No Tag: 24311", "No Tag"), "24311");
});

test("pesan dipecah per blok No Tag dan baris sebelumnya dibuang", () => {
    const messageText = "@bot\n1. No Tag: 1\nPIC: Alim\n2. No Tag: 2\nPIC: Joko";

    assert.deepEqual(splitByField(messageText, ["No Tag"]), [
        { label: "No Tag", text: "1. No Tag: 1\nPIC: Alim" },
        { label: "No Tag", text: "2. No Tag: 2\nPIC: Joko" }
    ]);
    assert.deepEqual(splitByField("@bot siap", ["No Tag"]), []);
});