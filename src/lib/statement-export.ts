import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

export interface StatementData {
  title: string;
  companyName: string;
  period: string;
  currency: string;
  headers: string[];
  rows: (string | number)[][];
  numericColumns: number[]; // colonnes alignées à droite / formatées en nombre
  totals: { label: string; value: number }[];
}

const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

export async function buildStatementXlsx(d: StatementData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Verzapay";
  wb.created = new Date();
  const ws = wb.addWorksheet(d.title.slice(0, 28));

  ws.addRow([d.title]).font = { bold: true, size: 14 };
  ws.addRow([`Entreprise : ${d.companyName}`]);
  ws.addRow([`Période : ${d.period}`]);
  ws.addRow([`Devise : ${d.currency}`]);
  ws.addRow([]);

  const headerRow = ws.addRow(d.headers);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D4ED8" } };
    c.alignment = { vertical: "middle" };
  });

  for (const r of d.rows) ws.addRow(r);
  d.numericColumns.forEach((i) => { ws.getColumn(i + 1).numFmt = "#,##0.##"; ws.getColumn(i + 1).alignment = { horizontal: "right" }; });

  ws.addRow([]);
  for (const t of d.totals) {
    const row = ws.addRow([t.label, ...Array(Math.max(0, d.headers.length - 2)).fill(""), t.value]);
    row.font = { bold: true };
    row.getCell(d.headers.length).numFmt = "#,##0.##";
  }

  ws.columns.forEach((col, i) => {
    let max = (d.headers[i] ?? "").length;
    d.rows.forEach((r) => { max = Math.max(max, String(r[i] ?? "").length); });
    col.width = Math.min(Math.max(max + 2, 10), 42);
  });
  ws.views = [{ state: "frozen", ySplit: 6 }];

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function buildStatementPdf(d: StatementData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 36, info: { Title: d.title, Author: "Verzapay" } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const brand = "#1D4ED8";
    const pageW = doc.page.width - 72;
    const colW = pageW / d.headers.length;

    const drawHeader = () => {
      doc.fillColor(brand).fontSize(16).font("Helvetica-Bold").text("Verzapay", 36, 30);
      doc.fillColor("#111").fontSize(13).text(d.title, 36, 52);
      doc.fontSize(9).font("Helvetica").fillColor("#555")
        .text(`${d.companyName}  ·  Période : ${d.period}  ·  Devise : ${d.currency}  ·  Édité le ${new Date().toLocaleDateString("fr-FR")}`, 36, 70);
      const y = 92;
      doc.rect(36, y, pageW, 20).fill(brand);
      doc.fillColor("#fff").font("Helvetica-Bold").fontSize(8.5);
      d.headers.forEach((h, i) => doc.text(h, 40 + i * colW, y + 6, { width: colW - 8, align: d.numericColumns.includes(i) ? "right" : "left", lineBreak: false }));
      return y + 24;
    };

    let y = drawHeader();
    doc.font("Helvetica").fontSize(8.5);

    d.rows.forEach((r, idx) => {
      if (y > doc.page.height - 70) { doc.addPage(); y = drawHeader(); doc.font("Helvetica").fontSize(8.5); }
      if (idx % 2 === 0) doc.rect(36, y - 3, pageW, 16).fill("#F4F6FB");
      doc.fillColor("#111");
      r.forEach((cell, i) => {
        const text = typeof cell === "number" ? nf.format(cell) : String(cell ?? "");
        doc.text(text, 40 + i * colW, y, { width: colW - 8, align: d.numericColumns.includes(i) ? "right" : "left", lineBreak: false, ellipsis: true });
      });
      y += 16;
    });

    y += 8;
    if (y > doc.page.height - 90) { doc.addPage(); y = 60; }
    doc.moveTo(36, y).lineTo(36 + pageW, y).strokeColor("#ccc").stroke();
    y += 8;
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#111");
    for (const t of d.totals) {
      doc.text(`${t.label} : ${nf.format(t.value)} ${d.currency}`, 36, y, { width: pageW, align: "right" });
      y += 15;
    }
    doc.end();
  });
}
