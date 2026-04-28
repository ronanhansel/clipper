class FileDownloadService {
  downloadTextFile(fileName: string, content: string) {
    const url = URL.createObjectURL(new Blob([content], { type: "application/json;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }
}

export const fileDownloadService = new FileDownloadService();
