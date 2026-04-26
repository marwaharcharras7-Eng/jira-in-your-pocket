import { useState } from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { Download, Loader2 } from "lucide-react";
import { getAllIssues } from "@/server/jira.functions";
import { toast } from "sonner";

// Brand palette — blue + grey, applied throughout the audit PDF
const BRAND = {
  primary: [37, 99, 235] as [number, number, number], // blue-600
  primaryDark: [29, 78, 216] as [number, number, number], // blue-700
  primarySoft: [219, 234, 254] as [number, number, number], // blue-100
  textDark: [30, 41, 59] as [number, number, number], // slate-800
  textMuted: [100, 116, 139] as [number, number, number], // slate-500
  border: [203, 213, 225] as [number, number, number], // slate-300
  bgGrey: [248, 250, 252] as [number, number, number], // slate-50
  white: [255, 255, 255] as [number, number, number],
  success: [22, 163, 74] as [number, number, number],
  warning: [217, 119, 6] as [number, number, number],
  danger: [220, 38, 38] as [number, number, number],
};

function statusColor(status: string): [number, number, number] {
  const s = status.toLowerCase();
  if (s.includes("done") || s.includes("closed")) return BRAND.success;
  if (s.includes("progress") || s.includes("review")) return BRAND.warning;
  if (s.includes("open") || s.includes("todo")) return BRAND.danger;
  return BRAND.textMuted;
}

function priorityColor(priority: string): [number, number, number] {
  const p = priority.toLowerCase();
  if (p.includes("highest") || p.includes("high")) return BRAND.danger;
  if (p.includes("medium")) return BRAND.warning;
  return BRAND.textMuted;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

export function ExportAuditButton() {
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);
    try {
      const result = await getAllIssues();
      if (result.error) throw new Error(result.error);
      const issues = result.issues;
      const viewer = result.viewer;

      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const generatedAt = new Date().toLocaleString("en-GB", {
        dateStyle: "long",
        timeStyle: "short",
      });

      // ───── Header banner ─────
      doc.setFillColor(...BRAND.primary);
      doc.rect(0, 0, pageWidth, 90, "F");

      doc.setTextColor(...BRAND.white);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.text("Ticket Audit Report", 40, 45);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text("Jira in Your Pocket — CMV Maintenance", 40, 64);
      doc.text(`Generated ${generatedAt}`, 40, 78);

      // ───── User info card ─────
      let y = 110;
      doc.setFillColor(...BRAND.bgGrey);
      doc.setDrawColor(...BRAND.border);
      doc.roundedRect(40, y, pageWidth - 80, 80, 6, 6, "FD");

      doc.setTextColor(...BRAND.textMuted);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text("AUDIT FOR", 56, y + 20);

      doc.setTextColor(...BRAND.textDark);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(viewer.displayName ?? "Current user", 56, y + 38);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(...BRAND.textMuted);
      const roleLabel =
        viewer.role === "manager"
          ? "Maintenance Manager — full team scope"
          : viewer.role === "technician"
            ? "Maintenance Technician — own assignments"
            : "Unassigned role";
      doc.text(roleLabel, 56, y + 54);

      doc.setFontSize(9);
      doc.text(`Total tickets in scope: ${issues.length}`, 56, y + 70);

      // ───── Summary metrics ─────
      y += 100;
      const open = issues.filter(
        (i) => i.fields.status.statusCategory.key !== "done",
      ).length;
      const done = issues.filter(
        (i) => i.fields.status.statusCategory.key === "done",
      ).length;
      const high = issues.filter((i) => {
        const p = i.fields.priority?.name?.toLowerCase() ?? "";
        return p.includes("high") || p.includes("highest");
      }).length;
      const overdue = issues.filter((i) => {
        const due = i.fields.duedate;
        if (!due) return false;
        return new Date(due).getTime() < Date.now() && i.fields.status.statusCategory.key !== "done";
      }).length;

      const metrics: { label: string; value: number; color: [number, number, number] }[] = [
        { label: "Open", value: open, color: BRAND.primary },
        { label: "Closed", value: done, color: BRAND.success },
        { label: "High priority", value: high, color: BRAND.warning },
        { label: "Overdue", value: overdue, color: BRAND.danger },
      ];

      const metricW = (pageWidth - 80 - 30) / 4;
      metrics.forEach((m, i) => {
        const x = 40 + i * (metricW + 10);
        doc.setFillColor(...BRAND.white);
        doc.setDrawColor(...BRAND.border);
        doc.roundedRect(x, y, metricW, 60, 6, 6, "FD");
        doc.setFillColor(...m.color);
        doc.rect(x, y, 4, 60, "F");

        doc.setTextColor(...BRAND.textMuted);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.text(m.label.toUpperCase(), x + 14, y + 22);

        doc.setTextColor(...BRAND.textDark);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(20);
        doc.text(String(m.value), x + 14, y + 46);
      });

      y += 80;

      // ───── Section: Tickets table ─────
      doc.setTextColor(...BRAND.primaryDark);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text("Tickets", 40, y);
      doc.setDrawColor(...BRAND.primary);
      doc.setLineWidth(2);
      doc.line(40, y + 4, 90, y + 4);
      y += 18;

      const rows = issues.map((i) => [
        i.key,
        i.fields.summary,
        i.fields.status.name,
        i.fields.priority?.name ?? "—",
        i.fields.issuetype.name,
        i.fields.assignee?.displayName ?? "Unassigned",
        fmtDate(i.fields.duedate),
        fmtDate(i.fields.updated),
      ]);

      autoTable(doc, {
        startY: y,
        head: [["Key", "Summary", "Status", "Priority", "Type", "Assignee", "Due", "Updated"]],
        body: rows,
        styles: {
          font: "helvetica",
          fontSize: 8,
          cellPadding: 5,
          textColor: BRAND.textDark,
          lineColor: BRAND.border,
          lineWidth: 0.4,
        },
        headStyles: {
          fillColor: BRAND.primary,
          textColor: BRAND.white,
          fontStyle: "bold",
          fontSize: 8.5,
        },
        alternateRowStyles: { fillColor: BRAND.bgGrey },
        columnStyles: {
          0: { cellWidth: 55, fontStyle: "bold", textColor: BRAND.primaryDark },
          1: { cellWidth: 160 },
          2: { cellWidth: 60 },
          3: { cellWidth: 50 },
          4: { cellWidth: 55 },
          5: { cellWidth: 75 },
          6: { cellWidth: 55 },
          7: { cellWidth: 55 },
        },
        didParseCell: (cellData) => {
          if (cellData.section !== "body") return;
          if (cellData.column.index === 2) {
            cellData.cell.styles.textColor = statusColor(String(cellData.cell.raw));
            cellData.cell.styles.fontStyle = "bold";
          }
          if (cellData.column.index === 3) {
            cellData.cell.styles.textColor = priorityColor(String(cellData.cell.raw));
            cellData.cell.styles.fontStyle = "bold";
          }
        },
        margin: { left: 40, right: 40 },
        didDrawPage: () => {
          // Footer on every page
          const totalPages = (doc as unknown as { internal: { getNumberOfPages: () => number } })
            .internal.getNumberOfPages();
          const current = (doc as unknown as { internal: { getCurrentPageInfo: () => { pageNumber: number } } })
            .internal.getCurrentPageInfo().pageNumber;

          doc.setDrawColor(...BRAND.border);
          doc.setLineWidth(0.5);
          doc.line(40, pageHeight - 40, pageWidth - 40, pageHeight - 40);

          doc.setFont("helvetica", "normal");
          doc.setFontSize(8);
          doc.setTextColor(...BRAND.textMuted);
          doc.text("Jira in Your Pocket · Confidential", 40, pageHeight - 25);
          doc.text(
            `Page ${current} of ${totalPages}`,
            pageWidth - 40,
            pageHeight - 25,
            { align: "right" },
          );
        },
      });

      const safeName = (viewer.displayName ?? "user").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      const today = new Date().toISOString().slice(0, 10);
      doc.save(`ticket-audit_${safeName}_${today}.pdf`);

      toast.success(`Audit exported · ${issues.length} tickets`);
    } catch (e) {
      console.error("Export PDF error", e);
      toast.error(e instanceof Error ? e.message : "Failed to export audit");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-border bg-card hover:bg-accent hover:border-primary/40 transition-all text-xs font-medium disabled:opacity-50"
      title="Export your tickets as a PDF audit report"
    >
      {loading ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Download className="size-3.5 text-primary" />
      )}
      {loading ? "Generating…" : "Export audit (PDF)"}
    </button>
  );
}
