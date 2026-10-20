import { GoogleGenAI, Type } from "@google/genai";
import { SHEET_TYPES } from "./constants.js";
import { searchRedTags } from "./redTagSearch.js";

// Batas bolak-balik AI dan fungsi supaya tidak berputar terus
const MAX_STEPS = 4;

const SYSTEM_INSTRUCTION = [
    "Kamu asisten data Dashboard Maintenance di grup WhatsApp",
    "Data yang tersedia saat ini: Red Tag, Orange Tag, dan Work Request (WR)",
    "Jawab dalam bahasa Indonesia, singkat dan jelas, tanpa emoji, boleh pakai ✓ dan ✗",
    "Selalu pakai fungsi cariDashboardMaintenance untuk data, jangan mengarang angka atau nomor",
    "Kalau jenis data tidak disebut, cek ketiga jenis lalu sebutkan hasil per jenis",
    "Kalau pertanyaan di luar data itu, jawab bahwa kamu hanya membantu seputar Dashboard Maintenance",
    "Kamu tidak bisa close atau reopen, kalau ditanya format close tampilkan template ini persis",
    "Red Tag: No RT, Penanggulangan, PIC, Tanggal Close opsional DD/MM/YYYY",
    "Orange Tag: No OT, Penanggulangan, PIC, Tanggal Close opsional DD/MM/YYYY",
    "WR: No WR, Penanggulangan, Executor, Tanggal Close opsional DD/MM/YYYY",
    "Reopen: No RT atau No OT atau No WR plus Status: Open",
    "Contoh close Red Tag: No RT: 24308 lalu Penanggulangan: ... lalu PIC: ... lalu Tanggal Close: 19/03/2026"
].join("\n");

const text = (description) => ({ type: Type.STRING, description });

const SEARCH_DECLARATION = {
    name: "cariDashboardMaintenance",
    description: "Cari, hitung, dan rekap data Red Tag, Orange Tag, atau Work Request, semua filter opsional",
    parameters: {
        type: Type.OBJECT,
        properties: {
            jenis: {
                type: Type.STRING,
                enum: Object.keys(SHEET_TYPES),
                description: "redTag untuk Red Tag, orangeTag untuk Orange Tag, workRequest untuk Work Request, default redTag"
            },
            status: text("Open atau Close"),
            line: text("Line, contoh A, B, D1"),
            department: text("Department, contoh Produksi, QC Inline, hanya Orange Tag dan WR"),
            kategori: text("Kategori Red Tag, PIC SYSTEM OT di Orange Tag, atau Work Order Type di WR"),
            equipment: text("Nama mesin atau area, cocok sebagian"),
            deskripsi: text("Kata di deskripsi, cocok sebagian"),
            penanggulangan: text("Kata di penanggulangan, cocok sebagian"),
            ditemukanOleh: text("Nama penemu"),
            pic: text("PIC"),
            diselesaikanOleh: text("Nama yang menyelesaikan, PIC Perbaikan, atau Executor"),
            tahun: text("Tahun data dibuat, contoh 2026"),
            bulan: text("Bulan data dibuat, 1 sampai 12"),
            tahunClose: text("Tahun close, contoh 2026"),
            bulanClose: text("Bulan close, 1 sampai 12"),
            noTag: text("Nomor lengkap atau nomor belakang"),
            kelompokkan: {
                type: Type.STRING,
                enum: ["status", "line", "department", "kategori", "equipment", "ditemukanOleh", "pic", "diselesaikanOleh", "tahun", "bulan", "bulanClose"],
                description: "Rekap jumlah per kolom ini"
            },
            urutan: { type: Type.STRING, enum: ["terbaru", "terlama"], description: "Urutan contoh baris" }
        }
    }
};

// Asisten AI yang hanya membaca data Red Tag, Orange Tag, dan WR
export function createAiAssistant({ apiKey, model, redTagRepository }) {
    const ai = new GoogleGenAI({ apiKey });

    // Jawab pertanyaan, null kalau AI tidak memberi jawaban
    async function ask(question, receivedAt) {
        const contents = [{ role: "user", parts: [{ text: question }] }];
        const config = {
            systemInstruction: `${SYSTEM_INSTRUCTION}\nHari ini ${receivedAt.slice(0, 10)}`,
            tools: [{ functionDeclarations: [SEARCH_DECLARATION] }]
        };
        const detailsByType = {};

        for (let step = 0; step < MAX_STEPS; step++) {
            const response = await ai.models.generateContent({ model, contents, config });
            const calls = response.functionCalls ?? [];

            if (calls.length === 0) {
                return response.text?.trim() || null;
            }

            const parts = [];

            // Tiap sheet dibaca sekali per pertanyaan
            for (const { name, args } of calls) {
                const { jenis, ...filters } = args ?? {};
                const type = SHEET_TYPES[jenis] ? jenis : "redTag";
                detailsByType[type] ??= await redTagRepository.listDetails(type);
                parts.push({ functionResponse: { name, response: searchRedTags(detailsByType[type], filters) } });
            }

            contents.push(response.candidates[0].content);
            contents.push({ role: "user", parts });
        }

        return null;
    }

    return { ask };
}
