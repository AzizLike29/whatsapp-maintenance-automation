// Cetak satu baris log dengan level dan waktu, error dikirim ke stderr
function write(level, message) {
    const line = `[${level}] ${new Date().toISOString()} ${message}`;

    if (level === "ERROR") {
        console.error(line);
        return;
    }

    console.log(line);
}

// Logger sederhana yang dipakai di seluruh aplikasi
export const logger = {
    info: (message) => write("INFO", message),
    warn: (message) => write("WARN", message),
    error: (message) => write("ERROR", message)
};
