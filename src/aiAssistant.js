import { GoogleGenAI, Type } from "@google/genai";
import { searchRedTags } from "./redTagSearch.js";

// Batas bolak-balik AI dan fungsi supaya tidak berputar terus
const MAX_STEPS = 4;

const SYSTEM_INSTRUCTION = [
    "Kamu asisten data Dashboard Maintenance di grup WhatsApp",
    "Jawab dalam bahasa Indonesia, singkat dan jelas, tanpa emoji, boleh pakai ✓ dan ✗",
    "Selalu pakai fungsi cariDashboardMaintenance untuk data, jangan mengarang angka atau No Tag",
    "Kalau pertanyaan di luar data Red Tag, jawab bahwa kamu hanya membantu seputar Dashboard Maintenance",
    "Kamu tidak bisa close atau reopen tag, arahkan teknisi memakai format No Tag"
].join("\n");

const text = (description) => ({ type: Type.STRING, description });

const SEARCH_DECLARATION = {
    name: "cariDashboardMaintenance",
    description: "Cari, hitung, dan rekap data Red Tag dari sheet, semua filter opsional",
    parameters: {
        type: Type.OBJECT,
        properties: {
            status: text("Open atau Close"),
            line: text("Line, contoh A, B, D1"),
            kategori: text("Kategori, contoh Safety, Elektrik"),
            equipment: text("Nama mesin, cocok sebagian"),
            deskripsi: text("Kata di deskripsi masalah, cocok sebagian"),
            penanggulangan: text("Kata di penanggulangan, cocok sebagian"),
            ditemukanOleh: text("Nama penemu"),
            pic: text("PIC"),
            diselesaikanOleh: text("Nama yang menyelesaikan"),
            tahun: text("Tahun Red Tag dibuat, contoh 2026"),
            bulan: text("Bulan Red Tag dibuat, 1 sampai 12"),
            tahunClose: text("Tahun close, contoh 2026"),
            bulanClose: text("Bulan close, 1 sampai 12"),
            noTag: text("No Tag lengkap atau nomor belakang"),
            kelompokkan: {
                type: Type.STRING,
                enum: ["status", "line", "kategori", "equipment", "ditemukanOleh", "pic", "diselesaikanOleh", "tahun", "bulan", "bulanClose"],
                description: "Rekap jumlah per kolom ini"
            },
            urutan: { type: Type.STRING, enum: ["terbaru", "terlama"], description: "Urutan contoh baris" }
        }
    }
};

// Asisten AI yang hanya membaca data Red Tag
export function createAiAssistant({ apiKey, model, redTagRepository }) {
    const ai = new GoogleGenAI({ apiKey });

    // Jawab pertanyaan, null kalau AI tidak memberi jawaban
    async function ask(question, receivedAt) {
        const contents = [{ role: "user", parts: [{ text: question }] }];
        const config = {
            systemInstruction: `${SYSTEM_INSTRUCTION}\nHari ini ${receivedAt.slice(0, 10)}`,
            tools: [{ functionDeclarations: [SEARCH_DECLARATION] }]
        };
        let redTags;

        for (let step = 0; step < MAX_STEPS; step++) {
            const response = await ai.models.generateContent({ model, contents, config });
            const calls = response.functionCalls ?? [];

            if (calls.length === 0) {
                return response.text?.trim() || null;
            }

            redTags ??= await redTagRepository.listRedTagDetails();
            contents.push(response.candidates[0].content);
            contents.push({
                role: "user",
                parts: calls.map((call) => ({
                    functionResponse: { name: call.name, response: searchRedTags(redTags, call.args) }
                }))
            });
        }

        return null;
    }

    return { ask };
}