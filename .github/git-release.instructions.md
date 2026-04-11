---
applyTo: '**'
---

# Git Commit En Release Workflow

Gebruik in deze repository standaard het package-script workflowpad:

- Committen: `pnpm commit`
- Release voorbereiden: `pnpm release`
- Naar npm publiceren: `pnpm run publish:npm`
- Git tags en commits pushen: `pnpm push`

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
3. `pnpm run publish:npm`
4. `pnpm push`

Verwacht gedrag per stap:

1. `pnpm run publish:check` valideert lint, build, tests en pack-output.
2. `pnpm release` bepaalt nieuwe versie op basis van Conventional Commits en maakt changelog, release commit en git tag lokaal.
3. `pnpm run publish:npm` publiceert de huidige versie naar npm.
4. `pnpm push` pusht release commit en tags naar origin.

Voor de eerste npm publish op een machine moet je ingelogd zijn op npmjs:

- `npm adduser --registry https://registry.npmjs.org/`

## Wat Niet Doen

- Niet direct `git commit` gebruiken als `pnpm commit` beschikbaar is.
- Niet `pnpm run publish:npm` draaien zonder eerst `pnpm run publish:check` te draaien.
- Niet `pnpm push` overslaan na een succesvolle npm publish.
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
- [ ] npm publish gedaan met `pnpm run publish:npm`.
- [ ] Git push gedaan met `pnpm push`.
