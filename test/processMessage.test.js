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

// Balasan ringkasan template whatsapp, contoh:
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
function createDependencies({ redTags = [], tags = {}, failOnWrite = false } = {}) {
    const tagsByType = { redTag: redTags, ...tags };
    const closedTags = [];
    const reopenedRows = [];
    const replies = [];

    // Catat data atau tiru Sheets gagal
    const write = (target, value) => {
        if (failOnWrite) {
            throw new Error("Sheets tidak bisa diakses");
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
            listTags: async (type) => (tagsByType[type] ?? []).map((tag) => ({ ...tag })),
            closeTag: async (type, update) => write(closedTags, { type, ...update }),
            reopenTag: async (type, rowNumber) => write(reopenedRows, rowNumber),
            isTechnician: async (phone) => phone === TECHNICIAN_PHONE
        },
        sendReply: async (message, text) => replies.push(text)
    };
}

test("close tag yang masih Open dan balas dengan No Tag lengkap", async () => {
    const dependencies = createDependencies({ redTags: [OPEN_TAG] });
    const status = await processMessage(createMessage(), dependencies);

    assert.equal(status, "PROCESSED");
    assert.deepEqual(dependencies.closedTags, [
        { type: "redTag", rowNumber: 5789, solvedBy: "Alim", solution: "Ganti belt", closedDate: "2026-10-12" }
    ]);
    assert.deepEqual(dependencies.replies, [summary("✓ RT/LINEB/07/2026/24308\n  Close · Ganti belt · Alim")]);
});

test("buka kembali tag yang sudah Close lewat Status Open", async () => {
    const dependencies = createDependencies({ redTags: [CLOSED_TAG] });
    const status = await processMessage(createMessage({ messageText: REOPEN_TEXT }), dependencies);

    assert.equal(status, "PROCESSED");
    assert.deepEqual(dependencies.reopenedRows, [5789]);
    assert.deepEqual(dependencies.replies, [summary("✓ RT/LINEB/07/2026/24308\n  Dibuka kembali, status jadi Open")]);
});

test("proses banyak tag bernomor dalam satu pesan", async () => {
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
            "✗ 24315\n  Sudah Close sebelumnya"
        )
    ]);
});

test("tag yang sama dua kali dalam satu pesan hanya di-close sekali", async () => {
    const dependencies = createDependencies({ redTags: [OPEN_TAG] });
    const messageText = `${CLOSE_TEXT}\n${CLOSE_TEXT.replace("@bot\n", "")}`;

    await processMessage(createMessage({ messageText }), dependencies);

    assert.equal(dependencies.closedTags.length, 1);
    assert.deepEqual(dependencies.replies, [
        summary("✓ RT/LINEB/07/2026/24308\n  Close · Ganti belt · Alim", "✗ 24308\n  Sudah Close sebelumnya")
    ]);
});

test("tag yang sudah Close tidak ditulis ulang", async () => {
    const dependencies = createDependencies({ redTags: [CLOSED_TAG] });
    const status = await processMessage(createMessage(), dependencies);

    assert.equal(status, "INVALID");
    assert.equal(dependencies.closedTags.length, 0);
    assert.deepEqual(dependencies.replies, [summary("✗ 24308\n  Sudah Close sebelumnya")]);
});

test("close Orange Tag dan WR dalam satu pesan sesuai label", async () => {
    const orangeTag = { rowNumber: 2880, tagNumber: "OT/LINEC/04/2026/06755", closedAt: "" };
    const workRequest = { rowNumber: 4929, tagNumber: "194889", closedAt: "" };
    const dependencies = createDependencies({ tags: { orangeTag: [orangeTag], workRequest: [workRequest] } });
    const messageText = "@bot\nNo OT: 6755\nPenanggulangan: Pengelasan plat\nPIC: Wahyu\n\nNo WR: 194889\nPenanggulangan: Pasang sensor\nExecutor: Ripal";

    const status = await processMessage(createMessage({ messageText }), dependencies);

    assert.equal(status, "PROCESSED");
    assert.deepEqual(dependencies.closedTags, [
        { type: "orangeTag", rowNumber: 2880, solvedBy: "Wahyu", solution: "Pengelasan plat", closedDate: "2026-10-12" },
        { type: "workRequest", rowNumber: 4929, solvedBy: "Ripal", solution: "Pasang sensor", closedDate: "2026-10-12" }
    ]);
});

test("minta No Tag lengkap kalau nomor belakang cocok dengan beberapa tag Open", async () => {
    const otherOpenTag = { rowNumber: 100, tagNumber: "RT/LINEA/01/2025/24308", closedAt: "" };
    const dependencies = createDependencies({ redTags: [OPEN_TAG, otherOpenTag] });

    const status = await processMessage(createMessage(), dependencies);

    assert.equal(status, "INVALID");
    assert.equal(dependencies.closedTags.length, 0);
    assert.deepEqual(dependencies.replies, [summary("✗ 24308\n  Ada beberapa data dengan nomor ini, tulis nomor lengkap ya")]);
});

test("balas tag tidak ditemukan", async () => {
    const dependencies = createDependencies();
    const status = await processMessage(createMessage(), dependencies);

    assert.equal(status, "INVALID");
    assert.deepEqual(dependencies.replies, [summary("✗ 24308\n  Nomor tidak ditemukan, coba cek lagi")]);
});

test("sebutkan field yang belum diisi saat close", async () => {
    const dependencies = createDependencies({ redTags: [OPEN_TAG] });
    const status = await processMessage(createMessage({ messageText: "@bot\nNo Tag: 24308\nOleh: Alim" }), dependencies);

    assert.equal(status, "INVALID");
    assert.equal(dependencies.closedTags.length, 0);
    assert.deepEqual(dependencies.replies, [summary("✗ 24308\n  Belum lengkap, tolong tambahkan Penanggulangan dan PIC")]);
});

test("abaikan pesan Red Tag yang tidak mention bot", async () => {
    const dependencies = createDependencies({ redTags: [OPEN_TAG] });
    const status = await processMessage(createMessage({ mentionedJids: [] }), dependencies);

    assert.equal(status, "IGNORED");
    assert.equal(dependencies.replies.length, 0);
});

test("abaikan chat biasa kalau fitur AI tidak aktif", async () => {
    const dependencies = createDependencies();
    const status = await processMessage(createMessage({ messageText: "@bot siap, terima kasih" }), dependencies);

    assert.equal(status, "IGNORED");
    assert.equal(dependencies.replies.length, 0);
});

test("abaikan pesan dari grup yang belum diizinkan", async () => {
    const dependencies = createDependencies({ redTags: [OPEN_TAG] });
    const status = await processMessage(createMessage({ groupId: "other@g.us" }), dependencies);

    assert.equal(status, "IGNORED");
    assert.equal(dependencies.closedTags.length, 0);
});

test("laporkan gagal simpan kalau Google Sheets error", async () => {
    const dependencies = createDependencies({ redTags: [OPEN_TAG], failOnWrite: true });
    const status = await processMessage(createMessage(), dependencies);

    assert.equal(status, "ERROR");
    assert.equal(dependencies.closedTags.length, 0);
    assert.deepEqual(dependencies.replies, [summary("✗ RT/LINEB/07/2026/24308\n  Gagal menyimpan ke spreadsheet, coba kirim ulang")]);
});

test("tolak pengirim yang bukan teknisi terdaftar", async () => {
    const dependencies = createDependencies({ redTags: [OPEN_TAG] });
    const status = await processMessage(createMessage({ senderPhone: "6289999999999" }), dependencies);

    assert.equal(status, "INVALID");
    assert.equal(dependencies.closedTags.length, 0);
    assert.deepEqual(dependencies.replies, ["Nomor Anda belum terdaftar sebagai teknisi. Silakan hubungi admin Aziz untuk mendapatkan bantuan ya😉"]);
});

test("jawab pertanyaan tanpa No Tag dengan AI", async () => {
    const dependencies = { ...createDependencies(), aiAssistant: { ask: async (question) => `Jawaban: ${question}` } };
    const status = await processMessage(createMessage({ messageText: "@6281111111111 berapa tag open?" }), dependencies);

    assert.equal(status, "PROCESSED");
    assert.deepEqual(dependencies.replies, ["Jawaban: berapa tag open?"]);
});

test("balas AI tidak tersedia kalau AI gagal", async () => {
    const failingAssistant = { ask: async () => { throw new Error("Kuota habis"); } };
    const dependencies = { ...createDependencies(), aiAssistant: failingAssistant };
    const status = await processMessage(createMessage({ messageText: "@6281111111111 berapa tag open?" }), dependencies);

    assert.equal(status, "ERROR");
    assert.deepEqual(dependencies.replies, ["Maaf, layanan AI sedang mengalami kendala. Silakan coba kembali beberapa saat lagi ya😉"]);
});