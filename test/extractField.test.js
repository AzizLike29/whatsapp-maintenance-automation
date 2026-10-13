import assert from "node:assert/strict";
import { test } from "node:test";
import { extractField } from "../src/extractField.js";

// Label tetap terbaca walaupun beda huruf besar kecil, ada spasi, tanda bold WhatsApp, atau enter gaya Windows
test("extractField ignores case, spacing, bold markers, and CRLF line endings", () => {
    const messageText = "*no tag* :  RT/LINEB/07/2026/24308\r\nPENANGGULANGAN: Ganti belt\r\n";

    assert.equal(extractField(messageText, "No Tag"), "RT/LINEB/07/2026/24308");
    assert.equal(extractField(messageText, "Penanggulangan"), "Ganti belt");
});

// Label yang tidak ada, isinya kosong, atau hanya "-" dianggap tidak diisi
test("extractField treats missing, empty, and dash values as null", () => {
    const messageText = "PIC: -\nPenanggulangan:";

    assert.equal(extractField(messageText, "PIC"), null);
    assert.equal(extractField(messageText, "Penanggulangan"), null);
    assert.equal(extractField(messageText, "No Tag"), null);
});
