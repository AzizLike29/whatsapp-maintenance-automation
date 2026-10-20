import { isJidGroup, jidNormalizedUser } from "baileys";
import { ASIA_JAKARTA } from "./constants.js";

// Waktu ISO zona Jakarta
function toJakartaIsoString(date) {
    const localDateTime = date.toLocaleString("sv-SE", { timeZone: ASIA_JAKARTA });
    return `${localDateTime.replace(" ", "T")}+07:00`;
}

// Ambil teks pesan
function extractMessageText(content) {
    return content?.conversation ?? content?.extendedTextMessage?.text ?? content?.editedMessage?.message?.conversation ?? content?.editedMessage?.message?.extendedTextMessage?.text ?? null;
}

// Nomor HP pengirim, grup LID pakai participantAlt
function extractSenderPhone(key) {
    const phoneJid = [key.participant, key.participantAlt].find((jid) => jid?.endsWith("@s.whatsapp.net"));
    return phoneJid ? jidNormalizedUser(phoneJid).split("@")[0] : null;
}

// Ubah pesan Baileys, null kalau bukan teks grup
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
        senderPhone: extractSenderPhone(key),
        messageText,
        mentionedJids: (rawMessage.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? rawMessage.message?.editedMessage?.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? []).map(jidNormalizedUser),
        receivedAt: toJakartaIsoString(new Date(Number(rawMessage.messageTimestamp) * 1000)),
        rawMessage
    };
}
