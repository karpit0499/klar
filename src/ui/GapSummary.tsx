// The headline "skill-gap analysis" panel (feature 1.1): rolls per-job gaps up
// across the ranked set into the most-leverage skills to learn next.
import { Card, Badge } from './atoms'
import type { GapSummary as GapData } from '../match/gaps'
import { useT } from '../i18n/LocaleProvider'

export function GapSummary({ data }: { data: GapData }) {
  const t = useT()
  if (data.considered === 0 || data.gaps.length === 0) return null
  const top = data.gaps.slice(0, 8)
  const lead = top[0]
  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold text-ink">{t('gap.title')}</h3>
      <p className="mt-1 text-sm text-muted">
        {t('gap.lead', {
          considered: data.considered,
          skill: lead.skill,
          count: lead.count,
          pct: Math.round(lead.share * 100),
        })}
      </p>
      <div className="mt-3 space-y-1.5">
        {top.map((g) => (
          <div key={g.skill} className="flex items-center gap-2">
            <span className="w-40 shrink-0 truncate text-sm text-ink">{g.skill}</span>
            <div className="h-2 flex-1 rounded-full bg-border">
              <div
                className="h-2 rounded-full bg-accent"
                style={{ width: `${Math.round(g.share * 100)}%` }}
              />
            </div>
            <Badge tone="neutral">
              {g.count}/{data.considered}
            </Badge>
          </div>
        ))}
      </div>
    </Card>
  )
}