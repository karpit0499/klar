// ============================================================================
// v2.5 — vault-aware packet persistence.
//
// v2.3 deliberately reserved `packets: unknown[]` inside the encrypted vault
// content "so later packet persistence cannot accidentally bypass the vault".
// This module is that later work, and it honours the reservation: when
// encryption is on, packets live inside the ciphertext and never touch a
// plaintext store; when it is off, they live in the new Dexie `packets` table.
//
// Every mutation goes through `updatePacket`, which is also the autosave: the UI
// never holds unsaved state longer than one interaction.
// ============================================================================
import { db } from '../db/db'
import { getVaultStatus, readSensitiveContent, updateSensitiveContent } from '../crypto/vault'
import { GENERATION } from '../lib/config'
import type { NormalizedJob } from '../types'
import {
  newPacket, packetId, type PacketExport, type PacketGeneration, type PacketKind, type PacketRow,
} from './types'

export async function listPackets(): Promise<PacketRow[]> {
  const status = await getVaultStatus()
  if (status === 'unlocked') {
    return [...((await readSensitiveContent())?.packets ?? [])].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    )
  }
  if (status === 'locked') await readSensitiveContent()
  return db.packets.orderBy('updatedAt').reverse().toArray()
}

export async function loadPacket(id: string): Promise<PacketRow | null> {
  const status = await getVaultStatus()
  if (status === 'unlocked') {
    return (await readSensitiveContent())?.packets.find((row) => row.id === id) ?? null
  }
  if (status === 'locked') await readSensitiveContent()
  return (await db.packets.get(id)) ?? null
}

export async function savePacket(row: PacketRow): Promise<PacketRow> {
  const next: PacketRow = { ...row, updatedAt: new Date().toISOString() }
  const status = await getVaultStatus()
  if (status === 'unlocked') {
    await updateSensitiveContent((content) => {
      const index = content.packets.findIndex((item) => item.id === next.id)
      if (index >= 0) content.packets[index] = next
      else content.packets.push(next)
    })
    return next
  }
  if (status === 'locked') await readSensitiveContent()
  else await db.packets.put(next)
  return next
}

/** Load-or-create, so opening a job twice always returns the same packet. */
export async function openPacket(kind: PacketKind, job: NormalizedJob): Promise<PacketRow> {
  const id = packetId(kind, job.id)
  const existing = await loadPacket(id)
  if (existing) {
    // Refresh the snapshot: postings change wording, our copy should stay current.
    return savePacket({ ...existing, job })
  }
  return savePacket(newPacket(kind, job))
}

/** The single mutation path — also the autosave. */
export async function updatePacket(
  id: string,
  mutate: (packet: PacketRow) => void,
): Promise<PacketRow | null> {
  const current = await loadPacket(id)
  if (!current) return null
  const draft: PacketRow = structuredClone(current)
  mutate(draft)
  return savePacket(draft)
}

export async function deletePacket(id: string): Promise<void> {
  const status = await getVaultStatus()
  if (status === 'unlocked') {
    await updateSensitiveContent((content) => {
      content.packets = content.packets.filter((row) => row.id !== id)
    })
    return
  }
  if (status === 'locked') await readSensitiveContent()
  else await db.packets.delete(id)
}

export async function recordPacketExport(id: string, entry: PacketExport): Promise<void> {
  await updatePacket(id, (packet) => {
    packet.exportHistory = [entry, ...packet.exportHistory].slice(0, 20)
  })
}

/** Bounded per-packet version history (config: packetVersionLimit). */
export async function pushPacketVersion(id: string, label: string): Promise<void> {
  await updatePacket(id, (packet) => {
    packet.versions = [
      {
        at: new Date().toISOString(),
        label,
        snapshot: {
          notes: packet.notes,
          languages: structuredClone(packet.languages),
          flexible: packet.flexible ? structuredClone(packet.flexible) : undefined,
        },
      },
      ...packet.versions,
    ].slice(0, GENERATION.packetVersionLimit)
  })
}

export async function restorePacketVersion(id: string, at: string): Promise<PacketRow | null> {
  return updatePacket(id, (packet) => {
    const version = packet.versions.find((item) => item.at === at)
    if (!version) return
    packet.notes = version.snapshot.notes
    packet.languages = structuredClone(version.snapshot.languages)
    packet.flexible = version.snapshot.flexible ? structuredClone(version.snapshot.flexible) : undefined
  })
}

/**
 * Interrupted-generation recovery. A stage is marked before the network call and
 * cleared after it, so a packet that still carries `generation` after a reload
 * tells the UI exactly what was in flight when the tab closed.
 */
export async function beginGeneration(id: string, generation: PacketGeneration): Promise<void> {
  await updatePacket(id, (packet) => {
    packet.generation = generation
  })
}

export async function endGeneration(id: string): Promise<void> {
  await updatePacket(id, (packet) => {
    delete packet.generation
  })
}