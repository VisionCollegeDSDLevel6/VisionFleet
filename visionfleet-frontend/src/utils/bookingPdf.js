
import { jsPDF } from "jspdf";

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 18;
const BLUE = [9, 50, 76];
const CYAN = [0, 133, 174];
const MUTED = [97, 119, 132];
const PX_PER_MM = 4;

function display(value, fallback = "Not specified") {
  if (value === null || value === undefined || String(value).trim() === "") {
    return fallback;
  }
  return String(value);
}

function dateTime(value) {
  if (!value) return "Not specified";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not specified";
  return date.toLocaleString("en-NZ", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

function drivingOption(value) {
  if (value === "SELF_DRIVE") return "Self Drive";
  if (value === "DRIVER_REQUIRED") return "Driver Required";
  return display(value);
}

// Render values with the browser's font so names and purposes containing
// Vietnamese diacritics remain legible in the downloaded PDF.
function textImage(value, widthMm, { size = 15, bold = false, color = "#14354b" } = {}) {
  const text = display(value).replace(/\r\n/g, "\n");
  const widthPx = Math.max(50, Math.round(widthMm * PX_PER_MM));
  const font = `${bold ? "700" : "500"} ${size}px Arial, sans-serif`;
  const probe = document.createElement("canvas");
  const measure = probe.getContext("2d");
  if (!measure) throw new Error("Canvas is unavailable in this browser.");
  measure.font = font;
  const maxTextPx = widthPx - 5;
  const lines = [];

  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(" "); continue; }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure.measureText(candidate).width <= maxTextPx) {
        line = candidate;
        continue;
      }
      if (line) { lines.push(line); line = ""; }
      for (const char of word) {
        if (measure.measureText(line + char).width > maxTextPx && line) {
          lines.push(line);
          line = "";
        }
        line += char;
      }
    }
    if (line) lines.push(line);
  }

  const linePx = size + 7;
  const heightPx = Math.max(linePx + 2, lines.length * linePx + 4);
  const canvas = document.createElement("canvas");
  canvas.width = widthPx * 2;
  canvas.height = heightPx * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable in this browser.");
  ctx.scale(2, 2);
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = "top";
  lines.forEach((line, i) => ctx.fillText(line, 1, i * linePx + 1));
  return { data: canvas.toDataURL("image/png"), height: heightPx / PX_PER_MM };
}

function addImageValue(doc, value, x, y, width, options) {
  const rendered = textImage(value, width, options);
  doc.addImage(rendered.data, "PNG", x, y, width, rendered.height);
  return rendered.height;
}

async function logoAsDataUrl(url) {
  if (!url) return null;
  const response = await fetch(url);
  if (!response.ok) return null;
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Unable to read logo."));
    reader.readAsDataURL(blob);
  });
}

function nextPosition(doc, y, needed) {
  if (y + needed <= PAGE_H - 24) return y;
  doc.addPage();
  return 24;
}

function sectionHeading(doc, text, y) {
  y = nextPosition(doc, y, 12);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.5);
  doc.setTextColor(...BLUE);
  doc.text(text, MARGIN, y + 3);
  doc.setDrawColor(210, 228, 235);
  doc.line(MARGIN, y + 7, PAGE_W - MARGIN, y + 7);
  return y + 13;
}

function fieldsGrid(doc, fields, y) {
  const gap = 4;
  const width = (PAGE_W - MARGIN * 2 - gap) / 2;
  for (let i = 0; i < fields.length; i += 2) {
    const pair = fields.slice(i, i + 2);
    const prepared = pair.map(({ label, value }) => ({
      label,
      rendered: textImage(value, width - 11, { size: 15, bold: true }),
    }));
    const height = Math.max(19, ...prepared.map((f) => f.rendered.height + 11));
    y = nextPosition(doc, y, height + 4);

    prepared.forEach(({ label, rendered }, index) => {
      const x = MARGIN + index * (width + gap);
      doc.setFillColor(247, 250, 252);
      doc.setDrawColor(226, 235, 241);
      doc.roundedRect(x, y, width, height, 2, 2, "FD");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.2);
      doc.setTextColor(...MUTED);
      doc.text(label, x + 5, y + 6);
      doc.addImage(rendered.data, "PNG", x + 5, y + 8.5, width - 11, rendered.height);
    });
    y += height + 4;
  }
  return y;
}

/**
 * Download an A4 PDF using the Booking record returned by GET /api/bookings/{id}.
 * Works with both SELF_DRIVE and DRIVER_REQUIRED, with any booking status.
 * No server changes and no write requests are needed.
 */
export async function exportBookingPdf(booking, logoUrl) {
  if (!booking || !Number.isInteger(Number(booking.bookingId))) {
    throw new Error("A valid booking is required to export PDF.");
  }

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  pdf.setProperties({
    title: `Vision Fleet - Booking #${booking.bookingId}`,
    subject: "Vision Fleet booking information",
    author: "Vision Fleet",
  });

  pdf.setFillColor(...BLUE);
  pdf.rect(0, 0, PAGE_W, 63, "F");
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(17, 12, 64, 24, 3, 3, "F");
  try {
    const logoData = await logoAsDataUrl(logoUrl);
    if (logoData) {
      const properties = pdf.getImageProperties(logoData);
      const scale = Math.min(56 / properties.width, 17 / properties.height);
      const w = properties.width * scale;
      const h = properties.height * scale;
      pdf.addImage(logoData, "PNG", 49 - w / 2, 24 - h / 2, w, h);
    }
  } catch {
    // A missing logo should never prevent exporting.
  }
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(17);
  pdf.text("BOOKING SUMMARY", 90, 23);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text("VISION FLEET", 90, 32);
  pdf.setFontSize(8.5);
  pdf.text(`Booking #${booking.bookingId}`, MARGIN, 47);
  pdf.text(`Generated ${dateTime(new Date())}`, PAGE_W - MARGIN, 47, { align: "right" });

  let y = 75;
  y = sectionHeading(pdf, "Booking information", y);
  y = fieldsGrid(pdf, [
    { label: "Booking ID", value: `#${booking.bookingId}` },
    { label: "Status", value: display(booking.status).replaceAll("_", " ") },
    { label: "Requested by", value: booking.requestedByUserId == null ? "Not specified" : `User #${booking.requestedByUserId}` },
    { label: "Booked for", value: booking.bookedForUserId == null ? display(booking.bookingFor) : `User #${booking.bookedForUserId}` },
  ], y);

  y += 3;
  y = sectionHeading(pdf, "Journey details", y);
  y = fieldsGrid(pdf, [
    { label: "Departure (local time)", value: dateTime(booking.departureAt) },
    { label: "Return (local time)", value: dateTime(booking.returnAt) },
    { label: "Driving option", value: drivingOption(booking.drivingOption) },
    { label: "Passenger count", value: display(booking.passengerCount) },
    { label: "Assigned vehicle", value: booking.assignedVanId == null ? "Not assigned" : `Van #${booking.assignedVanId}` },
    { label: "Recurring booking", value: booking.recurrenceGroupId ? "Yes" : "No" },
  ], y);

  y += 3;
  y = sectionHeading(pdf, "Travel purpose", y);
  const purpose = textImage(display(booking.purpose), PAGE_W - MARGIN * 2 - 14, {
    size: 16, color: "#1b3b4d",
  });
  const purposeHeight = Math.max(22, purpose.height + 13);
  y = nextPosition(pdf, y, purposeHeight + 5);
  pdf.setFillColor(247, 250, 252);
  pdf.setDrawColor(226, 235, 241);
  pdf.roundedRect(MARGIN, y, PAGE_W - MARGIN * 2, purposeHeight, 2.5, 2.5, "FD");
  pdf.addImage(purpose.data, "PNG", MARGIN + 7, y + 7, PAGE_W - MARGIN * 2 - 14, purpose.height);
  y += purposeHeight + 10;

  y = nextPosition(pdf, y, 17);
  pdf.setTextColor(...CYAN);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8.2);
  pdf.text("IMPORTANT", MARGIN, y + 2);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(...MUTED);
  pdf.setFontSize(8);
  const note = "This summary shows the booking status at the time of export. It is not approval to travel unless the booking status is APPROVED.";
  pdf.text(pdf.splitTextToSize(note, PAGE_W - MARGIN * 2), MARGIN, y + 8);

  const pages = pdf.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    pdf.setPage(i);
    pdf.setDrawColor(218, 229, 235);
    pdf.line(MARGIN, PAGE_H - 17, PAGE_W - MARGIN, PAGE_H - 17);
    pdf.setTextColor(...MUTED);
    pdf.setFontSize(8);
    pdf.text("Vision Fleet | Booking Summary", MARGIN, PAGE_H - 12);
    pdf.text(`Page ${i} of ${pages}`, PAGE_W - MARGIN, PAGE_H - 12, { align: "right" });
  }
  pdf.save(`VisionFleet_Booking_${booking.bookingId}.pdf`);
}

// =====================================
// MULTI-BOOKING REPORT (ADMIN)
// =====================================

const REPORT_W = 297;
const REPORT_H = 210;
const REPORT_MARGIN = 12;

const REPORT_COLUMNS = [
  { label: "ID", width: 14, value: (b) => `#${b.bookingId}` },
  { label: "Departure", width: 33, value: (b) => dateTime(b.departureAt) },
  { label: "Return", width: 33, value: (b) => dateTime(b.returnAt) },
  { label: "Requested by", width: 25, value: (b) => b.requestedByUserId == null ? "-" : `User #${b.requestedByUserId}` },
  { label: "Pax", width: 14, value: (b) => display(b.passengerCount, "-") },
  { label: "Driving", width: 32, value: (b) => drivingOption(b.drivingOption) },
  { label: "Status", width: 24, value: (b) => display(b.status, "-").replaceAll("_", " ") },
  { label: "Van", width: 20, value: (b) => b.assignedVanId == null ? "-" : `#${b.assignedVanId}` },
  { label: "Purpose", width: 78, value: (b) => display(b.purpose, "-") },
];

function reportCell(doc, value, availableWidth) {
  const text = display(value, "-");
  const width = availableWidth - 3;

  if (/^[\x20-\x7e]*$/.test(text)) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const lines = doc.splitTextToSize(text, width);
    return { type: "text", lines, height: Math.max(3.5, lines.length * 3.5) };
  }
  const image = textImage(text, width, { size: 11, color: "#173348" });
  return { type: "image", ...image };
}

function drawReportTableHeader(doc, y) {
  doc.setFillColor(...BLUE);
  doc.rect(REPORT_MARGIN, y, REPORT_W - REPORT_MARGIN * 2, 9, "F");
  let x = REPORT_MARGIN;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7.6);
  for (const column of REPORT_COLUMNS) {
    doc.text(column.label, x + 2, y + 5.7);
    x += column.width;
  }
  return y + 9;
}

function drawReportFooter(doc, pageCount) {
  for (let p = 1; p <= pageCount; p += 1) {
    doc.setPage(p);
    doc.setDrawColor(219, 229, 237);
    doc.line(REPORT_MARGIN, REPORT_H - 15, REPORT_W - REPORT_MARGIN, REPORT_H - 15);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text("Vision Fleet | Admin Booking Report", REPORT_MARGIN, REPORT_H - 9);
    doc.text(`Page ${p} of ${pageCount}`, REPORT_W - REPORT_MARGIN, REPORT_H - 9, { align: "right" });
  }
}

/**
 * Export a multi-page landscape A4 PDF.
 * Includes every supplied booking, or only bookings filtered by departure date.
 */
export async function exportBookingsReportPdf(bookings, logoUrl, { fromDate = null, toDate = null } = {}) {
  if (!Array.isArray(bookings) || bookings.length === 0) {
    throw new Error("There are no bookings to export.");
  }

  const sorted = [...bookings].sort((a, b) =>
    new Date(a.departureAt).getTime() - new Date(b.departureAt).getTime()
  );
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const rangeLabel = fromDate && toDate
    ? `${fromDate} to ${toDate} (departure dates inclusive)`
    : "All booking dates";
  doc.setProperties({
    title: "Vision Fleet - Booking Report",
    subject: rangeLabel,
    author: "Vision Fleet",
  });

  doc.setFillColor(...BLUE);
  doc.rect(0, 0, REPORT_W, 42, "F");
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(12, 8, 61, 26, 2.5, 2.5, "F");
  try {
    const logoData = await logoAsDataUrl(logoUrl);
    if (logoData) {
      const info = doc.getImageProperties(logoData);
      const scale = Math.min(54 / info.width, 19 / info.height);
      const w = info.width * scale;
      const h = info.height * scale;
      doc.addImage(logoData, "PNG", 42.5 - w / 2, 21 - h / 2, w, h);
    }
  } catch {
    // Export still works when the logo cannot be loaded.
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.setTextColor(255, 255, 255);
  doc.text("BOOKING REPORT", 87, 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(rangeLabel, 87, 26);
  doc.setFontSize(8);
  doc.text(`Generated ${dateTime(new Date())}`, REPORT_W - REPORT_MARGIN, 35, { align: "right" });

  const countStatus = (status) => sorted.filter(
    (b) => String(b.status || "").toUpperCase() === status
  ).length;
  doc.setFillColor(245, 249, 251);
  doc.roundedRect(REPORT_MARGIN, 48, REPORT_W - REPORT_MARGIN * 2, 21, 2, 2, "F");
  const metrics = [
    ["TOTAL", sorted.length],
    ["PENDING", countStatus("PENDING")],
    ["APPROVED", countStatus("APPROVED")],
    ["CANCELLED", countStatus("CANCELLED")],
    ["OTHER", sorted.length - countStatus("PENDING") - countStatus("APPROVED") - countStatus("CANCELLED")],
  ];
  metrics.forEach(([label, count], i) => {
    const x = REPORT_MARGIN + 10 + i * 54;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...BLUE);
    doc.text(String(count), x, 57);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.7);
    doc.setTextColor(...MUTED);
    doc.text(label, x, 64);
  });

  let y = drawReportTableHeader(doc, 76);
  sorted.forEach((booking, index) => {
    const cells = REPORT_COLUMNS.map((c) => reportCell(doc, c.value(booking), c.width));
    const rowHeight = Math.max(11, ...cells.map((cell) => cell.height + 5));
    if (y + rowHeight > REPORT_H - 19) {
      doc.addPage();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...BLUE);
      doc.text("VISION FLEET | BOOKING REPORT (CONTINUED)", REPORT_MARGIN, 17);
      y = drawReportTableHeader(doc, 24);
    }
    if (index % 2 === 0) {
      doc.setFillColor(246, 250, 252);
      doc.rect(REPORT_MARGIN, y, REPORT_W - REPORT_MARGIN * 2, rowHeight, "F");
    }
    doc.setDrawColor(229, 236, 242);
    doc.line(REPORT_MARGIN, y + rowHeight, REPORT_W - REPORT_MARGIN, y + rowHeight);
    let x = REPORT_MARGIN;
    cells.forEach((cell, i) => {
      doc.setTextColor(...BLUE);
      if (cell.type === "image") {
        doc.addImage(
          cell.data, "PNG", x + 1.5, y + 2.2,
          REPORT_COLUMNS[i].width - 3, cell.height
        );
      } else {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.text(cell.lines, x + 1.5, y + 4.7, { lineHeightFactor: 1.15 });
      }
      x += REPORT_COLUMNS[i].width;
    });
    y += rowHeight;
  });

  drawReportFooter(doc, doc.internal.getNumberOfPages());
  const filename = fromDate && toDate
    ? `VisionFleet_Bookings_${fromDate}_to_${toDate}.pdf`
    : "VisionFleet_All_Bookings.pdf";
  doc.save(filename);
}
