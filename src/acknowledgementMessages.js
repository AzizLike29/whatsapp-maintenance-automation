import { ASIA_JAKARTA, PROCESSING_STATUS } from "./constants.js";

// Keterangan hasil per tag
export const RED_TAG_RESULT = {
    REOPENED: "Open kembali",
    NOT_FOUND: "Tidak ditemukan, cek lagi penulisannya",
    ALREADY_CLOSED: "Sudah Close",
    ALREADY_OPEN: "Masih Open",
    DUPLICATE: "Cocok lebih dari satu tag, ketik No Tag lengkap",
    FAILED: "Gagal disimpan, coba lagi"
};

export function buildClosedResult(solution, solvedBy) {
    return `Close · ${solution} · ${solvedBy}`;
}

export function buildMissingFieldsResult(labels) {
    return `Belum lengkap: ${labels.join(", ")}`;
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
    return "Nomor Anda belum terdaftar sebagai teknisi, hubungi admin.";
}
