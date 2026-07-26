import { strToU8, zipSync } from 'fflate'
import type { ResumeData, ResumeLanguage } from '../resume/types'
import { resumeToDocxBlob } from '../resume/docx'
import { triggerBlobDownload } from '../export/download'

/** Build one archive so mobile browsers only need to authorize one download. */
export async function applicationPacketZip(
  data: ResumeData,
  language: ResumeLanguage,
  stem: string,
  letter?: string,
): Promise<Blob> {
  const resumeName = `${stem}-${language}.docx`
  const resumeBlob = await resumeToDocxBlob(data, language)
  const files: Record<string, Uint8Array> = {
    [resumeName]: new Uint8Array(await resumeBlob.arrayBuffer()),
  }
  if (letter?.trim()) {
    files[`${stem}-cover-letter-${language}.txt`] = strToU8(letter)
  }
  return new Blob([zipSync(files, { level: 6 })], { type: 'application/zip' })
}

export async function downloadApplicationPacket(
  data: ResumeData,
  language: ResumeLanguage,
  stem: string,
  letter?: string,
): Promise<string> {
  const filename = `${stem}-${language}-packet.zip`
  triggerBlobDownload(await applicationPacketZip(data, language, stem, letter), filename)
  return filename
}
