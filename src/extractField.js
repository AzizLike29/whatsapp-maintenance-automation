// Nilai yang dianggap kosong
const EMPTY_VALUES = ["", "-"];

// Rapikan label, nomor urut "1." di depan diabaikan
function normalizeLabel(label) {
    return label.toLowerCase().replace(/^\s*\d+[.)]/, "").replace(/[\s*_]/g, "");
}

// Label di baris "Label: isi", null kalau tidak ada ":"
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

// Pecah pesan per blok, tiap blok diawali baris label
export function splitByField(messageText, label) {
    const expectedLabel = normalizeLabel(label);
    const blocks = [];

    for (const line of messageText.split("\n")) {
        if (labelOf(line) === expectedLabel) {
            blocks.push([]);
        }
        blocks.at(-1)?.push(line);
    }

    return blocks.map((lines) => lines.join("\n"));
}
