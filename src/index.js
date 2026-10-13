import { loadConfig } from "./config.js";
import { createRedTagRepository } from "./googleSheetsRepository.js";
import { logger } from "./logger.js";
import { normalizeMessage } from "./normalizeMessage.js";
import { processMessage } from "./processMessage.js";
import { startWhatsAppClient } from "./whatsAppClient.js";

// Titik awal aplikasi
async function main() {
    const config = loadConfig();
    const redTagRepository = createRedTagRepository(config);

    if (config.allowedGroupIds.length === 0) {
        logger.warn("ALLOWED_GROUP_IDS is empty: all messages will be ignored. Copy the groupId from the logs into .env.");
    }

    await startWhatsAppClient({
        phoneNumber: config.whatsAppPhoneNumber,
        onMessage: async (rawMessage, { sendReply, botJids }) => {
            const message = normalizeMessage(rawMessage);

            if (!message) {
                return;
            }

            await processMessage(message, {
                allowedGroupIds: config.allowedGroupIds,
                redTagRepository,
                botJids,
                sendReply
            });
        }
    });
}

main().catch((error) => {
    logger.error(`Failed to start application: ${error.message}`);
    process.exit(1);
});
