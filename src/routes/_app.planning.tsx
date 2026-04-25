import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  CalendarClock,
  Plus,
  Play,
  Power,
  PowerOff,
  Trash2,
  Wrench,
  Repeat,
  X,
} from "lucide-react";
import {
  createPreventivePlan,
  deletePreventivePlan,
  listPreventivePlans,
  runPreventivePlansNow,
  togglePreventivePlan,
  type PreventivePlan,
} from "@/server/preventive.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/planning")({
  loader: () => listPreventivePlans(),
  component: PlanningPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">Error: {error.message}</div>
  ),
});

function PlanningPage() {
  const initial = Route.useLoaderData();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const runNow = useServerFn(runPreventivePlansNow);
  const del = useServerFn(deletePreventivePlan);
  const toggle = useServerFn(togglePreventivePlan);

  if (initial.error) {
    return (
      <div className="p-6 text-sm text-destructive">
        {initial.error}
      </div>
    );
  }

  const plans = initial.plans;

  async function handleRunNow() {
    setRunning(true);
    try {
      const r = await runNow();
      if (r.error) toast.error(r.error);
      else
        toast.success(
          `Scanned ${r.scanned} plan(s) • Created ${r.created.length} ticket(s)${
            r.failed.length ? ` • ${r.failed.length} failed` : ""
          }`,
        );
      await router.invalidate();
    } finally {
      setRunning(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this plan?")) return;
    const r = await del({ data: { id } });
    if (r.error) toast.error(r.error);
    else {
      toast.success("Plan deleted");
      await router.invalidate();
    }
  }

  async function handleToggle(p: PreventivePlan) {
    const r = await toggle({ data: { id: p.id, active: !p.active } });
    if (r.error) toast.error(r.error);
    else await router.invalidate();
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold flex items-center gap-2">
            <CalendarClock className="size-5 text-primary" />
            Preventive planning
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Schedule systematic preventive actions. Tickets are auto-created in Jira every day at
            08:00 UTC when due.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRunNow} disabled={running}>
            <Play className="size-4 mr-1.5" />
            {running ? "Running…" : "Run now"}
          </Button>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="size-4 mr-1.5" /> New plan
          </Button>
        </div>
      </div>

      {plans.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No preventive plans yet. Click <strong>New plan</strong> to create one.
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {plans.map((p) => (
            <PlanCard key={p.id} plan={p} onDelete={handleDelete} onToggle={handleToggle} />
          ))}
        </div>
      )}

      {open && (
        <NewPlanDialog
          onClose={() => setOpen(false)}
          onCreated={async () => {
            setOpen(false);
            await router.invalidate();
          }}
        />
      )}
    </div>
  );
}

function PlanCard({
  plan,
  onDelete,
  onToggle,
}: {
  plan: PreventivePlan;
  onDelete: (id: string) => void;
  onToggle: (p: PreventivePlan) => void;
}) {
  const next = new Date(plan.next_run_at);
  const last = plan.last_run_at ? new Date(plan.last_run_at) : null;
  const overdue = plan.active && next.getTime() < Date.now();
  const periodLabel = formatPeriod(plan);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium text-sm flex items-center gap-2">
            <Wrench className="size-3.5 text-primary shrink-0" />
            <span className="truncate">{plan.title}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-[10px]">
              {plan.machine_id}
            </Badge>
            {periodLabel ? (
              <span className="inline-flex items-center gap-1">
                <Repeat className="size-3" /> {periodLabel}
              </span>
            ) : (
              <span className="text-amber-500">One-shot</span>
            )}
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={() => onToggle(plan)}
            title={plan.active ? "Pause" : "Resume"}
          >
            {plan.active ? (
              <Power className="size-3.5 text-success" />
            ) : (
              <PowerOff className="size-3.5 text-muted-foreground" />
            )}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={() => onDelete(plan.id)}
          >
            <Trash2 className="size-3.5 text-destructive" />
          </Button>
        </div>
      </div>

      {plan.description && (
        <p className="text-xs text-muted-foreground line-clamp-2">{plan.description}</p>
      )}

      <div className="grid grid-cols-3 gap-2 text-xs pt-2 border-t border-border">
        <Stat
          label="Next run"
          value={next.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
          tone={overdue ? "danger" : "default"}
        />
        <Stat
          label="Last run"
          value={last ? last.toLocaleDateString() : "—"}
        />
        <Stat label="Created" value={`${plan.occurrences_count}×`} tone="primary" />
      </div>
    </Card>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "danger" | "primary";
}) {
  const color =
    tone === "danger"
      ? "text-destructive"
      : tone === "primary"
        ? "text-primary"
        : "text-foreground";
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`text-xs font-medium ${color}`}>{value}</span>
    </div>
  );
}

function formatPeriod(p: PreventivePlan): string {
  const parts: string[] = [];
  if (p.period_years) parts.push(`${p.period_years}y`);
  if (p.period_months) parts.push(`${p.period_months}mo`);
  if (p.period_weeks) parts.push(`${p.period_weeks}w`);
  if (p.period_days) parts.push(`${p.period_days}d`);
  return parts.length ? `Every ${parts.join(" ")}` : "";
}

// ─── New plan dialog ───────────────────────────────────────────────────────

function NewPlanDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const create = useServerFn(createPreventivePlan);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    machineId: "M01",
    startAt: defaultStart(),
    periodDays: 0,
    periodWeeks: 0,
    periodMonths: 1,
    periodYears: 0,
  });

  function update<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const r = await create({
        data: {
          title: form.title.trim(),
          description: form.description.trim() || null,
          machineId: form.machineId.trim().toUpperCase(),
          startAt: new Date(form.startAt).toISOString(),
          periodDays: Number(form.periodDays),
          periodWeeks: Number(form.periodWeeks),
          periodMonths: Number(form.periodMonths),
          periodYears: Number(form.periodYears),
          assigneeAccountId: null,
        },
      });
      if (r.error) {
        toast.error(r.error);
      } else {
        toast.success("Plan created");
        onCreated();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <Card
        className="w-full max-w-lg p-5 space-y-4 my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">New preventive plan</h2>
          <Button size="icon" variant="ghost" className="size-7" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Title">
            <Input
              required
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="Lubrication of conveyor bearings"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Machine">
              <Input
                required
                value={form.machineId}
                onChange={(e) => update("machineId", e.target.value.toUpperCase())}
                placeholder="M01"
                maxLength={4}
              />
            </Field>
            <Field label="Start at">
              <Input
                required
                type="datetime-local"
                value={form.startAt}
                onChange={(e) => update("startAt", e.target.value)}
              />
            </Field>
          </div>

          <Field label="Description">
            <Textarea
              rows={3}
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder="Steps, tools required, safety notes…"
            />
          </Field>

          <div>
            <Label className="text-xs">Recurrence (set all to 0 for a one-shot action)</Label>
            <div className="grid grid-cols-4 gap-2 mt-1.5">
              <NumField
                label="Days"
                max={7}
                value={form.periodDays}
                onChange={(v) => update("periodDays", v)}
              />
              <NumField
                label="Weeks"
                max={4}
                value={form.periodWeeks}
                onChange={(v) => update("periodWeeks", v)}
              />
              <NumField
                label="Months"
                max={12}
                value={form.periodMonths}
                onChange={(v) => update("periodMonths", v)}
              />
              <NumField
                label="Years"
                max={10}
                value={form.periodYears}
                onChange={(v) => update("periodYears", v)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create plan"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function NumField({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] text-muted-foreground">{label} (0-{max})</Label>
      <Input
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.max(0, Math.min(max, Number(e.target.value) || 0)))}
      />
    </div>
  );
}

function defaultStart() {
  // Default to tomorrow at 08:00 local time, formatted for datetime-local input.
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(8, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
