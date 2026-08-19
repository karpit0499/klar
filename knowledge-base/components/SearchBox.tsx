"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { DocSearchItem } from "../lib/docs";
import { withBasePath } from "../lib/site";

let indexPromise: Promise<DocSearchItem[]> | undefined;

function normalizeSearch(value: string, digraph = false): string {
  const lower = value.toLocaleLowerCase("de-DE");
  return (digraph
    ? lower.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
    : lower)
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .trim();
}

function searchVariants(value: string): string[] {
  return [...new Set([normalizeSearch(value), normalizeSearch(value, true)].filter(Boolean))];
}

function loadSearchIndex(): Promise<DocSearchItem[]> {
  if (!indexPromise) {
    indexPromise = fetch(withBasePath("/search-index.json"), {
      cache: "force-cache",
    }).then(async (response) => {
      if (!response.ok) throw new Error(`Search index returned HTTP ${response.status}`);
      const value: unknown = await response.json();
      if (!Array.isArray(value)) throw new Error("Search index is not an array");
      return value as DocSearchItem[];
    }).catch((error) => {
      indexPromise = undefined;
      throw error;
    });
  }
  return indexPromise;
}

function score(item: DocSearchItem, query: string): number {
  const queryVariants = searchVariants(query).map((value) => value.split(/\s+/).filter(Boolean));
  const terms = Array.from(
    { length: Math.max(0, ...queryVariants.map((value) => value.length)) },
    (_, index) => [...new Set(queryVariants.map((value) => value[index]).filter(Boolean))],
  );
  if (!terms.length) return 0;

  const title = searchVariants(item.title);
  const description = searchVariants(item.description);
  const section = searchVariants(item.section);
  const haystack = searchVariants(item.searchText);
  const fields = [title, description, section, haystack];
  let total = 0;

  for (const aliases of terms) {
    const has = (values: string[]) => aliases.some((term) => values.some((value) => value.includes(term)));
    if (!fields.some(has)) {
      return 0;
    }
    if (aliases.some((term) => title.some((value) => value === term))) total += 100;
    if (aliases.some((term) => title.some((value) => value.startsWith(term)))) total += 40;
    if (has(title)) total += 24;
    if (has(section)) total += 12;
    if (has(description)) total += 8;
    if (has(haystack)) total += 3;
  }
  return total;
}

export function SearchBox() {
  const router = useRouter();
  const listId = useId();
  const statusId = useId();
  const [items, setItems] = useState<DocSearchItem[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const ensureIndex = useCallback(async () => {
    if (state === "loading" || state === "ready") return;
    setState("loading");
    try {
      setItems(await loadSearchIndex());
      setState("ready");
    } catch {
      setState("error");
    }
  }, [state]);

  const results = useMemo(() => items
    .map((item) => ({ item, score: score(item, query) }))
    .filter((result) => result.score > 0)
    .sort((left, right) =>
      right.score - left.score || left.item.title.localeCompare(right.item.title),
    )
    .slice(0, 8), [items, query]);

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        input.current?.focus();
        setOpen(true);
        void ensureIndex();
      }
      if (event.key === "Escape" && open) {
        setOpen(false);
        input.current?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onShortcut);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onShortcut);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [ensureIndex, open]);

  const listOpen = open && Boolean(query.trim());
  const activeResult = activeIndex >= 0 ? results[activeIndex] : undefined;
  const statusText = state === "loading"
    ? "Loading search results."
    : state === "error"
      ? "Search is unavailable."
      : listOpen
        ? `${results.length} result${results.length === 1 ? "" : "s"} available.`
        : "";

  return (
    <div className="search" ref={root}>
      <label className="sr-only" htmlFor="kb-search">Search the Klar knowledge base</label>
      <span className="search-mark" aria-hidden="true">⌕</span>
      <input
        ref={input}
        id="kb-search"
        type="search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={listOpen}
        aria-controls={listId}
        aria-describedby={statusId}
        aria-activedescendant={activeResult ? `${listId}-${activeIndex}` : undefined}
        placeholder="Search the knowledge base"
        autoComplete="off"
        value={query}
        onFocus={() => { setOpen(true); void ensureIndex(); }}
        onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); setOpen(true); void ensureIndex(); }}
        onKeyDown={(event) => {
          if (!listOpen || !results.length) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((current) => (current + 1) % results.length);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((current) => (current <= 0 ? results.length - 1 : current - 1));
          } else if (event.key === "Enter" && activeResult) {
            event.preventDefault();
            setOpen(false);
            router.push(`/docs/${activeResult.item.slug}`);
          } else if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
          }
        }}
      />
      <kbd aria-hidden="true">Ctrl/⌘ K</kbd>
      <span id={statusId} className="sr-only" role="status" aria-live="polite">{statusText}</span>
      {listOpen && (
        <div className="search-results">
          {state === "loading" ? <p>Loading search…</p>
            : state === "error" ? <p>Search is unavailable. Browse the documentation index.</p>
              : results.length ? (
                <ul id={listId} role="listbox" aria-label="Knowledge-base search results">
                  {results.map(({ item }, index) => (
                    <li key={item.slug} role="none">
                      <Link
                        id={`${listId}-${index}`}
                        role="option"
                        aria-selected={index === activeIndex}
                        href={`/docs/${item.slug}`}
                        onPointerMove={() => setActiveIndex(index)}
                        onClick={() => setOpen(false)}
                      >
                        <span className="search-result-section">{item.section}</span>
                        <strong>{item.title}</strong>
                        <span>{item.description}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : <p>No matching pages. Try a feature, system, or task name.</p>}
        </div>
      )}
    </div>
  );
}
