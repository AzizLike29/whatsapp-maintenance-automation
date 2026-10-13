import { isJidGroup, jidNormalizedUser } from "baileys";
import { ASIA_JAKARTA } from "./constants.js";

// Ubah waktu ke format ISO zona Jakarta, contoh 2026-10-12T16:00:00+07:00
// Format "sv-SE" menghasilkan "YYYY-MM-DD HH:mm:ss", dan Jakarta tidak punya DST jadi offset selalu +07:00
function toJakartaIsoString(date) {
    const localDateTime = date.toLocaleString("sv-SE", { timeZone: ASIA_JAKARTA });
    return `${localDateTime.replace(" ", "T")}+07:00`;
}

// Ambil teks pesan, baik pesan biasa maupun pesan yang membalas atau mention
function extractMessageText(content) {
    return content?.conversation ?? content?.extendedTextMessage?.text ?? null;
}

// Ubah pesan mentah Baileys jadi format aplikasi, hasilnya null kalau bukan pesan teks di grup
export function normalizeMessage(rawMessage) {
    const { key } = rawMessage;

    if (key.fromMe || !isJidGroup(key.remoteJid)) {
        return null;
    }

    const messageText = extractMessageText(rawMessage.message);

    if (!messageText) {
        return null;
    }

    return {
        messageId: key.id,
        groupId: key.remoteJid,
        senderName: rawMessage.pushName ?? key.participant ?? "",
        messageText,
        mentionedJids: (rawMessage.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? []).map(jidNormalizedUser),
        receivedAt: toJakartaIsoString(new Date(Number(rawMessage.messageTimestamp) * 1000)),
        rawMessage
    };
}
