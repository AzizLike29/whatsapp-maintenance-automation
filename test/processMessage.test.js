import assert from "node:assert/strict";
import { test } from "node:test";
import { processMessage } from "../src/processMessage.js";

// Data contoh
const ALLOWED_GROUP_ID = "120363000000000000@g.us";
const BOT_JID = "6281111111111@s.whatsapp.net";
const TECHNICIAN_PHONE = "6285855303520";
const CLOSE_TEXT = "@bot\nNo Tag: 24308\nPenanggulangan: Ganti belt\nPIC: Alim";
const REOPEN_TEXT = "@bot\nNo Tag: 24308\nStatus: Open";
const OPEN_TAG = { rowNumber: 5789, tagNumber: "RT/LINEB/07/2026/24308", closedAt: "" };
const CLOSED_TAG = { ...OPEN_TAG, closedAt: "12/10/2026" };

// Balasan ringkasan yang diharapkan
const summary = (...entries) => `*UPDATE RED TAG*\n_Senin, 12 Okt 2026 · 16:00 WIB_\n\`\`\`${entries.join("\n\n")}\`\`\``;

// Pesan palsu, default close valid
function createMessage(overrides = {}) {
    return {
        messageId: "MSG001",
        groupId: ALLOWED_GROUP_ID,
        senderName: "Abu",
        senderPhone: TECHNICIAN_PHONE,
        messageText: CLOSE_TEXT,
        mentionedJids: [BOT_JID],
        receivedAt: "2026-10-12T16:00:00+07:00",
        ...overrides
    };
}

// Repository dan sendReply palsu, tag disalin supaya data contoh tidak ikut berubah
function createDependencies({ redTags = [], failOnWrite = false } = {}) {
    const closedTags = [];
    const reopenedRows = [];
    const replies = [];

    // Catat data atau tiru Sheets gagal
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
            listRedTags: async () => redTags.map((redTag) => ({ ...redTag })),
            closeRedTag: async (update) => write(closedTags, update),
            reopenRedTag: async (rowNumber) => write(reopenedRows, rowNumber),
            isTechnician: async (phone) => phone === TECHNICIAN_PHONE
        },
        sendReply: async (message, text) => replies.push(text)
    };
}

// Close tag Open
test("closes an open tag and replies with the full tag number", async () => {
    const dependencies = createDependencies({ redTags: [OPEN_TAG] });
    const status = await processMessage(createMessage(), dependencies);

    assert.equal(status, "PROCESSED");
    assert.deepEqual(dependencies.closedTags, [
        { rowNumber: 5789, solvedBy: "Alim", solution: "Ganti belt", closedDate: "2026-10-12" }
    ]);
    assert.deepEqual(dependencies.replies, [summary("✓ RT/LINEB/07/2026/24308\n  Close · Ganti belt · Alim")]);
});

// Reopen tag Close
test("reopens a closed tag when Status is Open", async () => {
    const dependencies = createDependencies({ redTags: [CLOSED_TAG] });
    const status = await processMessage(createMessage({ messageText: REOPEN_TEXT }), dependencies);

    assert.equal(status, "PROCESSED");
    assert.deepEqual(dependencies.reopenedRows, [5789]);
    assert.deepEqual(dependencies.replies, [summary("✓ RT/LINEB/07/2026/24308\n  Open kembali")]);
});

// Banyak tag dalam satu pesan, satu balasan ringkasan
test("processes several numbered tags in one message", async () => {
    const otherOpenTag = { rowNumber: 5790, tagNumber: "RT/LINEB/07/2026/24311", closedAt: "" };
    const otherClosedTag = { rowNumber: 5791, tagNumber: "RT/LINEB/07/2026/24315", closedAt: "12/10/2026" };
    const dependencies = createDependencies({ redTags: [OPEN_TAG, otherOpenTag, otherClosedTag] });
    const messageText = [
        "@bot",
        "1. No Tag: 24308",
        "Penanggulangan: Ganti belt",
        "PIC: Alim",
        "",
        "2. No Tag: 24311",
        "Penanggulangan: Ganti bearing",
        "PIC: Joko",
        "",
        "3. No Tag: 24315",
        "Penanggulangan: Setting sensor",
        "PIC: Alim"
    ].join("\n");

    const status = await processMessage(createMessage({ messageText }), dependencies);

    assert.equal(status, "PROCESSED");
    assert.deepEqual(dependencies.closedTags.map((update) => update.rowNumber), [5789, 5790]);
    assert.deepEqual(dependencies.replies, [
        summary(
            "✓ RT/LINEB/07/2026/24308\n  Close · Ganti belt · Alim",
            "✓ RT/LINEB/07/2026/24311\n  Close · Ganti bearing · Joko",
            "✗ 24315\n  Sudah Close"
        )
    ]);
});

// Tag sama dua kali hanya di-close sekali
test("does not close the same tag twice in one message", async () => {
    const dependencies = createDependencies({ redTags: [OPEN_TAG] });
    const messageText = `${CLOSE_TEXT}\n${CLOSE_TEXT.replace("@bot\n", "")}`;

    await processMessage(createMessage({ messageText }), dependencies);

    assert.equal(dependencies.closedTags.length, 1);
    assert.deepEqual(dependencies.replies, [
        summary("✓ RT/LINEB/07/2026/24308\n  Close · Ganti belt · Alim", "✗ 24308\n  Sudah Close")
    ]);
});

// Tag Close tidak ditulis ulang
test("does not close a tag that is already closed", async () => {
    const dependencies = createDependencies({ redTags: [CLOSED_TAG] });
    const status = await processMessage(createMessage(), dependencies);

    assert.equal(status, "INVALID");
    assert.equal(dependencies.closedTags.length, 0);
    assert.deepEqual(dependencies.replies, [summary("✗ 24308\n  Sudah Close")]);
});

// Nomor ganda minta No Tag lengkap
test("asks for the full tag number when several open tags share the number", async () => {
    const otherOpenTag = { rowNumber: 100, tagNumber: "RT/LINEA/01/2025/24308", closedAt: "" };
    const dependencies = createDependencies({ redTags: [OPEN_TAG, otherOpenTag] });

    const status = await processMessage(createMessage(), dependencies);

    assert.equal(status, "INVALID");
    assert.equal(dependencies.closedTags.length, 0);
    assert.deepEqual(dependencies.replies, [summary("✗ 24308\n  Cocok lebih dari satu tag, ketik No Tag lengkap")]);
});

// Tag tidak ditemukan
test("replies when the tag does not exist", async () => {
    const dependencies = createDependencies();
    const status = await processMessage(createMessage(), dependencies);

    assert.equal(status, "INVALID");
    assert.deepEqual(dependencies.replies, [summary("✗ 24308\n  Tidak ditemukan, cek lagi penulisannya")]);
});

// Balas field yang kosong
test("replies with the missing fields when closing", async () => {
    const dependencies = createDependencies({ redTags: [OPEN_TAG] });
    const status = await processMessage(createMessage({ messageText: "@bot\nNo Tag: 24308\nOleh: Alim" }), dependencies);

    assert.equal(status, "INVALID");
    assert.equal(dependencies.closedTags.length, 0);
    assert.deepEqual(dependencies.replies, [summary("✗ 24308\n  Belum lengkap: Penanggulangan, PIC")]);
});

// Tanpa mention bot diabaikan
test("ignores Red Tag messages that do not mention the bot", async () => {
    const dependencies = createDependencies({ redTags: [OPEN_TAG] });
    const status = await processMessage(createMessage({ mentionedJids: [] }), dependencies);

    assert.equal(status, "IGNORED");
    assert.equal(dependencies.replies.length, 0);
});

// Chat biasa diabaikan
test("ignores regular chat messages without replying", async () => {
    const dependencies = createDependencies();
    const status = await processMessage(createMessage({ messageText: "@bot siap, terima kasih" }), dependencies);

    assert.equal(status, "IGNORED");
    assert.equal(dependencies.replies.length, 0);
});

// Grup lain diabaikan
test("ignores messages from groups that are not allowed", async () => {
    const dependencies = createDependencies({ redTags: [OPEN_TAG] });
    const status = await processMessage(createMessage({ groupId: "other@g.us" }), dependencies);

    assert.equal(status, "IGNORED");
    assert.equal(dependencies.closedTags.length, 0);
});

// Sheets gagal, balasan menyebut gagal disimpan
test("returns ERROR and reports the failure when writing to Sheets fails", async () => {
    const dependencies = createDependencies({ redTags: [OPEN_TAG], failOnWrite: true });
    const status = await processMessage(createMessage(), dependencies);

    assert.equal(status, "ERROR");
    assert.equal(dependencies.closedTags.length, 0);
    assert.deepEqual(dependencies.replies, [summary("✗ RT/LINEB/07/2026/24308\n  Gagal disimpan, coba lagi")]);
});

// Bukan teknisi ditolak
test("rejects senders who are not registered technicians", async () => {
    const dependencies = createDependencies({ redTags: [OPEN_TAG] });
    const status = await processMessage(createMessage({ senderPhone: "6289999999999" }), dependencies);

    assert.equal(status, "INVALID");
    assert.equal(dependencies.closedTags.length, 0);
    assert.deepEqual(dependencies.replies, ["Nomor Anda belum terdaftar sebagai teknisi, hubungi admin."]);
});
