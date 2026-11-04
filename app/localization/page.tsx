/**
 * Render the /localization route with `Languages`, `GitBranch`, `CheckCircle2`, `BookOpen`.
 * refs: none
 */
"use client";
import { BookOpen, CheckCircle2, GitBranch, Languages } from "lucide-react";
import { useLocalization } from "@/lib/localization-context";

const REPOSITORY_URL = "https://github.com/NabiCook/PaladinsCat-locales";
const WEBLATE_URL = "https://translate.paladinscat.com";

/**
 * Render the /localization route with `Languages`, `GitBranch`, `CheckCircle2`, `BookOpen`.
 * refs: none
 * I/O types: `none -> JSX.Element`.
 */
export default function LocalizationPage() {
  const { t } = useLocalization();
  const steps = [
    t("localization.workflowStepClone"),
    t("localization.workflowStepTolgee"),
    t("localization.workflowStepPr"),
  ];

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <header className="pc-card overflow-hidden">
        <div className="flex items-start gap-4">
          <div className="rounded-xl border border-pc-border bg-pc-bg p-3 text-pc-accent">
            <Languages className="h-6 w-6" />
          </div>
          <div>
            <h1 className="pc-heading pc-heading-lg">{t("localization.githubTitle")}</h1>
            <p className="mt-2 text-sm leading-6 text-pc-text-secondary">{t("localization.githubDescription")}</p>
          </div>
        </div>
      </header>

      <div className="pc-card">
        <div className="flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-pc-accent" />
          <h2 className="text-base font-bold">{t("localization.workflowTitle")}</h2>
        </div>
        <ol className="mt-4 space-y-3">
          {steps.map((step, index) => (
            <li key={step} className="flex gap-3 rounded-lg border border-pc-border/70 bg-pc-bg/35 p-3 text-sm text-pc-text-secondary">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-pc-accent/15 text-xs font-bold text-pc-accent">{index + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <p className="mt-4 flex items-start gap-2 text-xs text-pc-text-muted">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          {t("localization.deploymentDescription")}
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <a href={WEBLATE_URL} target="_blank" rel="noreferrer" className="pc-btn-primary inline-flex items-center gap-2">
          <Languages className="h-4 w-4" />{t("localization.openWeblate")}
        </a>
        <a href={REPOSITORY_URL} target="_blank" rel="noreferrer" className="pc-btn-secondary inline-flex items-center gap-2">
          <GitBranch className="h-4 w-4" />{t("localization.repository")}
        </a>
        <a href={`${REPOSITORY_URL}/blob/main/CONTRIBUTING.md`} target="_blank" rel="noreferrer" className="pc-btn-secondary inline-flex items-center gap-2">
          <BookOpen className="h-4 w-4" />{t("localization.contributingGuide")}
        </a>
        <a href={`${REPOSITORY_URL}/blob/main/docs/WEBLATE_GITHUB_WORKFLOW.md`} target="_blank" rel="noreferrer" className="pc-btn-secondary inline-flex items-center gap-2">
          <Languages className="h-4 w-4" />{t("localization.tolgeeGuide")}
        </a>
      </div>
    </section>
  );
}
