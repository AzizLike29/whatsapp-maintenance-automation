const REQUIRED_ENV_KEYS = [
    "RED_TAG_SPREADSHEET_ID",
    "RED_TAG_SHEET_NAME",
    "TECHNICIAN_SHEET_NAME",
    "GOOGLE_APPLICATION_CREDENTIALS" // dibaca otomatis oleh library Google
];

// Baca dan cek isi .env
export function loadConfig(env = process.env) {
    const missingKeys = REQUIRED_ENV_KEYS.filter((key) => !env[key]?.trim());

    if (missingKeys.length > 0) {
        throw new Error(`Isi .env belum lengkap: ${missingKeys.join(", ")}, lihat contohnya di .env.example`);
    }

    const whatsAppPhoneNumber = env.WHATSAPP_PHONE_NUMBER?.trim() || null;

    if (whatsAppPhoneNumber && !/^\d+$/.test(whatsAppPhoneNumber)) {
        throw new Error("WHATSAPP_PHONE_NUMBER hanya boleh angka dengan kode negara, contoh 6281234567890");
    }

    return {
        allowedGroupIds: (env.ALLOWED_GROUP_IDS ?? "").split(",").map((groupId) => groupId.trim()).filter(Boolean),
        spreadsheetId: env.RED_TAG_SPREADSHEET_ID.trim(),
        sheetName: env.RED_TAG_SHEET_NAME.trim(),
        technicianSheetName: env.TECHNICIAN_SHEET_NAME.trim(),
        geminiApiKey: env.GEMINI_API_KEY?.trim() || null,
        geminiModel: env.GEMINI_MODEL?.trim() || "gemini-flash-lite-latest",
        whatsAppPhoneNumber
    };
}