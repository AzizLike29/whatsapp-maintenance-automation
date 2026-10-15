// Zona waktu pabrik
export const ASIA_JAKARTA = "Asia/Jakarta";

// Status hasil proses pesan
export const PROCESSING_STATUS = {
    IGNORED: "IGNORED",
    INVALID: "INVALID",
    PROCESSED: "PROCESSED",
    ERROR: "ERROR"
};

// Nama dan label tiap sheet
export const SHEET_TYPES = {
    redTag: { name: "Red Tag", labels: { TAG_NUMBER: "No Tag", SOLUTION: "Penanggulangan", SOLVED_BY: "PIC" } },
    orangeTag: { name: "Orange Tag", labels: { TAG_NUMBER: "No OT", SOLUTION: "Penanggulangan", SOLVED_BY: "PIC" } },
    workRequest: { name: "WR", labels: { TAG_NUMBER: "No WR", SOLUTION: "Penanggulangan", SOLVED_BY: "Executor" } }
};

// Label reopen, bukan field wajib
export const STATUS_LABEL = "Status";