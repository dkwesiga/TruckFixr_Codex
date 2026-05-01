import { CheckCircle2, Circle } from "lucide-react";
import type { TruckFixrPasswordValidationResult } from "../../../shared/passwordPolicy";

type PasswordChecklistProps = {
  validation: TruckFixrPasswordValidationResult;
};

const checklistItems: Array<{
  key: keyof TruckFixrPasswordValidationResult["checks"];
  label: string;
}> = [
  { key: "minLength", label: "At least 8 characters" },
  { key: "uppercase", label: "One uppercase letter" },
  { key: "lowercase", label: "One lowercase letter" },
  { key: "number", label: "One number" },
  { key: "special", label: "One special character" },
  { key: "passwordsMatch", label: "Passwords match" },
];

export default function PasswordChecklist({ validation }: PasswordChecklistProps) {
  return (
    <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3" aria-live="polite">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        Password requirements
      </p>
      <div className="space-y-1.5">
        {checklistItems.map((item) => {
          const complete = validation.checks[item.key];
          return (
            <div
              key={item.key}
              className={`flex items-center gap-2 text-xs ${
                complete ? "text-emerald-700" : "text-slate-500"
              }`}
            >
              {complete ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
              <span>{item.label}</span>
            </div>
          );
        })}
      </div>
      {(!validation.checks.notCommon || !validation.checks.notProfileDerived) && (
        <p className="mt-2 text-xs font-medium text-amber-700">
          Avoid names, email, company name, TruckFixr, Mr Diesel, and common passwords.
        </p>
      )}
    </div>
  );
}
