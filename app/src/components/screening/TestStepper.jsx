import { Check } from "lucide-react";
import { SCREENING_TESTS } from "../../services/transports/screeningSchema";

export default function TestStepper({
  activeStepIndex,
  completedTests,
  disabled = false,
  onSelectStep,
}) {
  const steps = [
    ...SCREENING_TESTS.map((test, idx) => ({
      id: test.id,
      index: idx,
      label: `${test.order}. ${test.shortName}`,
      completed: Boolean(completedTests[test.id]?.completed),
    })),
    {
      id: "summary",
      index: SCREENING_TESTS.length,
      label: "4. Summary & Save",
      completed: false,
    },
  ];

  return (
    <nav
      aria-label="Screening protocol steps"
      className="bg-surface border border-border rounded-sm overflow-x-auto"
    >
      <ol className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border min-w-max sm:min-w-0">
        {steps.map((step) => {
          const isCurrent = activeStepIndex === step.index;
          return (
            <li key={step.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelectStep(step.index)}
                aria-current={isCurrent ? "step" : undefined}
                className={`w-full px-3.5 py-2.5 text-left flex items-center justify-between gap-2 text-sm transition-colors ${
                  isCurrent
                    ? "bg-surface-muted text-foreground font-semibold border-b-2 border-b-accent"
                    : "bg-surface text-secondary hover:bg-surface-muted hover:text-foreground border-b-2 border-b-transparent"
                }`}
              >
                <span className="truncate">{step.label}</span>
                {step.completed && (
                  <span
                    className="inline-flex items-center justify-center w-4 h-4 rounded-[3px] bg-success-bg text-success-text border border-success-border shrink-0"
                    title="Test completed"
                  >
                    <Check size={12} strokeWidth={2.25} aria-hidden="true" />
                    <span className="visually-hidden">Completed</span>
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
