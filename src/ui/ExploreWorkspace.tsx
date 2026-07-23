import { Button, Card } from './atoms'
import { sampleResume, analyzeResume, deriveProfile } from '../resume/canonical'
import { useLocale } from '../i18n/LocaleProvider'

export function ExploreWorkspace({ onStart, onRestore, onLeave }: { onStart: () => void; onRestore: () => void; onLeave: () => void }) {
  const { locale } = useLocale(); const de = locale === 'de'
  const resume = sampleResume(); const profile = deriveProfile(resume); const completeness = analyzeResume(resume)
  const summary = de
    ? 'Product-Operations-Spezialistin, die Kundenfeedback, Delivery-Teams und messbare Prozessverbesserungen verbindet.'
    : resume.summary
  const sampleBullets = de
    ? ['Einen Kundenfeedback-Prozess aufgebaut, den vier Produktteams nutzen.', 'Die Vorbereitung des Wochenberichts von zwei Stunden auf 30 Minuten verkürzt.']
    : resume.experience[0]?.bullets.map((bullet) => bullet.text) ?? []
  return <div className="min-h-[100dvh] bg-bg p-4 sm:p-8"><div className="mx-auto max-w-5xl"><div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent bg-accent-tint p-3"><p className="font-medium text-accent">{de ? 'Temporärer Beispiel-Arbeitsbereich · nichts wird gespeichert' : 'Temporary sample workspace · nothing is saved'}</p><div className="flex flex-wrap gap-2"><Button size="sm" onClick={onStart}>{de ? 'Mit eigenen Daten starten' : 'Start with my data'}</Button><Button size="sm" variant="ghost" onClick={onRestore}>{de ? 'Sicherung laden' : 'Restore backup'}</Button><Button size="sm" variant="ghost" onClick={onLeave}>{de ? 'Verlassen' : 'Leave demo'}</Button></div></div><div className="mt-5 grid gap-4 md:grid-cols-3"><Card className="p-5 md:col-span-2"><h1 className="text-2xl font-semibold text-ink">{resume.contact.name}</h1><p className="mt-1 text-muted">{summary}</p><h2 className="mt-5 font-semibold text-ink">{de ? 'Beispiel-Erfahrung' : 'Sample experience'}</h2>{resume.experience.map((role) => <div key={role.id} className="mt-3"><strong className="text-ink">{role.title} · {role.company}</strong><ul className="mt-1 list-disc pl-5 text-sm text-muted">{sampleBullets.map((bullet, index) => <li key={`${role.id}-${index}`}>{bullet}</li>)}</ul></div>)}</Card><div className="space-y-4"><Card className="p-5"><p className="text-sm text-muted">{de ? 'Strukturelle Vollständigkeit' : 'Structural completeness'}</p><p className="mt-1 font-display text-4xl font-semibold text-accent">{completeness.percentage}%</p><p className="mt-2 text-sm text-faint">{formatCompleteness(completeness, de)}</p></Card><Card className="p-5"><p className="text-sm text-muted">{de ? 'Abgeleitet für Matching' : 'Derived for matching'}</p><p className="mt-2 text-ink">{profile.skills.length} {de ? 'Kenntnisse' : 'skills'} · {profile.titles.length} {de ? 'Titel' : 'titles'}</p><p className="mt-2 text-xs text-faint">{de ? 'Dieses dünne Profil ist nicht separat bearbeitbar.' : 'This thin profile is not separately editable.'}</p></Card></div></div></div></div>
}

function formatCompleteness(report: ReturnType<typeof analyzeResume>, de: boolean): string {
  if (!de) return report.summary
  const roles = report.roleCount === 1 ? 'Position' : 'Positionen'
  const dates = report.missingDateCount === 1 ? 'fehlender Zeitraum' : 'fehlende Zeiträume'
  const achievements = report.rolesWithoutAchievements === 1 ? 'Position ohne Erfolge' : 'Positionen ohne Erfolge'
  return `${report.percentage}% vollständig · ${report.roleCount} ${roles} · ${report.missingDateCount} ${dates} · ${report.rolesWithoutAchievements} ${achievements}`
}