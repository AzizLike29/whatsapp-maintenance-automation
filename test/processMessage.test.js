import assert from "node:assert/strict";
import { test } from "node:test";
import { processMessage } from "../src/processMessage.js";

// Data contoh yang dipakai di semua test
const ALLOWED_GROUP_ID = "120363000000000000@g.us";
const BOT_JID = "6281111111111@s.whatsapp.net";
const CLOSE_TEXT = "@bot\nNo Tag: 24308\nPenanggulangan: Ganti belt\nPIC: Alim";
const REOPEN_TEXT = "@bot\nNo Tag: 24308\nStatus: Open";
const OPEN_TAG = { rowNumber: 5789, tagNumber: "RT/LINEB/07/2026/24308", closedAt: "" };
const CLOSED_TAG = { ...OPEN_TAG, closedAt: "12/10/2026" };

// Buat pesan grup palsu, isi default-nya permintaan close yang valid dan mention bot
function createMessage(overrides = {}) {
    return {
        messageId: "MSG001",
        groupId: ALLOWED_GROUP_ID,
        senderName: "Abu",
        messageText: CLOSE_TEXT,
        mentionedJids: [BOT_JID],
        receivedAt: "2026-10-12T16:00:00+07:00",
        ...overrides
    };
}

// Buat repository dan sendReply palsu supaya test tidak menyentuh WhatsApp dan Google Sheets
// findRedTags selalu mengembalikan redTags, pencocokan No Tag-nya dites terpisah di googleSheetsRepository.test.js
function createDependencies({ redTags = [], failOnWrite = false } = {}) {
    const closedTags = [];
    const reopenedRows = [];
    const replies = [];

    // Catat data yang ditulis, atau lempar error untuk meniru Google Sheets yang gagal
    const write = (target, value) => {
        if (failOnWrite) {
            throw new Error("Sheets unavailable");
        }
        target.push(value);
    };

    return {
        closedTags,
        reopenedRows,
        replies,
        allowedGroupIds: [ALLOWED_GROUP_ID],
        botJids: [BOT_JID],
        redTagRepository: {
            findRedTags: async () => redTags,
            closeRedTag: async (update) => write(closedTags, update),
            reopenRedTag: async (rowNumber) => write(reopenedRows, rowNumber)
        },
        sendReply: async (message, text) => replies.push(text)
    };
}

// Close tag yang masih Open: data tertulis dan balasan memakai No Tag lengkap
test("closes an open tag and replies with the full tag number", async () => {
    const dependencies = createDependencies({ redTags: [OPEN_TAG] });

    const status = await processMessage(createMessage(), dependencies);

    assert.equal(status, "PROCESSED");
    assert.deepEqual(dependencies.closedTags, [
        { rowNumber: 5789, solvedBy: "Alim", solution: "Ganti belt", closedDate: "2026-10-12" }
    ]);
    assert.deepEqual(dependencies.replies, ["✅ RT/LINEB/07/2026/24308 sudah Close (2026-10-12)."]);
});

// Reopen tag yang sudah Close lewat baris "Status: Open"
test("reopens a closed tag when Status is Open", async () => {
    const dependencies = createDependencies({ redTags: [CLOSED_TAG] });

    const status = await processMessage(createMessage({ messageText: REOPEN_TEXT }), dependencies);

    assert.equal(status, "PROCESSED");
    assert.deepEqual(dependencies.reopenedRows, [5789]);
    assert.deepEqual(dependencies.replies, ["🔄 RT/LINEB/07/2026/24308 dibuka kembali (Open)."]);
});

// Tag yang sudah Close tidak boleh ditulis ulang
test("does not close a tag that is already closed", async () => {
    const dependencies = createDependencies({ redTags: [CLOSED_TAG] });

    const status = await processMessage(createMessage(), dependencies);

    assert.equal(status, "INVALID");
    assert.equal(dependencies.closedTags.length, 0);
    assert.deepEqual(dependencies.replies, ["ℹ️ 24308 sudah Close."]);
});

// Nomor belakang yang cocok dengan beberapa tag Open tidak boleh menutup apa pun
test("asks for the full tag number when several open tags share the number", async () => {
    const otherOpenTag = { rowNumber: 100, tagNumber: "RT/LINEA/01/2025/24308", closedAt: "" };
    const dependencies = createDependencies({ redTags: [OPEN_TAG, otherOpenTag] });

    const status = await processMessage(createMessage(), dependencies);

    assert.equal(status, "INVALID");
    assert.equal(dependencies.closedTags.length, 0);
    assert.deepEqual(dependencies.replies, ["⚠️ No Tag 24308 cocok dengan lebih dari satu tag, mohon ketik No Tag lengkap."]);
});

// No Tag yang tidak ada di sheet dibalas tidak ditemukan
test("replies when the tag does not exist", async () => {
    const dependencies = createDependencies();

    const status = await processMessage(createMessage(), dependencies);

    assert.equal(status, "INVALID");
    assert.deepEqual(dependencies.replies, ["⚠️ No Tag 24308 tidak ditemukan, cek lagi penulisannya."]);
});

// Field wajib yang kosong disebutkan di balasan, contohnya teknisi masih memakai label lama "Oleh"
test("replies with the missing fields when closing", async () => {
    const dependencies = createDependencies({ redTags: [OPEN_TAG] });

    const status = await processMessage(createMessage({ messageText: "@bot\nNo Tag: 24308\nOleh: Alim" }), dependencies);

    assert.equal(status, "INVALID");
    assert.equal(dependencies.closedTags.length, 0);
    assert.deepEqual(dependencies.replies, ["⚠️ Laporan belum lengkap atau formatnya salah: Penanggulangan, PIC."]);
});

// Pesan Red Tag tanpa mention bot diabaikan
test("ignores Red Tag messages that do not mention the bot", async () => {
    const dependencies = createDependencies({ redTags: [OPEN_TAG] });

    const status = await processMessage(createMessage({ mentionedJids: [] }), dependencies);

    assert.equal(status, "IGNORED");
    assert.equal(dependencies.replies.length, 0);
});

// Chat biasa tanpa baris No Tag diabaikan walaupun mention bot
test("ignores regular chat messages without replying", async () => {
    const dependencies = createDependencies();

    const status = await processMessage(createMessage({ messageText: "@bot siap, terima kasih" }), dependencies);

    assert.equal(status, "IGNORED");
    assert.equal(dependencies.replies.length, 0);
});

// Pesan dari grup yang tidak ada di ALLOWED_GROUP_IDS diabaikan
test("ignores messages from groups that are not allowed", async () => {
    const dependencies = createDependencies({ redTags: [OPEN_TAG] });

    const status = await processMessage(createMessage({ groupId: "other@g.us" }), dependencies);

    assert.equal(status, "IGNORED");
    assert.equal(dependencies.closedTags.length, 0);
});

// Kalau Google Sheets gagal, bot tidak membalas sukses ke grup
test("returns ERROR without replying when writing to Sheets fails", async () => {
    const dependencies = createDependencies({ redTags: [OPEN_TAG], failOnWrite: true });

    const status = await processMessage(createMessage(), dependencies);

    assert.equal(status, "ERROR");
    assert.equal(dependencies.replies.length, 0);
});
