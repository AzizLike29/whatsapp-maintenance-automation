import { ASIA_JAKARTA, PROCESSING_STATUS } from "./constants.js";

// Keterangan hasil per tag
export const RED_TAG_RESULT = {
    REOPENED: "Dibuka kembali, status jadi Open",
    NOT_FOUND: "Tag tidak ditemukan, coba cek lagi nomornya",
    ALREADY_CLOSED: "Tag ini sudah Close sebelumnya",
    ALREADY_OPEN: "Tag ini masih Open, jadi tidak perlu dibuka lagi",
    DUPLICATE: "Ada beberapa tag dengan nomor ini, tulis No Tag lengkap ya",
    FAILED: "Gagal menyimpan ke spreadsheet, coba kirim ulang"
};

export function buildClosedResult(solution, solvedBy) {
    return `Close · ${solution} · ${solvedBy}`;
}

export function buildMissingFieldsResult(labels) {
    return `Belum lengkap, tolong tambahkan ${labels.join(" dan ")}`;
}

// Tanggal Indonesia, contoh Selasa, 13 Okt 2026
function formatDate(receivedAt) {
    return new Date(receivedAt).toLocaleDateString("id-ID", {
        timeZone: ASIA_JAKARTA,
        weekday: "long",
        day: "numeric",
        month: "short",
        year: "numeric"
    });
}

// Ringkasan semua tag dalam satu pesan
export function buildRedTagSummaryMessage(results, receivedAt) {
    const entries = results.map(({ status, tag, detail }) =>
        `${status === PROCESSING_STATUS.PROCESSED ? "✓" : "✗"} ${tag}\n  ${detail}`
    );

    return [
        "*UPDATE RED TAG*",
        `_${formatDate(receivedAt)} · ${receivedAt.slice(11, 16)} WIB_`,
        "```" + entries.join("\n\n") + "```"
    ].join("\n");
}

export function buildNotTechnicianMessage() {
    return "Maaf, nomor Anda belum terdaftar sebagai teknisi, silakan hubungi admin Aziz ya";
}

export function buildAiUnavailableMessage() {
    return "Maaf, AI sedang tidak bisa menjawab, coba beberapa saat lagi ya";
}