import { buildAiUnavailableMessage, buildClosedResult, buildMissingFieldsResult, buildNotTechnicianMessage, buildRedTagSummaryMessage, RED_TAG_RESULT } from "./acknowledgementMessages.js";
import { CLOSE_DATE_LABEL, PROCESSING_STATUS, SHEET_TYPES, STATUS_LABEL } from "./constants.js";
import { extractField, splitByField } from "./extractField.js";
import { buildDoneMessage, buildPdfFailedMessage, buildWaitingMessage } from "./exportReport.js";
import { isSameTag } from "./googleSheetsRepository.js";
import { logger } from "./logger.js";

// Jenis sheet berdasarkan label nomor
const TYPE_BY_LABEL = Object.fromEntries(Object.entries(SHEET_TYPES).map(([type, { labels }]) => [labels.TAG_NUMBER, type]));

// Ubah format DD/MM/YYYY jadi YYYY-MM-DD
function parseCloseDate(value) {
    const match = String(value).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) {
        return null;
    }
    const [, day, month, year] = match;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

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

// Close atau reopen satu blok, Tanggal Close opsional kalau diisi
async function processBlock({ type, text }, tags, { message, redTagRepository }) {
    const { name, labels: sheetLabels } = SHEET_TYPES[type];
    const isReopen = extractField(text, STATUS_LABEL)?.toLowerCase() === "open";
    const labels = isReopen ? [sheetLabels.TAG_NUMBER] : Object.values(sheetLabels);
    const fields = Object.fromEntries(labels.map((label) => [label, extractField(text, label)]));
    const tagInput = fields[sheetLabels.TAG_NUMBER];
    const missingLabels = labels.filter((label) => !fields[label]);

    if (missingLabels.length > 0) {
        return { status: PROCESSING_STATUS.INVALID, type, tag: tagInput ?? "-", detail: buildMissingFieldsResult(missingLabels) };
    }

    const { redTag, reason } = findRedTagToUpdate(tags, tagInput, isReopen);

    if (!redTag) {
        return { status: PROCESSING_STATUS.INVALID, type, tag: tagInput, detail: reason };
    }

    try {
        if (isReopen) {
            await redTagRepository.reopenTag(type, redTag.rowNumber);
            redTag.closedAt = "";
            logger.info(`${name} ${redTag.tagNumber} dibuka kembali di baris ${redTag.rowNumber}, messageId=${message.messageId}`);
            return { status: PROCESSING_STATUS.PROCESSED, type, tag: redTag.tagNumber, detail: RED_TAG_RESULT.REOPENED };
        }
        const rawCloseDate = extractField(text, CLOSE_DATE_LABEL);
        let closedDate = message.receivedAt.slice(0, 10);

        if (rawCloseDate) {
            closedDate = parseCloseDate(rawCloseDate);
            if (!closedDate) {
                return { status: PROCESSING_STATUS.INVALID, type, tag: redTag.tagNumber, detail: RED_TAG_RESULT.INVALID_CLOSE_DATE };
            }
        }
        const solution = fields[sheetLabels.SOLUTION];
        const solvedBy = fields[sheetLabels.SOLVED_BY];
        await redTagRepository.closeTag(type, { rowNumber: redTag.rowNumber, solvedBy, solution, closedDate });
        redTag.closedAt = closedDate;
        logger.info(`${name} ${redTag.tagNumber} di-close di baris ${redTag.rowNumber}, messageId=${message.messageId}`);
        return { status: PROCESSING_STATUS.PROCESSED, type, tag: redTag.tagNumber, detail: buildClosedResult(solution, solvedBy) };
    } catch (error) {
        logger.error(`Gagal menyimpan ${name} ${redTag.tagNumber}, messageId=${message.messageId}: ${error.message}`);
        return { status: PROCESSING_STATUS.ERROR, type, tag: redTag.tagNumber, detail: RED_TAG_RESULT.FAILED };
    }
}

// Kirim PDF ke WhatsApp dan unggah ke SharePoint
async function exportPdfForUser(message, { jenis, tahun }, { sendReply, sendTyping, sendDocument, exportReport }) {
    await sendReply(message, buildWaitingMessage());
    await sendTyping?.(message);

    try {
        const result = await exportReport({ type: jenis, requestedYear: tahun, receivedAt: message.receivedAt });
        await sendDocument(message, { filename: result.filename, buffer: result.pdf, caption: buildDoneMessage(result) });
        logger.info(`PDF ${result.filename} dikirim, messageId=${message.messageId}`);
        return PROCESSING_STATUS.PROCESSED;
    } catch (error) {
        logger.error(`Gagal membuat PDF, messageId=${message.messageId}: ${error.message}`);
        await sendReply(message, buildPdfFailedMessage());
        return PROCESSING_STATUS.ERROR;
    }
}

// Jawab pertanyaan lewat AI atau ekspor PDF
async function answerQuestion(message, { aiAssistant, sendReply, sendTyping, sendDocument, exportReport }) {
    const question = message.messageText.replace(/@\d+/g, "").trim();

    try {
        const answer = await aiAssistant.ask(question, message.receivedAt);

        if (answer?.action === "exportPdf") {
            return await exportPdfForUser(message, answer, { sendReply, sendTyping, sendDocument, exportReport });
        }

        await sendReply(message, answer ?? buildAiUnavailableMessage());
        return answer ? PROCESSING_STATUS.PROCESSED : PROCESSING_STATUS.ERROR;
    } catch (error) {
        logger.error(`AI gagal menjawab, messageId=${message.messageId}: ${error.message}`);
        await sendReply(message, buildAiUnavailableMessage());
        return PROCESSING_STATUS.ERROR;
    }
}

// Proses pesan grup
export async function processMessage(message, { allowedGroupIds, redTagRepository, aiAssistant, botJids, sendReply, sendTyping, sendDocument, exportReport }) {
    const { messageId, groupId, senderName, senderPhone, messageText } = message;

    if (!allowedGroupIds.includes(groupId)) {
        logger.info(`Pesan diabaikan karena grup belum diizinkan, messageId=${messageId} groupId=${groupId}`);
        return PROCESSING_STATUS.IGNORED;
    }

    const blocks = splitByField(messageText, Object.keys(TYPE_BY_LABEL)).map(({ label, text }) => ({ type: TYPE_BY_LABEL[label], text }));
    const mentionsBot = message.mentionedJids.some((jid) => botJids.includes(jid));

    const isQuestion = blocks.length === 0;

    if (!mentionsBot || (isQuestion && !aiAssistant)) {
        return PROCESSING_STATUS.IGNORED;
    }

    logger.info(`Memproses pesan messageId=${messageId} sender=${senderName} phone=${senderPhone} tags=${blocks.length} groupId=${groupId}`);

    try {
        if (!senderPhone || !(await redTagRepository.isTechnician(senderPhone))) {
            logger.warn(`Pesan ditolak karena bukan teknisi terdaftar, messageId=${messageId} phone=${senderPhone}`);
            await sendReply(message, buildNotTechnicianMessage());
            return PROCESSING_STATUS.INVALID;
        }

        if (isQuestion) {
            return await answerQuestion(message, { aiAssistant, sendReply, sendTyping, sendDocument, exportReport });
        }

        const tagsByType = {};
        const results = [];

        // Tiap sheet dibaca sekali
        for (const block of blocks) {
            tagsByType[block.type] ??= await redTagRepository.listTags(block.type);
            results.push(await processBlock(block, tagsByType[block.type], { message, redTagRepository }));
        }

        await sendReply(message, buildRedTagSummaryMessage(results, message.receivedAt));

        // ERROR didahulukan supaya kegagalan simpan terlihat di log dan test
        const statuses = results.map((result) => result.status);
        return [PROCESSING_STATUS.ERROR, PROCESSING_STATUS.PROCESSED].find((status) => statuses.includes(status)) ?? PROCESSING_STATUS.INVALID;
    } catch (error) {
        logger.error(`Gagal memproses pesan, messageId=${messageId}: ${error.message}`);
        return PROCESSING_STATUS.ERROR;
    }
}