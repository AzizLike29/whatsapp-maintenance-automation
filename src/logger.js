// Cetak log
function write(level, message) {
    const line = `[${level}] ${new Date().toISOString()} ${message}`;

    if (level === "ERROR") {
        console.error(line);
        return;
    }

    console.log(line);
}

// Logger aplikasi
export const logger = {
    info: (message) => write("INFO", message),
    warn: (message) => write("WARN", message),
    error: (message) => write("ERROR", message)
};
