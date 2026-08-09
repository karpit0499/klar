import { zipSync } from 'fflate'
import type { ResumeData, ResumeLanguage } from '../resume/types'
import { resumeToDocxBlob } from '../resume/docx'
import { triggerBlobDownload } from '../export/download'
import {
  coverLetterFilename,
  coverLetterToDocxBlob,
  type CoverLetterModel,
} from '../application/coverLetterDocx'
import type { NormalizedJob } from '../types'
import {
  requireCurrentCoverLetterProvenance,
  type PacketArtifactProvenance,
} from './types'

/** Build one archive so mobile browsers only need to authorize one download. */
export async function applicationPacketZip(
  data: ResumeData,
  language: ResumeLanguage,
  stem: string,
  letter: CoverLetterModel,
  letterProvenance: PacketArtifactProvenance,
  job?: Pick<NormalizedJob, 'company' | 'title'>,
): Promise<Blob> {
  if (!letter) throw new TypeError('A cover-letter model is required for a packet ZIP.')
  requireCurrentCoverLetterProvenance(letterProvenance)
  const letterBlob = await coverLetterToDocxBlob(letter)
  const resumeName = `${stem}-${language}.docx`
  const resumeBlob = await resumeToDocxBlob(data, language)
  const files: Record<string, Uint8Array> = {
    [resumeName]: new Uint8Array(await resumeBlob.arrayBuffer()),
  }
  files[coverLetterFilename(letter, job)] = new Uint8Array(await letterBlob.arrayBuffer())
  return new Blob([zipSync(files, { level: 6 })], { type: 'application/zip' })
}

export async function downloadApplicationPacket(
  data: ResumeData,
  language: ResumeLanguage,
  stem: string,
  letter: CoverLetterModel,
  letterProvenance: PacketArtifactProvenance,
  job?: Pick<NormalizedJob, 'company' | 'title'>,
): Promise<string> {
  const filename = `${stem}-${language}-packet.zip`
  triggerBlobDownload(
    await applicationPacketZip(data, language, stem, letter, letterProvenance, job),
    filename,
  )
  return filename
}