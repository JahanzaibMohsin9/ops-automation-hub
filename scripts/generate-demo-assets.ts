import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { deflateSync } from "node:zlib";

type PdfDocument = {
  outputPath: string;
  pages: string[][];
};

type ReceiptLine = {
  text: string;
  emphasis?: boolean;
};

const pdfDocuments: PdfDocument[] = [
  {
    outputPath: "public/demo-assets/invoice/northbeam-invoice.pdf",
    pages: [
      [
        "Northbeam Ops",
        "Invoice",
        "",
        "Bill To: Riverstone Health Partners",
        "Invoice Number: NB-2026-041",
        "Invoice Date: 2026-04-18",
        "Due Date: 2026-05-02",
        "",
        "Revenue intake workflow audit...............$4,800.00",
        "Lead routing automation design..............$3,250.00",
        "Document review queue setup.................$2,150.00",
        "",
        "Subtotal....................................$10,200.00",
        "Tax............................................$816.00",
        "Total.......................................$11,016.00",
        "",
        "Payment Terms: Net 14",
      ],
    ],
  },
  {
    outputPath:
      "public/demo-assets/onboarding/northbeam-onboarding-form.pdf",
    pages: [
      [
        "Northbeam Ops",
        "Client Onboarding Form",
        "",
        "Client Name: Riverstone Health Partners",
        "Primary Contact: Avery Stone",
        "Role: Vice President of Revenue Operations",
        "Email: avery.stone@riverstone-health.com",
        "Phone: +1 312 555 0189",
        "",
        "Implementation Lead: Samira Cole",
        "Kickoff Date: 2026-04-28",
        "Primary Goal: Reduce manual handoff work across HubSpot and Slack",
        "",
        "Notes:",
        "Prioritize qualification review and downstream onboarding handoff.",
      ],
    ],
  },
  {
    outputPath:
      "public/demo-assets/agreement/northbeam-master-services-agreement.pdf",
    pages: [
      [
        "Master Services Agreement",
        "",
        "This Agreement is between Northbeam Ops and Archway Freight.",
        "Effective Date: 2026-04-15",
        "Term: 12 months",
        "",
        "Services",
        "Northbeam Ops will design and implement workflow automation",
        "for intake qualification, document review, and operational handoff.",
        "",
        "Commercial Terms",
        "Monthly retainer: $8,500",
        "Payment Schedule: Net 30",
        "",
        "Authorized Signatories",
        "Northbeam Ops / Archway Freight",
      ],
    ],
  },
];

const scannedReceiptLines: ReceiptLine[] = [
  { text: "NORTHBEAM OPS", emphasis: true },
  { text: "Travel Receipt" },
  { text: "Apr 19 2026   08:42 PM" },
  { text: "Taxi and client dinner" },
  { text: "Subtotal      $86.00" },
  { text: "Tax            $6.88" },
  { text: "Total         $92.88", emphasis: true },
  { text: "Card xxxx-1041" },
];

function escapePdfText(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildPdfBytes(document: PdfDocument) {
  const objects: string[] = [];
  const pageObjectIds: number[] = [];
  const contentObjectIds: number[] = [];

  objects.push("<< /Type /Catalog /Pages 2 0 R >>");

  const pageKids = document.pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ");
  objects.push(
    `<< /Type /Pages /Kids [${pageKids}] /Count ${document.pages.length} >>`
  );

  document.pages.forEach((lines, index) => {
    const pageObjectId = 3 + index * 2;
    const contentObjectId = 4 + index * 2;
    pageObjectIds.push(pageObjectId);
    contentObjectIds.push(contentObjectId);

    const lineHeight = 18;
    const startY = 760;
    const contentLines = lines
      .map((line, lineIndex) => {
        const y = startY - lineIndex * lineHeight;
        const fontSize = lineIndex === 0 ? 20 : lineIndex === 1 ? 16 : 11;
        return `BT /F1 ${fontSize} Tf 56 ${y} Td (${escapePdfText(line)}) Tj ET`;
      })
      .join("\n");
    const stream = `${contentLines}\n`;

    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${3 + document.pages.length * 2} 0 R >> >> /Contents ${contentObjectId} 0 R >>`
    );
    objects.push(`<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}endstream`);
  });

  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";

  offsets.slice(1).forEach((offset) => {
    pdf += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  });

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

function buildCrc32Table() {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    table[index] = crc >>> 0;
  }
  return table;
}

const crc32Table = buildCrc32Table();

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const value of buffer) {
    crc = crc32Table[(crc ^ value) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function drawReceiptImage(width: number, height: number, lines: ReceiptLine[]) {
  const data = Buffer.alloc(width * height * 4, 242);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const grain = ((x * 13 + y * 7) % 23) - 11;
      const shade = Math.max(225, Math.min(252, 242 + grain));
      data[index] = shade;
      data[index + 1] = shade;
      data[index + 2] = shade - 2;
      data[index + 3] = 255;
    }
  }

  const margin = 32;
  const contentWidth = width - margin * 2;
  const paperLeft = 26;
  const paperTop = 18;
  const paperWidth = width - 52;
  const paperHeight = height - 36;

  for (let y = paperTop; y < paperTop + paperHeight; y += 1) {
    for (let x = paperLeft; x < paperLeft + paperWidth; x += 1) {
      const index = (y * width + x) * 4;
      data[index] = 252;
      data[index + 1] = 251;
      data[index + 2] = 248;
    }
  }

  function fillRect(x: number, y: number, rectWidth: number, rectHeight: number, value: number) {
    for (let row = y; row < y + rectHeight; row += 1) {
      for (let col = x; col < x + rectWidth; col += 1) {
        if (row < 0 || row >= height || col < 0 || col >= width) {
          continue;
        }
        const index = (row * width + col) * 4;
        data[index] = value;
        data[index + 1] = value;
        data[index + 2] = value;
      }
    }
  }

  lines.forEach((line, lineIndex) => {
    const top = margin + lineIndex * 28;
    const lineHeight = line.emphasis ? 10 : 8;
    const textWidth = Math.max(
      120,
      Math.min(contentWidth, Math.round(line.text.length * (line.emphasis ? 8.4 : 7.1)))
    );
    fillRect(margin + 12, top, textWidth, lineHeight, line.emphasis ? 48 : 72);
  });

  for (let scan = 0; scan < 18; scan += 1) {
    const y = 24 + scan * 18;
    fillRect(36, y, width - 72, 1, 232);
  }

  fillRect(0, height - 26, width, 26, 18);

  return data;
}

function buildPngBytes(width: number, height: number, rgbaData: Buffer) {
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let row = 0; row < height; row += 1) {
    const sourceStart = row * width * 4;
    const targetStart = row * (width * 4 + 1);
    scanlines[targetStart] = 0;
    rgbaData.copy(
      scanlines,
      targetStart + 1,
      sourceStart,
      sourceStart + width * 4
    );
  }

  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(scanlines)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

async function ensureParentDir(filePath: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
}

async function main() {
  for (const document of pdfDocuments) {
    const outputPath = path.join(process.cwd(), document.outputPath);
    await ensureParentDir(outputPath);
    await writeFile(outputPath, buildPdfBytes(document));
  }

  const receiptOutputPath = path.join(
    process.cwd(),
    "public/demo-assets/invoice/northbeam-scanned-receipt.png"
  );
  await ensureParentDir(receiptOutputPath);
  const receiptImage = drawReceiptImage(640, 920, scannedReceiptLines);
  await writeFile(receiptOutputPath, buildPngBytes(640, 920, receiptImage));

  console.log(
    "Generated demo PDF and image assets in public/demo-assets."
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
