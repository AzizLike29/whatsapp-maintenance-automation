import {
    buildClosedResult,
    buildMissingFieldsResult,
    buildNotTechnicianMessage,
    buildRedTagSummaryMessage,
    RED_TAG_RESULT
} from "./acknowledgementMessages.js";
import { PROCESSING_STATUS, RED_TAG_LABEL, RED_TAG_STATUS_LABEL } from "./constants.js";
import { extractField, splitByField } from "./extractField.js";
import { isSameTag } from "./googleSheetsRepository.js";
import { logger } from "./logger.js";

// Cari satu tag sesuai status, kalau gagal kembalikan alasannya
function findRedTagToUpdate(redTags, tagInput, wantClosed) {
    const matches = redTags.filter((redTag) => isSameTag(redTag.tagNumber, tagInput));
    const candidates = matches.filter((redTag) => Boolean(redTag.closedAt) === wantClosed);

    if (matches.length === 0) {
        return { reason: RED_TAG_RESULT.NOT_FOUND };
    }

    if (candidates.length === 0) {
        return { reason: wantClosed ? RED_TAG_RESULT.ALREADY_OPEN : RED_TAG_RESULT.ALREADY_CLOSED };
    }

    if (candidates.length > 1) {
        return { reason: RED_TAG_RESULT.DUPLICATE };
    }

    return { redTag: candidates[0] };
}

// Close atau reopen satu blok, closedAt ikut diubah supaya tag sama di blok berikutnya terbaca benar
async function processBlock(block, redTags, { message, redTagRepository }) {
    const isReopen = extractField(block, RED_TAG_STATUS_LABEL)?.toLowerCase() === "open";
    const labels = isReopen ? [RED_TAG_LABEL.TAG_NUMBER] : Object.values(RED_TAG_LABEL);
    const fields = Object.fromEntries(labels.map((label) => [label, extractField(block, label)]));
    const tagInput = fields[RED_TAG_LABEL.TAG_NUMBER];
    const missingLabels = labels.filter((label) => !fields[label]);

    if (missingLabels.length > 0) {
        return { status: PROCESSING_STATUS.INVALID, tag: tagInput ?? "-", detail: buildMissingFieldsResult(missingLabels) };
    }

    const { redTag, reason } = findRedTagToUpdate(redTags, tagInput, isReopen);

    if (!redTag) {
        return { status: PROCESSING_STATUS.INVALID, tag: tagInput, detail: reason };
    }

    try {
        if (isReopen) {
            await redTagRepository.reopenRedTag(redTag.rowNumber);
            redTag.closedAt = "";
            logger.info(`Red Tag ${redTag.tagNumber} reopened at row ${redTag.rowNumber} for messageId=${message.messageId}`);
            return { status: PROCESSING_STATUS.PROCESSED, tag: redTag.tagNumber, detail: RED_TAG_RESULT.REOPENED };
        }

        const closedDate = message.receivedAt.slice(0, 10);
        const solution = fields[RED_TAG_LABEL.SOLUTION];
        const solvedBy = fields[RED_TAG_LABEL.SOLVED_BY];

        await redTagRepository.closeRedTag({ rowNumber: redTag.rowNumber, solvedBy, solution, closedDate });
        redTag.closedAt = closedDate;
        logger.info(`Red Tag ${redTag.tagNumber} closed at row ${redTag.rowNumber} for messageId=${message.messageId}`);
        return { status: PROCESSING_STATUS.PROCESSED, tag: redTag.tagNumber, detail: buildClosedResult(solution, solvedBy) };
    } catch (error) {
        logger.error(`Failed to update Red Tag ${redTag.tagNumber} for messageId=${message.messageId}: ${error.message}`);
        return { status: PROCESSING_STATUS.ERROR, tag: redTag.tagNumber, detail: RED_TAG_RESULT.FAILED };
    }
}

// Proses pesan grup
export async function processMessage(message, { allowedGroupIds, redTagRepository, botJids, sendReply }) {
    const { messageId, groupId, senderName, senderPhone, messageText } = message;

    if (!allowedGroupIds.includes(groupId)) {
        logger.info(`Ignoring messageId=${messageId} from non-allowed groupId=${groupId}`);
        return PROCESSING_STATUS.IGNORED;
    }

    const blocks = splitByField(messageText, RED_TAG_LABEL.TAG_NUMBER);
    const mentionsBot = message.mentionedJids.some((jid) => botJids.includes(jid));

    if (blocks.length === 0 || !mentionsBot) {
        return PROCESSING_STATUS.IGNORED;
    }

    logger.info(`Processing messageId=${messageId} sender=${senderName} phone=${senderPhone} tags=${blocks.length} groupId=${groupId}`);

    try {
        if (!senderPhone || !(await redTagRepository.isTechnician(senderPhone))) {
            logger.warn(`Rejected messageId=${messageId}: phone=${senderPhone} is not a registered technician`);
            await sendReply(message, buildNotTechnicianMessage());
            return PROCESSING_STATUS.INVALID;
        }

        const redTags = await redTagRepository.listRedTags();
        const results = [];

        for (const block of blocks) {
            results.push(await processBlock(block, redTags, { message, redTagRepository }));
        }

        await sendReply(message, buildRedTagSummaryMessage(results, message.receivedAt));

        // ERROR didahulukan supaya kegagalan simpan terlihat di log dan test
        const statuses = results.map((result) => result.status);
        return [PROCESSING_STATUS.ERROR, PROCESSING_STATUS.PROCESSED].find((status) => statuses.includes(status)) ?? PROCESSING_STATUS.INVALID;
    } catch (error) {
        logger.error(`Failed to process messageId=${messageId}: ${error.message}`);
        return PROCESSING_STATUS.ERROR;
    }
}
