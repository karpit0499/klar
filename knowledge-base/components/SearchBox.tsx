"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { DocSearchItem } from "../lib/docs";

function score(item: DocSearchItem, query: string): number {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return 0;
  const title = item.title.toLowerCase();
  const description = item.description.toLowerCase();
  const section = item.section.toLowerCase();
  const haystack = item.searchText.toLowerCase();
  let total = 0;
  for (const term of normalized.split(/\s+/).filter(Boolean)) {
    if (title === term) total += 100;
    if (title.startsWith(term)) total += 40;
    if (title.includes(term)) total += 24;
    if (section.includes(term)) total += 12;
    if (description.includes(term)) total += 8;
    if (haystack.includes(term)) total += 3;
    else return 0;
  }
  return total;
}

export function SearchBox({ items }: { items: DocSearchItem[] }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const results = useMemo(() => items
    .map((item) => ({ item, score: score(item, query) }))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.item.title.localeCompare(right.item.title))
    .slice(0, 8), [items, query]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        root.current?.querySelector("input")?.focus();
        setOpen(true);
      }
      if (event.key === "Escape") setOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, []);

  return (
    <div className="search" ref={root}>
      <label className="sr-only" htmlFor="kb-search">Search the Klar knowledge base</label>
      <span className="search-mark" aria-hidden="true">⌕</span>
      <input
        id="kb-search"
        type="search"
        placeholder="Search the knowledge base"
        autoComplete="off"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
      />
      <kbd>⌘ K</kbd>
      {open && query.trim() && (
        <div className="search-results" role="list" aria-label="Knowledge-base search results">
          {results.length ? results.map(({ item }) => (
            <Link key={item.slug} href={`/docs/${item.slug}`} onClick={() => setOpen(false)}>
              <span className="search-result-section">{item.section}</span>
              <strong>{item.title}</strong>
              <span>{item.description}</span>
            </Link>
          )) : <p>No matching pages. Try a feature, system, or task name.</p>}
        </div>
      )}
    </div>
  );
}
