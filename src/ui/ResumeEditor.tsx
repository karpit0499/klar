import { useMemo, useState } from 'react'
import { Button, Card, Field, TextInput } from './atoms'
import type { ResumeData } from '../resume/types'
import { analyzeResume, newResumeId } from '../resume/canonical'
import { useLocale } from '../i18n/LocaleProvider'

const inputClass = 'min-h-tap w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-ink outline-none focus:border-accent'

export function ResumeEditor({ value, onChange, onSave, saveLabel, busy = false }: {
  value: ResumeData
  onChange: (value: ResumeData) => void
  onSave: () => void
  saveLabel?: string
  busy?: boolean
}) {
  const { locale } = useLocale(); const de = locale === 'de'
  const [undo, setUndo] = useState<{ value: ResumeData; label: string } | null>(null)
  const completeness = useMemo(() => analyzeResume(value), [value])
  const completenessSummary = formatCompleteness(completeness, de)
  const change = (mutate: (draft: ResumeData) => void) => {
    const draft = structuredClone(value); mutate(draft); onChange(draft)
  }
  const remove = (label: string, mutate: (draft: ResumeData) => void) => {
    setUndo({ value: structuredClone(value), label }); change(mutate)
  }
  const move = <T,>(items: T[], index: number, direction: -1 | 1): T[] => {
    const target = index + direction
    if (target < 0 || target >= items.length) return items
    const next = [...items]; [next[index], next[target]] = [next[target], next[index]]; return next
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-ink">{de ? 'Geprüfter Lebenslauf' : 'Reviewed résumé'}</h2>
            <p className="mt-1 text-sm text-muted">{completenessSummary}</p>
          </div>
          <span className="rounded-full bg-accent-tint px-3 py-1 font-display text-lg font-semibold text-accent">{completeness.percentage}%</span>
        </div>
        {completeness.issues.length > 0 && (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
            {completeness.issues.map((issue) => <li key={issue.code}>{formatIssue(issue.code, issue.message, de)}{issue.count > 1 ? ` (${issue.count})` : ''}</li>)}
          </ul>
        )}
      </Card>

      {undo && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface p-3 shadow-card" role="status">
          <span className="text-sm text-ink">{de ? 'Entfernt:' : 'Removed:'} {undo.label}</span>
          <Button size="sm" variant="ghost" onClick={() => { onChange(undo.value); setUndo(null) }}>{de ? 'Rückgängig' : 'Undo'}</Button>
        </div>
      )}

      <Section title={de ? 'Kontakt' : 'Contact'}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={de ? 'Name' : 'Name'}><TextInput value={value.contact.name} onChange={(e) => change((d) => { d.contact.name = e.target.value })} /></Field>
          <Field label="Email"><TextInput type="email" value={value.contact.email ?? ''} onChange={(e) => change((d) => { d.contact.email = e.target.value || undefined })} /></Field>
          <Field label={de ? 'Telefon' : 'Phone'}><TextInput value={value.contact.phone ?? ''} onChange={(e) => change((d) => { d.contact.phone = e.target.value || undefined })} /></Field>
          <Field label={de ? 'Ort' : 'Location'}><TextInput value={value.contact.location ?? ''} onChange={(e) => change((d) => { d.contact.location = e.target.value || undefined })} /></Field>
        </div>
        {value.contact.links.map((link, index) => (
          <Row key={link.id} onUp={() => change((d) => { d.contact.links = move(d.contact.links, index, -1) })} onDown={() => change((d) => { d.contact.links = move(d.contact.links, index, 1) })} onDelete={() => remove(link.label || 'link', (d) => { d.contact.links.splice(index, 1) })}>
            <TextInput aria-label={de ? 'Link-Bezeichnung' : 'Link label'} value={link.label} onChange={(e) => change((d) => { d.contact.links[index].label = e.target.value })} placeholder="LinkedIn" />
            <TextInput aria-label="URL" value={link.url} onChange={(e) => change((d) => { d.contact.links[index].url = e.target.value })} placeholder="https://" />
          </Row>
        ))}
        <Add onClick={() => change((d) => { d.contact.links.push({ id: newResumeId('link'), label: '', url: '' }) })}>{de ? 'Link hinzufügen' : 'Add link'}</Add>
      </Section>

      <Section title={de ? 'Kurzprofil' : 'Summary'}>
        <textarea className={`${inputClass} min-h-28`} value={value.summary ?? ''} onChange={(e) => change((d) => { d.summary = e.target.value || undefined })} />
      </Section>

      <Section title={de ? 'Berufserfahrung' : 'Experience'}>
        {value.experience.map((role, roleIndex) => (
          <Item key={role.id} title={role.title || (de ? 'Neue Position' : 'New role')} onUp={() => change((d) => { d.experience = move(d.experience, roleIndex, -1) })} onDown={() => change((d) => { d.experience = move(d.experience, roleIndex, 1) })} onDelete={() => remove(role.title || 'role', (d) => { d.experience.splice(roleIndex, 1) })}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={de ? 'Titel' : 'Title'}><TextInput value={role.title} onChange={(e) => change((d) => { d.experience[roleIndex].title = e.target.value })} /></Field>
              <Field label={de ? 'Unternehmen' : 'Company'}><TextInput value={role.company} onChange={(e) => change((d) => { d.experience[roleIndex].company = e.target.value })} /></Field>
              <Field label={de ? 'Ort' : 'City'}><TextInput value={role.city ?? ''} onChange={(e) => change((d) => { d.experience[roleIndex].city = e.target.value || undefined })} /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label={de ? 'Beginn' : 'Start'} hint="MM/YYYY"><TextInput value={role.start ?? ''} onChange={(e) => change((d) => { d.experience[roleIndex].start = e.target.value || undefined })} /></Field>
                <Field label={de ? 'Ende' : 'End'} hint="MM/YYYY"><TextInput disabled={role.current} value={role.end ?? ''} onChange={(e) => change((d) => { d.experience[roleIndex].end = e.target.value || undefined })} /></Field>
              </div>
            </div>
            <label className="mt-3 flex min-h-tap items-center gap-2 text-sm text-ink"><input type="checkbox" checked={Boolean(role.current)} onChange={(e) => change((d) => { d.experience[roleIndex].current = e.target.checked; if (e.target.checked) d.experience[roleIndex].end = undefined })} />{de ? 'Aktuelle Position' : 'Current role'}</label>
            <div className="mt-3 space-y-2">
              {role.bullets.map((bullet, bulletIndex) => (
                <Row key={bullet.id} onUp={() => change((d) => { d.experience[roleIndex].bullets = move(d.experience[roleIndex].bullets, bulletIndex, -1) })} onDown={() => change((d) => { d.experience[roleIndex].bullets = move(d.experience[roleIndex].bullets, bulletIndex, 1) })} onDelete={() => remove(de ? 'Erfolg' : 'achievement', (d) => { d.experience[roleIndex].bullets.splice(bulletIndex, 1) })}>
                  <textarea className={`${inputClass} min-h-20`} value={bullet.text} onChange={(e) => change((d) => { d.experience[roleIndex].bullets[bulletIndex].text = e.target.value })} />
                </Row>
              ))}
              <Add onClick={() => change((d) => { d.experience[roleIndex].bullets.push({ id: newResumeId('bullet'), text: '', evidenceRefs: [] }) })}>{de ? 'Erfolg hinzufügen' : 'Add achievement'}</Add>
            </div>
          </Item>
        ))}
        <Add onClick={() => change((d) => { d.experience.push({ id: newResumeId('role'), title: '', company: '', bullets: [], evidenceRefs: [] }) })}>{de ? 'Position hinzufügen' : 'Add role'}</Add>
      </Section>

      <Section title={de ? 'Ausbildung' : 'Education'}>
        {value.education.map((entry, index) => (
          <Item key={entry.id} title={entry.degree || entry.institution || (de ? 'Ausbildung' : 'Education')} onUp={() => change((d) => { d.education = move(d.education, index, -1) })} onDown={() => change((d) => { d.education = move(d.education, index, 1) })} onDelete={() => remove(entry.degree || 'education', (d) => { d.education.splice(index, 1) })}>
            <div className="grid gap-3 sm:grid-cols-2">
              {(['degree', 'field', 'institution', 'city', 'start', 'end'] as const).map((key) => <Field key={key} label={key}><TextInput value={entry[key] ?? ''} onChange={(e) => change((d) => { d.education[index][key] = e.target.value || undefined })} /></Field>)}
            </div>
          </Item>
        ))}
        <Add onClick={() => change((d) => { d.education.push({ id: newResumeId('education'), evidenceRefs: [] }) })}>{de ? 'Ausbildung hinzufügen' : 'Add education'}</Add>
      </Section>

      <Section title={de ? 'Kenntnisse' : 'Skills'}>
        {value.skills.map((group, groupIndex) => (
          <Item key={group.id} title={group.group || (de ? 'Kenntnisgruppe' : 'Skill group')} onUp={() => change((d) => { d.skills = move(d.skills, groupIndex, -1) })} onDown={() => change((d) => { d.skills = move(d.skills, groupIndex, 1) })} onDelete={() => remove(group.group || 'skill group', (d) => { d.skills.splice(groupIndex, 1) })}>
            <Field label={de ? 'Gruppe' : 'Group'}><TextInput value={group.group ?? ''} onChange={(e) => change((d) => { d.skills[groupIndex].group = e.target.value || undefined })} /></Field>
            {group.items.map((skill, skillIndex) => <Row key={skill.id} onUp={() => change((d) => { d.skills[groupIndex].items = move(d.skills[groupIndex].items, skillIndex, -1) })} onDown={() => change((d) => { d.skills[groupIndex].items = move(d.skills[groupIndex].items, skillIndex, 1) })} onDelete={() => remove(skill.name || 'skill', (d) => { d.skills[groupIndex].items.splice(skillIndex, 1) })}><TextInput value={skill.name} onChange={(e) => change((d) => { d.skills[groupIndex].items[skillIndex].name = e.target.value })} /></Row>)}
            <Add onClick={() => change((d) => { d.skills[groupIndex].items.push({ id: newResumeId('skill'), name: '', evidenceRefs: [] }) })}>{de ? 'Kenntnis hinzufügen' : 'Add skill'}</Add>
          </Item>
        ))}
        <Add onClick={() => change((d) => { d.skills.push({ id: newResumeId('skills'), group: '', items: [] }) })}>{de ? 'Gruppe hinzufügen' : 'Add group'}</Add>
      </Section>

      <Section title={de ? 'Projekte' : 'Projects'}>
        {value.projects.map((project, index) => (
          <Item key={project.id} title={project.name || (de ? 'Projekt' : 'Project')} onUp={() => change((d) => { d.projects = move(d.projects, index, -1) })} onDown={() => change((d) => { d.projects = move(d.projects, index, 1) })} onDelete={() => remove(project.name || 'project', (d) => { d.projects.splice(index, 1) })}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={de ? 'Name' : 'Name'}><TextInput value={project.name} onChange={(e) => change((d) => { d.projects[index].name = e.target.value })} /></Field>
              <Field label="URL"><TextInput value={project.link ?? ''} onChange={(e) => change((d) => { d.projects[index].link = e.target.value || undefined })} /></Field>
              <Field label={de ? 'Technologien (Komma)' : 'Technologies (comma-separated)'}><TextInput value={(project.tech ?? []).join(', ')} onChange={(e) => change((d) => { d.projects[index].tech = e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} /></Field>
            </div>
            <textarea className={`${inputClass} mt-3 min-h-24`} value={project.summary ?? ''} onChange={(e) => change((d) => { d.projects[index].summary = e.target.value || undefined })} />
          </Item>
        ))}
        <Add onClick={() => change((d) => { d.projects.push({ id: newResumeId('project'), name: '', evidenceRefs: [] }) })}>{de ? 'Projekt hinzufügen' : 'Add project'}</Add>
      </Section>

      <Section title={de ? 'Zertifikate' : 'Certifications'}>
        {value.certifications.map((cert, index) => <Row key={cert.id} onUp={() => change((d) => { d.certifications = move(d.certifications, index, -1) })} onDown={() => change((d) => { d.certifications = move(d.certifications, index, 1) })} onDelete={() => remove(cert.name || 'certification', (d) => { d.certifications.splice(index, 1) })}><TextInput value={cert.name} onChange={(e) => change((d) => { d.certifications[index].name = e.target.value })} placeholder={de ? 'Zertifikat' : 'Certification'} /><TextInput value={cert.issuer ?? ''} onChange={(e) => change((d) => { d.certifications[index].issuer = e.target.value || undefined })} placeholder={de ? 'Aussteller' : 'Issuer'} /></Row>)}
        <Add onClick={() => change((d) => { d.certifications.push({ id: newResumeId('certification'), name: '', evidenceRefs: [] }) })}>{de ? 'Zertifikat hinzufügen' : 'Add certification'}</Add>
      </Section>

      <Section title={de ? 'Sprachen' : 'Languages'}>
        {value.languages.map((language, index) => <Row key={language.id} onUp={() => change((d) => { d.languages = move(d.languages, index, -1) })} onDown={() => change((d) => { d.languages = move(d.languages, index, 1) })} onDelete={() => remove(language.lang || 'language', (d) => { d.languages.splice(index, 1) })}><TextInput value={language.lang} onChange={(e) => change((d) => { d.languages[index].lang = e.target.value })} placeholder={de ? 'Sprache' : 'Language'} /><TextInput value={language.level ?? ''} onChange={(e) => change((d) => { d.languages[index].level = e.target.value || undefined })} placeholder="B2" /></Row>)}
        <Add onClick={() => change((d) => { d.languages.push({ id: newResumeId('language'), lang: '', evidenceRefs: [] }) })}>{de ? 'Sprache hinzufügen' : 'Add language'}</Add>
      </Section>

      <div className="sticky bottom-3 flex justify-end rounded-md border border-border bg-surface/95 p-3 shadow-card">
        <Button onClick={onSave} disabled={busy}>{saveLabel ?? (de ? 'Prüfen und speichern' : 'Review and save')}</Button>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <Card className="p-4 sm:p-5"><h3 className="text-lg font-semibold text-ink">{title}</h3><div className="mt-4 space-y-3">{children}</div></Card>
}
function Item({ title, children, onUp, onDown, onDelete }: { title: string; children: React.ReactNode; onUp: () => void; onDown: () => void; onDelete: () => void }) {
  return <div className="rounded-md border border-border p-3"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><strong className="wrap-anywhere text-sm text-ink">{title}</strong><Controls onUp={onUp} onDown={onDown} onDelete={onDelete} /></div>{children}</div>
}
function Row({ children, onUp, onDown, onDelete }: { children: React.ReactNode; onUp: () => void; onDown: () => void; onDelete: () => void }) {
  return <div className="grid gap-2 rounded-md border border-border p-2 sm:grid-cols-[1fr_1fr_auto]"><>{children}</><Controls onUp={onUp} onDown={onDown} onDelete={onDelete} /></div>
}
function Controls({ onUp, onDown, onDelete }: { onUp: () => void; onDown: () => void; onDelete: () => void }) {
  return <div className="flex items-center gap-1"><button type="button" className="min-h-tap min-w-tap rounded border border-border" onClick={onUp} aria-label="Move up">↑</button><button type="button" className="min-h-tap min-w-tap rounded border border-border" onClick={onDown} aria-label="Move down">↓</button><button type="button" className="min-h-tap rounded border border-danger px-2 text-danger" onClick={onDelete} aria-label="Delete">×</button></div>
}
function Add({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <Button type="button" size="sm" variant="ghost" onClick={onClick}>+ {children}</Button>
}

function formatCompleteness(report: ReturnType<typeof analyzeResume>, de: boolean): string {
  if (!de) return report.summary
  const roles = report.roleCount === 1 ? 'Position' : 'Positionen'
  const dates = report.missingDateCount === 1 ? 'fehlender Zeitraum' : 'fehlende Zeiträume'
  const achievements = report.rolesWithoutAchievements === 1 ? 'Position ohne Erfolge' : 'Positionen ohne Erfolge'
  return `${report.percentage}% vollständig · ${report.roleCount} ${roles} · ${report.missingDateCount} ${dates} · ${report.rolesWithoutAchievements} ${achievements}`
}

function formatIssue(code: string, fallback: string, de: boolean): string {
  if (!de) return fallback
  const messages: Record<string, string> = {
    'contact-name': 'Namen ergänzen.',
    'contact-route': 'E-Mail-Adresse oder Telefonnummer ergänzen.',
    summary: 'Kurzes berufliches Profil ergänzen.',
    'role-dates': 'Fehlende Beschäftigungszeiträume ergänzen.',
    'role-achievements': 'Jeder Position mindestens einen belegbaren Erfolg hinzufügen.',
    'role-basics': 'Für jede Position Titel und Unternehmen ergänzen.',
    skills: 'Mindestens eine Kenntnis hinzufügen.',
  }
  return messages[code] ?? fallback
}