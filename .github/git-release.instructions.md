---
applyTo: '**'
---

# Git Commit En Release Workflow

Gebruik in deze repository standaard het package-script workflowpad:

- Committen: `pnpm commit`
- Releasen en pushen: `pnpm release`

## Doel

Houd commits consistent (Conventional Commits) en laat releases inclusief tags gecontroleerd en reproduceerbaar verlopen.

## Verplichte Volgorde Voor Committen

1. Zorg dat de gewenste bestanden klaarstaan.
2. Voer kwaliteitschecks uit:
   - `pnpm lint`
   - `pnpm build`
   - `pnpm test -- --run`
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

## Releasen En Pushen

Gebruik `pnpm release` voor version bump, changelog, release commit, tag en push.

Verwacht gedrag:

1. Bepaalt nieuwe versie op basis van Conventional Commits.
2. Maakt of update changelog.
3. Maakt release commit en git tag.
4. Voert push uit met tags naar origin.

## Wat Niet Doen

- Niet direct `git commit` gebruiken als `pnpm commit` beschikbaar is.
- Niet handmatig taggen en pushen als `pnpm release` dit al afhandelt.
- Niet releasen met falende lint/build/test checks.

## Foutafhandeling

Als `pnpm commit` of `pnpm release` faalt:

1. Lees de foutmelding volledig.
2. Herstel eerst de onderliggende oorzaak (tests, lint, build, of git state).
3. Start daarna hetzelfde commando opnieuw.
4. Gebruik alleen handmatige git-commando's als noodpad en documenteer waarom.

## Snelle Checklist

- [ ] Werkboom is schoon genoeg voor de bedoelde commit.
- [ ] `pnpm lint` is groen.
- [ ] `pnpm build` is groen.
- [ ] `pnpm test -- --run` is groen.
- [ ] Commit gemaakt met `pnpm commit`.
- [ ] Release en push gedaan met `pnpm release` (indien van toepassing).
