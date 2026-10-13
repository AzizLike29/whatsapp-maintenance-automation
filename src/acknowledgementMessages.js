// Kumpulan teks balasan bot ke grup
export function buildRedTagClosedMessage(tagNumber, closedDate) {
    return `✅ ${tagNumber} sudah Close (${closedDate}).`;
}

export function buildRedTagReopenedMessage(tagNumber) {
    return `🔄 ${tagNumber} dibuka kembali (Open).`;
}

export function buildRedTagNotFoundMessage(tagNumber) {
    return `⚠️ No Tag ${tagNumber} tidak ditemukan, cek lagi penulisannya.`;
}

export function buildRedTagDuplicateMessage(tagNumber) {
    return `⚠️ No Tag ${tagNumber} cocok dengan lebih dari satu tag, mohon ketik No Tag lengkap.`;
}

export function buildRedTagAlreadyClosedMessage(tagNumber) {
    return `ℹ️ ${tagNumber} sudah Close.`;
}

export function buildRedTagAlreadyOpenMessage(tagNumber) {
    return `ℹ️ ${tagNumber} masih Open.`;
}

export function buildReportInvalidMessage(invalidLabels) {
    return `⚠️ Laporan belum lengkap atau formatnya salah: ${invalidLabels.join(", ")}.`;
}