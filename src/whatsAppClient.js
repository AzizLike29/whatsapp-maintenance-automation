import makeWASocket, { DisconnectReason, jidNormalizedUser, useMultiFileAuthState } from "baileys";
import qrcode from "qrcode-terminal";
import { logger } from "./logger.js";

// Berisi rahasia sesi WhatsApp
const AUTH_STATE_DIR = "auth_info";

// Matikan log bawaan Baileys
const silentBaileysLogger = {
    level: "silent",
    child: () => silentBaileysLogger,
    trace: () => { },
    debug: () => { },
    info: () => { },
    warn: () => { },
    error: () => { }
};

// Jalankan bot WhatsApp
export async function startWhatsAppClient({ phoneNumber, onMessage }) {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_STATE_DIR);
    let socket;

    // Balas sambil quote pesan
    async function sendReply(message, text) {
        await socket.sendMessage(message.groupId, { text }, { quoted: message.rawMessage });
    }

    // Minta kode pairing
    async function requestPairingCode() {
        try {
            const pairingCode = await socket.requestPairingCode(phoneNumber);
            logger.info(
                `Pairing code: ${pairingCode}. Enter it in WhatsApp > Linked devices > Link a device > Link with phone number instead.`
            );
        } catch (error) {
            logger.error(`Failed to request WhatsApp pairing code for phoneNumber=${phoneNumber}: ${error.message}`);
        }
    }

    // Tampilkan QR di terminal
    function showQrCode(qr) {
        logger.info("Scan this QR code with WhatsApp > Linked devices > Link a device:");
        qrcode.generate(qr, { small: true });
    }

    // Buat koneksi, diulang saat terputus
    function connect() {
        socket = makeWASocket({ auth: state, logger: silentBaileysLogger });
        // Kode pairing cukup diminta sekali
        let isPairingCodeRequested = false;

        socket.ev.on("creds.update", saveCreds);

        socket.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
            if (qr && !phoneNumber) {
                showQrCode(qr);
            }

            if (qr && phoneNumber && !isPairingCodeRequested) {
                isPairingCodeRequested = true;
                requestPairingCode();
            }

            if (connection === "open") {
                logger.info("WhatsApp connection opened");
                return;
            }

            if (connection !== "close") {
                return;
            }

            const statusCode = lastDisconnect?.error?.output?.statusCode;

            if (statusCode === DisconnectReason.loggedOut) {
                logger.error(`WhatsApp session logged out. Delete the "${AUTH_STATE_DIR}" folder and restart to link again.`);
                return;
            }

            // Termasuk restart setelah scan QR pertama
            logger.warn(`WhatsApp connection closed (statusCode=${statusCode}), reconnecting`);
            connect();
        });

        socket.ev.on("messages.upsert", async ({ messages, type }) => {
            // Hanya proses pesan baru
            if (type !== "notify") {
                return;
            }

            // ID bot: nomor HP dan LID
            const botJids = [socket.user?.id, socket.user?.lid].filter(Boolean).map(jidNormalizedUser);
            for (const rawMessage of messages) {
                await onMessage(rawMessage, { sendReply, botJids });
            }
        });
    }

    connect();
}