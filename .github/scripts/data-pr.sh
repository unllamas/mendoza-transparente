#!/usr/bin/env bash
# Pushes the current commit to the data branch ($DATA_BRANCH) and makes sure there is one open PR to dev.
# Used by .github/workflows/actualizar-datos.yml. Documented in docs/procesos/actualizacion-de-datos.md.
#
# Usage: data-pr.sh "<PR title>" [<Markdown body file>]
#   - No open PR: the branch is reset to this commit (it starts from dev) and a PR to dev is opened.
#   - Open PR: the commit is added on top and the body is posted as a comment. If both titles are
#     «actualización automática (<fuentes>)», the PR title gets the union of the sources.
# ALERTAS=true adds the datos-con-borrados label.
set -euo pipefail

TITLE="$1"
BODY="${2:-}"
BRANCH="${DATA_BRANCH:?}"
AUTO='^chore\(data\): actualización automática \((.*)\)$'

open=$(gh pr list --head "$BRANCH" --base dev --state open --json number -q '.[0].number')
if [ -n "$open" ]; then
  # Push with the deploy key: the synchronize event runs CI and the title check on the new commit.
  git push origin "HEAD:$BRANCH"
  current=$(gh pr view "$open" --json title -q .title)
  old_sources="" new_sources=""
  if [[ "$current" =~ $AUTO ]]; then old_sources="${BASH_REMATCH[1]}"; fi
  if [[ "$TITLE" =~ $AUTO ]]; then new_sources="${BASH_REMATCH[1]}"; fi
  if [ -n "$old_sources" ] && [ -n "$new_sources" ]; then
    sources=$(printf '%s,%s' "$old_sources" "$new_sources" | tr ',' '\n' | sed 's/^ *//' | sort -u | paste -sd ',' - | sed 's/,/, /g')
    gh pr edit "$open" --title "chore(data): actualización automática ($sources)"
  fi
  if [ -n "$BODY" ]; then gh pr comment "$open" --body-file "$BODY"; fi
else
  git push --force origin "HEAD:$BRANCH"
  gh pr create --base dev --head "$BRANCH" --title "$TITLE" --body-file "${BODY:-/dev/null}"
  # A PR opened with the workflow token does not trigger other workflows, so the checks that dev
  # requires (verificar and titulo) are dispatched by hand on the branch.
  gh workflow run ci.yml --ref "$BRANCH"
  gh workflow run titulo-del-pr.yml --ref "$BRANCH" -f titulo="$TITLE"
fi

if [ "${ALERTAS:-false}" = true ]; then
  gh label create datos-con-borrados --color D93F0B --description "El PR de datos borra filas o archivos: revisar antes de mergear" --force
  gh pr edit "$BRANCH" --add-label datos-con-borrados
fi
