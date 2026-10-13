import {
    buildRedTagAlreadyClosedMessage,
    buildRedTagAlreadyOpenMessage,
    buildRedTagClosedMessage,
    buildRedTagDuplicateMessage,
    buildRedTagNotFoundMessage,
    buildRedTagReopenedMessage,
    buildReportInvalidMessage
} from "./acknowledgementMessages.js";
import { PROCESSING_STATUS, RED_TAG_LABEL, RED_TAG_STATUS_LABEL } from "./constants.js";
import { extractField } from "./extractField.js";
import { logger } from "./logger.js";

// Cari tepat satu tag dengan status yang diinginkan, kalau gagal balas alasannya ke grup
async function findRedTagToUpdate(message, tagInput, { wantClosed, redTagRepository, sendReply }) {
    const matches = await redTagRepository.findRedTags(tagInput);
    const candidates = matches.filter((redTag) => Boolean(redTag.closedAt) === wantClosed);

    if (matches.length === 0) {
        await sendReply(message, buildRedTagNotFoundMessage(tagInput));
        return null;
    }

    if (candidates.length === 0) {
        await sendReply(message, wantClosed ? buildRedTagAlreadyOpenMessage(tagInput) : buildRedTagAlreadyClosedMessage(tagInput));
        return null;
    }

    if (candidates.length > 1) {
        await sendReply(message, buildRedTagDuplicateMessage(tagInput));
        return null;
    }

    return candidates[0];
}

// Proses close: cek field wajib, cari tag yang masih Open, lalu tulis ke sheet
async function processRedTagClose(message, { redTagRepository, sendReply }) {
    const fields = Object.fromEntries(
        Object.values(RED_TAG_LABEL).map((label) => [label, extractField(message.messageText, label)])
    );
    const missingLabels = Object.keys(fields).filter((label) => !fields[label]);

    if (missingLabels.length > 0) {
        await sendReply(message, buildReportInvalidMessage(missingLabels));
        return PROCESSING_STATUS.INVALID;
    }

    const redTag = await findRedTagToUpdate(message, fields[RED_TAG_LABEL.TAG_NUMBER], {
        wantClosed: false,
        redTagRepository,
        sendReply
    });

    if (!redTag) {
        return PROCESSING_STATUS.INVALID;
    }

    const closedDate = message.receivedAt.slice(0, 10);
    await redTagRepository.closeRedTag({
        rowNumber: redTag.rowNumber,
        solvedBy: fields[RED_TAG_LABEL.SOLVED_BY],
        solution: fields[RED_TAG_LABEL.SOLUTION],
        closedDate
    });
    logger.info(`Red Tag ${redTag.tagNumber} closed at row ${redTag.rowNumber} for messageId=${message.messageId}`);

    await sendReply(message, buildRedTagClosedMessage(redTag.tagNumber, closedDate));
    return PROCESSING_STATUS.PROCESSED;
}

// Proses reopen: cari tag yang sudah Close, lalu kosongkan kolomnya
async function processRedTagReopen(message, { redTagRepository, sendReply }) {
    const tagInput = extractField(message.messageText, RED_TAG_LABEL.TAG_NUMBER);
    const redTag = await findRedTagToUpdate(message, tagInput, { wantClosed: true, redTagRepository, sendReply });

    if (!redTag) {
        return PROCESSING_STATUS.INVALID;
    }

    await redTagRepository.reopenRedTag(redTag.rowNumber);
    logger.info(`Red Tag ${redTag.tagNumber} reopened at row ${redTag.rowNumber} for messageId=${message.messageId}`);

    await sendReply(message, buildRedTagReopenedMessage(redTag.tagNumber));
    return PROCESSING_STATUS.PROCESSED;
}

// Pintu masuk setiap pesan grup: saring grup dan mention, lalu pilih close atau reopen
export async function processMessage(message, { allowedGroupIds, redTagRepository, botJids, sendReply }) {
    const { messageId, groupId, senderName, messageText } = message;

    if (!allowedGroupIds.includes(groupId)) {
        logger.info(`Ignoring messageId=${messageId} from non-allowed groupId=${groupId}`);
        return PROCESSING_STATUS.IGNORED;
    }

    const hasTagNumber = extractField(messageText, RED_TAG_LABEL.TAG_NUMBER) !== null;
    const mentionsBot = message.mentionedJids.some((jid) => botJids.includes(jid));

    if (!hasTagNumber || !mentionsBot) {
        return PROCESSING_STATUS.IGNORED;
    }

    logger.info(`Processing messageId=${messageId} sender=${senderName} groupId=${groupId}`);

    const isReopen = extractField(messageText, RED_TAG_STATUS_LABEL)?.toLowerCase() === "open";
    const handleRedTag = isReopen ? processRedTagReopen : processRedTagClose;

    try {
        return await handleRedTag(message, { redTagRepository, sendReply });
    } catch (error) {
        logger.error(`Failed to update Red Tag for messageId=${messageId}: ${error.message}`);
        return PROCESSING_STATUS.ERROR;
    }
}