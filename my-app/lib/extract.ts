import { lookup } from "mime-types";

export async function extractText(
  filename: string,
  mime: string | undefined,
  bytes: Buffer,
): Promise<string> {
  const lower = filename.toLowerCase();

  if (mime === "text/plain" || lower.endsWith(".txt")) {
    return bytes.toString("utf-8");
  }

  if (mime === "application/pdf" || lower.endsWith(".pdf")) {
    // Polyfill DOMMatrix for pdfjs
    const { default: DOMMatrix } = await import("dommatrix");
    (globalThis as any).DOMMatrix ??= DOMMatrix;

    const { PDFParse } = await import("pdf-parse");

    const path = await import("path");
    const workerPath = path.join(
      process.cwd(),
      "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    );
    PDFParse.setWorker(workerPath);

    const parser = new PDFParse({ data: bytes });
    const out = await parser.getText();
    return out.text ?? "";
  }

  if (mime?.includes("officedocument") || lower.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const out = await mammoth.extractRawText({ buffer: bytes });
    return out.value ?? "";
  }

  return bytes.toString("utf-8");
}
