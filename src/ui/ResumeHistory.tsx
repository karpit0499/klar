import { useEffect, useState } from 'react'
import { Button } from './atoms'
import type { ResumeSnapshotRow } from '../resume/types'
import { createManualSnapshot, deleteSnapshot, loadResumeHistory, renameSnapshot, restoreSnapshot } from '../resume/store'
import { useLocale } from '../i18n/LocaleProvider'

export function ResumeHistory({ onRestored }: { onRestored: () => void }) {
  const { locale } = useLocale(); const de = locale === 'de'
  const [rows, setRows] = useState<ResumeSnapshotRow[]>([])
  const refresh = () => void loadResumeHistory().then(setRows)
  useEffect(refresh, [])
  async function save() { const name = prompt(de ? 'Name für diese Version' : 'Name this version'); if (name != null) { await createManualSnapshot(name); refresh() } }
  async function rename(row: ResumeSnapshotRow) { const name = prompt(de ? 'Neuer Name' : 'New name', row.name ?? ''); if (name != null) { await renameSnapshot(row.id, name); refresh() } }
  async function restore(row: ResumeSnapshotRow) { if (!confirm(de ? 'Diese Version als aktuelles Profil wiederherstellen?' : 'Restore this version as the current profile?')) return; await restoreSnapshot(row.id); onRestored(); refresh() }
  async function remove(row: ResumeSnapshotRow) { if (!confirm(de ? 'Diese gespeicherte Version löschen?' : 'Delete this saved version?')) return; await deleteSnapshot(row.id); refresh() }
  return <div><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted">{de ? 'Automatische Versionen: höchstens 10 und 90 Tage. Benannte Versionen bleiben bis zum Löschen.' : 'Automatic versions: up to 10 and 90 days. Named versions remain until deleted.'}</p><Button size="sm" variant="ghost" onClick={() => void save()}>{de ? 'Aktuelle Version benennen' : 'Name current snapshot'}</Button></div><div className="mt-3 space-y-2">{rows.length === 0 && <p className="text-sm text-faint">{de ? 'Noch keine frühere Version.' : 'No earlier version yet.'}</p>}{rows.map((row) => <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3"><div><p className="font-medium text-ink">{row.name ?? (row.reason === 'reupload' ? (de ? 'Vor erneutem Upload' : 'Before re-upload') : (de ? 'Automatische Version' : 'Automatic version'))}</p><p className="text-xs text-faint">{new Date(row.createdAt).toLocaleString()} · {row.data.contact.name || '—'}</p></div><div className="flex flex-wrap gap-1"><Button size="sm" variant="ghost" onClick={() => void restore(row)}>{de ? 'Wiederherstellen' : 'Restore'}</Button><Button size="sm" variant="ghost" onClick={() => void rename(row)}>{de ? 'Benennen' : 'Name'}</Button><Button size="sm" variant="ghost" onClick={() => void remove(row)}>{de ? 'Löschen' : 'Delete'}</Button></div></div>)}</div></div>
}