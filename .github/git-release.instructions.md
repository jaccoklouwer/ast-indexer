---
applyTo: '**'
---

# Git Commit En Release Workflow

Gebruik in deze repository standaard het package-script workflowpad:

- Committen: `pnpm commit`
- Release voorbereiden: `pnpm release`
- Git tags en commits pushen: `pnpm push`
- Geautomatiseerd publishen: GitHub Actions `publish.yml`
- Handmatig noodpad: `pnpm run publish:npm`

## Doel

Houd commits consistent (Conventional Commits) en laat releases inclusief tags gecontroleerd en reproduceerbaar verlopen.

## Verplichte Volgorde Voor Committen

1. Zorg dat de gewenste bestanden klaarstaan.
2. Voer kwaliteitschecks uit:
   - `pnpm lint`
   - `pnpm build`
   - `pnpm test`
3. Los fouten en waarschuwingen op.
4. Start commit flow met `pnpm commit`.

## Commit Bericht Standaard

Gebruik Conventional Commits:

- `feat(scope): beschrijving`
- `fix(scope): beschrijving`
- `docs(scope): beschrijving`
- `refactor(scope): beschrijving`
- `test(scope): beschrijving`
- `chore(scope): beschrijving`

Regels:

- Gebruik imperatieve tegenwoordige tijd.
- Begin met kleine letter.
- Maximaal 72 tekens in de subjectregel.
- Sluit de subjectregel af zonder punt.
- Voeg bij breaking changes `!` toe en een `BREAKING CHANGE:` footer.

## Releasen En Publiceren

Gebruik voor een npm release deze volgorde:

1. `pnpm run publish:check`
2. `pnpm release`
3. `pnpm push`
4. Keur de `npm-publish` environment goed in GitHub Actions

Verwacht gedrag per stap:

1. `pnpm run publish:check` valideert lint, build, tests en pack-output.
2. `pnpm release` bepaalt nieuwe versie op basis van Conventional Commits en maakt changelog, release commit en git tag lokaal.
3. `pnpm push` pusht release commit en tags naar origin en triggert de publish-workflow op de nieuwe `v*` tag.
4. GitHub Actions publiceert naar npm via Trusted Publishing nadat de environment is goedgekeurd.

Voor de CI/CD publishflow moet je eenmalig inrichten:

- npm Trusted Publishing voor `@klouwer94/ast-indexer`
- GitHub Environment `npm-publish` met reviewers

## Wat Niet Doen

- Niet direct `git commit` gebruiken als `pnpm commit` beschikbaar is.
- Niet `pnpm push` overslaan na `pnpm release`; zonder push start de publish-workflow niet.
- Niet een `v*` tag vanaf een zijbranch pushen; alleen tags op `main` mogen publishen.
- Niet releasen of publishen met falende lint/build/test checks.

## Foutafhandeling

Als `pnpm commit`, `pnpm release`, `pnpm run publish:npm` of `pnpm push` faalt:

1. Lees de foutmelding volledig.
2. Herstel eerst de onderliggende oorzaak (tests, lint, build, of git state).
3. Start daarna hetzelfde commando opnieuw.
4. Gebruik alleen handmatige git-commando's als noodpad en documenteer waarom.

## Snelle Checklist

- [ ] Werkboom is schoon genoeg voor de bedoelde commit.
- [ ] `pnpm lint` is groen.
- [ ] `pnpm build` is groen.
- [ ] `pnpm test` is groen.
- [ ] `pnpm run publish:check` is groen.
- [ ] Commit gemaakt met `pnpm commit`.
- [ ] Release voorbereid met `pnpm release`.
- [ ] Git push gedaan met `pnpm push`.
- [ ] `publish.yml` gestart op de release-tag.
- [ ] `npm-publish` environment goedgekeurd.
- [ ] npm publish geslaagd via GitHub Actions, of handmatig noodpad gebruikt.
