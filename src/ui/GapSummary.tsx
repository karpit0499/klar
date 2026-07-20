// The headline "skill-gap analysis" panel (feature 1.1): rolls per-job gaps up
// across the ranked set into the most-leverage skills to learn next.
import { Card, Badge } from './atoms'
import type { GapSummary as GapData } from '../match/gaps'

export function GapSummary({ data }: { data: GapData }) {
  if (data.considered === 0 || data.gaps.length === 0) return null
  const top = data.gaps.slice(0, 8)
  const lead = top[0]
  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold text-gray-800">Your top skill gaps</h3>
      <p className="mt-1 text-sm text-gray-600">
        Across your top {data.considered} matches, <span className="font-medium">{lead.skill}</span> is
        missing in {lead.count} of them ({Math.round(lead.share * 100)}%) — your #1 leverage skill.
      </p>
      <div className="mt-3 space-y-1.5">
        {top.map((g) => (
          <div key={g.skill} className="flex items-center gap-2">
            <span className="w-40 shrink-0 truncate text-sm text-gray-700">{g.skill}</span>
            <div className="h-2 flex-1 rounded-full bg-gray-200">
              <div
                className="h-2 rounded-full bg-indigo-500"
                style={{ width: `${Math.round(g.share * 100)}%` }}
              />
            </div>
            <Badge tone="gray">
              {g.count}/{data.considered}
            </Badge>
          </div>
        ))}
      </div>
    </Card>
  )
}