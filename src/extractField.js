// Nilai yang dianggap kosong
const EMPTY_VALUES = ["", "-"];

// Rapikan label, nomor urut di depan diabaikan
function normalizeLabel(label) {
    return label.toLowerCase().replace(/^\s*\d+[.)]/, "").replace(/[\s*_]/g, "");
}

// Ambil label sebelum titik dua, null kalau tidak ada titik dua
function labelOf(line) {
    const separatorIndex = line.indexOf(":");
    return separatorIndex === -1 ? null : normalizeLabel(line.slice(0, separatorIndex));
}

// Ambil isi field, null kalau kosong
export function extractField(messageText, label) {
    const expectedLabel = normalizeLabel(label);
    const line = messageText.split("\n").find((line) => labelOf(line) === expectedLabel);

    if (!line) {
        return null;
    }

    const value = line.slice(line.indexOf(":") + 1).trim();
    return EMPTY_VALUES.includes(value) ? null : value;
}

// Pecah pesan per blok, tiap blok diawali salah satu label
export function splitByField(messageText, labels) {
    const blocks = [];

    for (const line of messageText.split("\n")) {
        const label = labels.find((label) => normalizeLabel(label) === labelOf(line));

        if (label) {
            blocks.push({ label, lines: [] });
        }
        blocks.at(-1)?.lines.push(line);
    }

    return blocks.map(({ label, lines }) => ({ label, text: lines.join("\n") }));
}