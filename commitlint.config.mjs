// Conventional Commits (docs/procesos/ramas-y-releases.md#mensajes-de-commit-y-títulos-de-pr).
// Checked by the lefthook commit-msg hook and, for PR titles, by CI.
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Scopes follow the repo folders; omit the scope for repo-wide changes.
    "scope-enum": [
      2,
      "always",
      ["web", "panel", "ui", "core", "scrapers", "participation", "data", "docs", "scripts", "ci", "skills", "release"],
    ],
    // Descriptions often start with a proper noun (a municipality, an agency), so case is a written rule, not a check.
    "subject-case": [0],
    // Bodies are free-form prose in Spanish.
    "body-max-line-length": [0],
    "footer-max-line-length": [0],
  },
};
