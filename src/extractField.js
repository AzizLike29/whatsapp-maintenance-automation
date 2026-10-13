// Nilai yang dianggap kosong saat teknisi mengisi field
const EMPTY_VALUES = ["", "-"];

// Samakan format label supaya "*No Tag*" dan "no tag" tetap dianggap sama
function normalizeLabel(label) {
    return label.toLowerCase().replace(/[\s*_]/g, "");
}

// Ambil isi field dari baris "Label: isi", hasilnya null kalau label tidak ada atau kosong
export function extractField(messageText, label) {
    const expectedLabel = normalizeLabel(label);

    for (const line of messageText.split("\n")) {
        const separatorIndex = line.indexOf(":");

        if (separatorIndex === -1) {
            continue;
        }

        if (normalizeLabel(line.slice(0, separatorIndex)) !== expectedLabel) {
            continue;
        }

        const value = line.slice(separatorIndex + 1).trim();
        return EMPTY_VALUES.includes(value) ? null : value;
    }

    return null;
}