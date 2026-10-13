// Zona waktu pabrik, dipakai untuk tanggal close
export const ASIA_JAKARTA = "Asia/Jakarta";

// Hasil akhir pemrosesan satu pesan, dipakai di log dan test
export const PROCESSING_STATUS = {
    IGNORED: "IGNORED",
    INVALID: "INVALID",
    PROCESSED: "PROCESSED",
    ERROR: "ERROR"
};

// Label yang diketik teknisi saat close Red Tag, semuanya wajib diisi
export const RED_TAG_LABEL = {
    TAG_NUMBER: "No Tag",
    SOLUTION: "Penanggulangan",
    SOLVED_BY: "PIC"
};

// Dipisah dari RED_TAG_LABEL supaya tidak ikut jadi field wajib saat close
export const RED_TAG_STATUS_LABEL = "Status";