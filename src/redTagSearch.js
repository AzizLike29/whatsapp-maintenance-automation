import { isSameTag } from "./googleSheetsRepository.js";

// Kolom yang dicocokkan sebagian, kolom lain harus sama persis
const CONTAINS_FIELDS = ["equipment", "deskripsi", "penanggulangan"];
const MAX_ROWS = 20;

// Tahun close diambil dari teks Tgl Close
const closeYear = (redTag) => String(redTag.tglClose ?? "").match(/\d{4}/)?.[0] ?? "";

// Cek satu filter, huruf besar kecil diabaikan
function matchesFilter(redTag, field, value) {
    const input = String(value).trim().toLowerCase();

    if (field === "noTag") {
        return isSameTag(redTag.noTag, input);
    }

    const actual = String((field === "tahunClose" ? closeYear(redTag) : redTag[field]) ?? "").trim().toLowerCase();
    return CONTAINS_FIELDS.includes(field) ? actual.includes(input) : actual === input;
}

// Saring tag, lalu kembalikan jumlah, rekap per kolom, dan contoh baris
export function searchRedTags(redTags, { kelompokkan, urutan, ...filters } = {}) {
    const activeFilters = Object.entries(filters).filter(([, value]) => value !== undefined && value !== "");
    const matches = redTags.filter((redTag) => activeFilters.every(([field, value]) => matchesFilter(redTag, field, value)));

    const counts = {};
    for (const redTag of kelompokkan ? matches : []) {
        const key = redTag[kelompokkan] || "(kosong)";
        counts[key] = (counts[key] ?? 0) + 1;
    }

    return {
        jumlah: matches.length,
        rekap: Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, MAX_ROWS)
            .map(([nilai, jumlah]) => ({ nilai, jumlah })),
        contoh: urutan === "terlama" ? matches.slice(0, MAX_ROWS) : matches.slice(-MAX_ROWS).reverse()
    };
}