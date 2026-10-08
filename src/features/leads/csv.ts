export const CSV_IMPORT_FIELDS = [
  "fullName",
  "email",
  "phone",
  "companyName",
  "companyDomain",
  "jobTitle",
  "industry",
] as const;

export type CsvImportField = (typeof CSV_IMPORT_FIELDS)[number];

export type CsvImportMapping = Partial<Record<CsvImportField, string>>;

export type ParsedCsvFile = {
  fileName: string;
  delimiter: string;
  encoding: string;
  headers: string[];
  rows: string[][];
};

export type CsvPreviewRecord = Record<string, string>;

export type CsvImportPayload = {
  fileName: string;
  delimiter: string;
  encoding: string;
  mapping: CsvImportMapping;
  rows: CsvPreviewRecord[];
};

export const csvImportFieldLabels: Record<CsvImportField, string> = {
  fullName: "Full name",
  email: "Email",
  phone: "Phone",
  companyName: "Company name",
  companyDomain: "Company domain",
  jobTitle: "Job title",
  industry: "Industry",
};

const ENCODINGS_TO_TRY = ["utf-8", "utf-16le", "windows-1252", "iso-8859-1"];
const DELIMITER_CANDIDATES = [",", ";", "\t", "|"];
const HEADER_ALIASES: Record<CsvImportField, string[]> = {
  fullName: ["full name", "name", "contact", "contact name"],
  email: ["email", "email address", "work email"],
  phone: ["phone", "phone number", "mobile", "telephone"],
  companyName: ["company", "company name", "organization", "account"],
  companyDomain: ["domain", "company domain", "website", "company website"],
  jobTitle: ["job title", "title", "role", "position"],
  industry: ["industry", "segment", "vertical"],
};

function stripBom(value: string) {
  return value.replace(/^\uFEFF/, "");
}

function scoreDecodedText(value: string) {
  const replacementCharacters = (value.match(/\uFFFD/g) ?? []).length;
  const nullCharacters = (value.match(/\u0000/g) ?? []).length;
  return replacementCharacters * 5 + nullCharacters * 10;
}

function splitCsvLine(line: string, delimiter: string) {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }

      continue;
    }

    if (character === delimiter && !inQuotes) {
      fields.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  fields.push(current.trim());
  return fields.map((field) => stripBom(field));
}

function splitCsvRows(content: string) {
  const rows: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    const nextCharacter = content[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }

      continue;
    }

    if ((character === "\n" || character === "\r") && !inQuotes) {
      if (current.length > 0) {
        rows.push(current);
        current = "";
      }

      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      continue;
    }

    current += character;
  }

  if (current.length > 0) {
    rows.push(current);
  }

  return rows.filter((row) => row.trim().length > 0);
}

function detectEncoding(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);

  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return "utf-16le";
  }

  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return "utf-16be";
  }

  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return "utf-8";
  }

  let bestEncoding = ENCODINGS_TO_TRY[0];
  let bestScore = Number.POSITIVE_INFINITY;

  for (const encoding of ENCODINGS_TO_TRY) {
    try {
      const decoded = new TextDecoder(encoding).decode(buffer);
      const score = scoreDecodedText(decoded);

      if (score < bestScore) {
        bestScore = score;
        bestEncoding = encoding;
      }
    } catch {
      continue;
    }
  }

  return bestEncoding;
}

function detectDelimiter(headerLine: string, sampleLine?: string) {
  const candidates = DELIMITER_CANDIDATES.map((delimiter) => {
    const headerColumns = splitCsvLine(headerLine, delimiter).length;
    const sampleColumns = sampleLine
      ? splitCsvLine(sampleLine, delimiter).length
      : headerColumns;

    return {
      delimiter,
      score: headerColumns + sampleColumns,
    };
  });

  candidates.sort((left, right) => right.score - left.score);
  return candidates[0]?.delimiter ?? ",";
}

export async function parseCsvFile(file: File): Promise<ParsedCsvFile> {
  const buffer = await file.arrayBuffer();
  const encoding = detectEncoding(buffer);
  const decoded = stripBom(new TextDecoder(encoding).decode(buffer));
  const rowStrings = splitCsvRows(decoded);

  if (rowStrings.length < 2) {
    throw new Error("Add a CSV with a header row and at least one data row.");
  }

  const delimiter = detectDelimiter(rowStrings[0], rowStrings[1]);
  const headers = splitCsvLine(rowStrings[0], delimiter).map((header) =>
    header.trim()
  );

  if (headers.every((header) => header.length === 0)) {
    throw new Error("The CSV header row is empty.");
  }

  const rows = rowStrings.slice(1).map((row) => {
    const values = splitCsvLine(row, delimiter);

    return headers.map((_, index) => values[index] ?? "");
  });

  return {
    fileName: file.name,
    delimiter,
    encoding,
    headers,
    rows,
  };
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

export function autoMapCsvHeaders(headers: string[]): CsvImportMapping {
  const mapping: CsvImportMapping = {};

  for (const field of CSV_IMPORT_FIELDS) {
    const aliases = HEADER_ALIASES[field];
    const match = headers.find((header) => aliases.includes(normalizeHeader(header)));

    if (match) {
      mapping[field] = match;
    }
  }

  return mapping;
}

export function buildCsvPreviewRecords(parsedCsv: ParsedCsvFile, limit = 5) {
  return parsedCsv.rows.slice(0, limit).map((row) =>
    parsedCsv.headers.reduce<CsvPreviewRecord>((record, header, index) => {
      record[header] = row[index] ?? "";
      return record;
    }, {})
  );
}

export function buildCsvImportRows(parsedCsv: ParsedCsvFile) {
  return parsedCsv.rows.map((row) =>
    parsedCsv.headers.reduce<CsvPreviewRecord>((record, header, index) => {
      record[header] = row[index] ?? "";
      return record;
    }, {})
  );
}

export function buildMappedPreviewRows(
  previewRows: CsvPreviewRecord[],
  mapping: CsvImportMapping
) {
  return previewRows.map((row) =>
    CSV_IMPORT_FIELDS.reduce<Record<CsvImportField, string>>((record, field) => {
      const header = mapping[field];
      record[field] = header ? row[header] ?? "" : "";
      return record;
    }, {} as Record<CsvImportField, string>)
  );
}

export function validateCsvImportPayload(payload: CsvImportPayload) {
  return (
    payload.fileName.trim().length > 0 &&
    Object.keys(payload.mapping).length > 0 &&
    payload.rows.length > 0
  );
}
