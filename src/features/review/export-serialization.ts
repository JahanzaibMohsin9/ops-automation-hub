type ReviewExportRecord = Record<string, string>;

export function escapeCsvCell(value: string) {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

export function serializeCsv(records: ReviewExportRecord[]) {
  if (records.length === 0) {
    return "";
  }

  const headers = Array.from(
    records.reduce((set, record) => {
      Object.keys(record).forEach((key) => set.add(key));
      return set;
    }, new Set<string>())
  );

  const rows = [
    headers.map(escapeCsvCell).join(","),
    ...records.map((record) =>
      headers
        .map((header) => escapeCsvCell(record[header] ?? ""))
        .join(",")
    ),
  ];

  return rows.join("\r\n");
}

export function toPlainValue(value: unknown) {
  if (value == null) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}

export function getEffectiveFieldValue(field: {
  fieldValue: string | null;
  reviewerOverrideValue: string | null;
  isOverridden: boolean;
}) {
  if (field.isOverridden) {
    return field.reviewerOverrideValue ?? "";
  }

  return field.fieldValue ?? "";
}

export type { ReviewExportRecord };
