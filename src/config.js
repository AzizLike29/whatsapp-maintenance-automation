const REQUIRED_ENV_KEYS = [
    "DASHBOARD_SPREADSHEET_ID",
    "RED_TAG_SHEET_NAME",
    "ORANGE_TAG_SHEET_NAME",
    "WORK_REQUEST_SHEET_NAME",
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
        spreadsheetId: env.DASHBOARD_SPREADSHEET_ID.trim(),
        sheetNames: {
            redTag: env.RED_TAG_SHEET_NAME.trim(),
            orangeTag: env.ORANGE_TAG_SHEET_NAME.trim(),
            workRequest: env.WORK_REQUEST_SHEET_NAME.trim()
        },
        technicianSheetName: env.TECHNICIAN_SHEET_NAME.trim(),
        geminiApiKey: env.GEMINI_API_KEY?.trim() || null,
        geminiModel: env.GEMINI_MODEL?.trim() || "gemini-flash-lite-latest",
        whatsAppPhoneNumber,
        // Pakai client Graph PowerShell, ganti MICROSOFT_CLIENT_ID kalau tenant menolak
        microsoftClientId: env.MICROSOFT_CLIENT_ID?.trim() || "14d82eec-204b-4c2f-b7e8-296a70dab67e",
        sharePointSite: env.SHAREPOINT_SITE?.trim() || "onekn-my.sharepoint.com:/personal/nila_agustina_kalbenutritionals_com",
        sharePointLinks: {
            wr: env.SHAREPOINT_WR_LINK?.trim() || "https://onekn-my.sharepoint.com/shared?id=%2Fpersonal%2Fnila%5Fagustina%5Fkalbenutritionals%5Fcom%2FDocuments%2FData%20Sanghiang%2FOps%20Adm%2FTemplate%2FWR",
            tag: env.SHAREPOINT_TAG_LINK?.trim() || "https://onekn-my.sharepoint.com/shared?id=%2Fpersonal%2Fnila%5Fagustina%5Fkalbenutritionals%5Fcom%2FDocuments%2FData%20Sanghiang%2FOps%20Adm%2FTemplate%2FTag"
        }
    };
}