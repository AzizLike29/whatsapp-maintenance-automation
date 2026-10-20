import { ASIA_JAKARTA, PROCESSING_STATUS, SHEET_TYPES } from "./constants.js";

// Keterangan hasil per tag
export const RED_TAG_RESULT = {
    REOPENED: "Dibuka kembali, status jadi Open",
    NOT_FOUND: "Nomor tidak ditemukan, coba cek lagi",
    ALREADY_CLOSED: "Sudah Close sebelumnya",
    ALREADY_OPEN: "Masih Open, jadi tidak perlu dibuka lagi",
    DUPLICATE: "Ada beberapa data dengan nomor ini, tulis nomor lengkap ya",
    FAILED: "Gagal menyimpan ke spreadsheet, coba kirim ulang",
    INVALID_CLOSE_DATE: "Format Tgl Close salah ya, silahkan pakai format ini DD/MM/YYYY"
};

export function buildClosedResult(solution, solvedBy) {
    return `Close · ${solution} · ${solvedBy}`;
}

export function buildMissingFieldsResult(labels) {
    return `Belum lengkap, tolong tambahkan ${labels.join(" dan ")}`;
}

// Tanggal Waktu Indonesia
function formatDate(receivedAt) {
    return new Date(receivedAt).toLocaleDateString("id-ID", {
        timeZone: ASIA_JAKARTA,
        weekday: "long",
        day: "numeric",
        month: "short",
        year: "numeric"
    });
}

// Template balasan dari BOT whatsApp
function buildUpdateTitle(results) {
    const names = [...new Set(results.map(({ type }) => SHEET_TYPES[type]?.name).filter(Boolean))];
    if (names.length === 1) {
        return `*UPDATE ${names[0].toUpperCase()}*`;
    }
    return "*UPDATE MAINTENANCE*";
}

// Ringkasan semua tag dalam satu pesan
export function buildRedTagSummaryMessage(results, receivedAt) {
    const entries = results.map(({ status, tag, detail }) =>
        `${status === PROCESSING_STATUS.PROCESSED ? "✓" : "✗"} ${tag}\n  ${detail}`
    );
    return [
        buildUpdateTitle(results),
        `_${formatDate(receivedAt)}_`,
        "```" + entries.join("\n\n") + "```"
    ].join("\n");
}

export function buildNotTechnicianMessage() {
    return "Nomor Anda belum terdaftar sebagai teknisi. Silakan hubungi admin Aziz untuk mendapatkan bantuan ya😉";
}

export function buildAiUnavailableMessage() {
    return "Maaf, layanan AI sedang mengalami kendala. Silakan coba kembali beberapa saat lagi ya😉";
}