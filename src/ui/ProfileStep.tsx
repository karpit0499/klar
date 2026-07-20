// Show the parsed profile so the user can sanity-check before continuing.
import { Button, Card, Badge } from './atoms'
import type { Profile } from '../types'

export function ProfileStep({
  profile,
  onConfirm,
  onRedo,
}: {
  profile: Profile
  onConfirm: () => void
  onRedo: () => void
}) {
  return (
    <div className="mx-auto max-w-2xl p-6">
      <Card className="p-6">
        <h2 className="text-lg font-semibold">Does this look right?</h2>
        <p className="mt-1 text-sm text-gray-600">{profile.summary || 'No summary extracted.'}</p>

        <div className="mt-4 space-y-4 text-sm">
          <section>
            <h3 className="font-medium text-gray-800">Titles</h3>
            <div className="mt-1 flex flex-wrap gap-2">
              {profile.titles.length ? (
                profile.titles.map((t, i) => (
                  <Badge key={i} tone="indigo">
                    {t.title}
                    {t.years ? ` · ${t.years}y` : ''}
                  </Badge>
                ))
              ) : (
                <span className="text-gray-500">None found</span>
              )}
            </div>
          </section>

          <section>
            <h3 className="font-medium text-gray-800">Skills ({profile.skills.length})</h3>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {profile.skills.slice(0, 40).map((s, i) => (
                <Badge key={i}>{s.name}</Badge>
              ))}
            </div>
          </section>

          <div className="grid grid-cols-2 gap-4">
            <section>
              <h3 className="font-medium text-gray-800">Experience</h3>
              <p className="text-gray-600">
                {profile.totalYears != null ? `${profile.totalYears} years total` : 'Not specified'}
              </p>
            </section>
            <section>
              <h3 className="font-medium text-gray-800">Languages</h3>
              <p className="text-gray-600">
                {profile.languages.length
                  ? profile.languages.map((l) => `${l.lang}${l.level ? ` (${l.level})` : ''}`).join(', ')
                  : 'Not specified'}
              </p>
            </section>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <Button onClick={onConfirm}>Looks good — set preferences</Button>
          <Button variant="ghost" onClick={onRedo}>
            Re-upload
          </Button>
        </div>
      </Card>
    </div>
  )
}