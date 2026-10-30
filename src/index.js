import { createAiAssistant } from "./aiAssistant.js";
import { loadConfig } from "./config.js";
import { createExportReport } from "./exportReport.js";
import { createRedTagRepository } from "./googleSheetsRepository.js";
import { logger } from "./logger.js";
import { normalizeMessage } from "./normalizeMessage.js";
import { processMessage } from "./processMessage.js";
import { startWhatsAppClient } from "./whatsAppClient.js";

// Titik awal aplikasi
async function main() {
    const config = loadConfig();
    const redTagRepository = createRedTagRepository(config);
    const aiAssistant = config.geminiApiKey ? createAiAssistant({ apiKey: config.geminiApiKey, model: config.geminiModel, redTagRepository }) : null;
    const exportReport = createExportReport({
        redTagRepository,
        clientId: config.microsoftClientId,
        site: config.sharePointSite,
        folderUrls: config.sharePointLinks
    });

    if (config.allowedGroupIds.length === 0) {
        logger.warn("ALLOWED_GROUP_IDS masih kosong, semua pesan akan diabaikan, salin groupId dari log ke .env");
    }

    await startWhatsAppClient({
        phoneNumber: config.whatsAppPhoneNumber,
        onMessage: async (rawMessage, { sendReply, sendTyping, sendDocument, botJids }) => {
            const message = normalizeMessage(rawMessage);

            if (!message) {
                return;
            }

            await processMessage(message, {
                allowedGroupIds: config.allowedGroupIds,
                redTagRepository,
                aiAssistant,
                botJids,
                sendReply,
                sendTyping,
                sendDocument,
                exportReport
            });
        }
    });
}

main().catch((error) => {
    logger.error(`Aplikasi gagal dijalankan: ${error.message}`);
    process.exit(1);
});