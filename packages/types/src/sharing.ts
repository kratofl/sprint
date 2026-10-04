// Lap sharing contracts (#197), mirroring app/Sprint.Contracts/LapShare.cs.
//
// The lap's channels never appear as fields here. They travel as one opaque base64 payload,
// byte-for-byte the same as an exported `.sprintlap` file, so a file and a fetched lap cannot
// disagree about what the lap was. Web surfaces list and revoke shares; decoding a trace is the
// desktop's job.

/** What a driver uploads when they share a lap. */
export interface ShareLapInput {
  game: string
  trackCourse: string
  carModel: string
  lapNumber: number
  lapTimeSeconds: number
  /** When the lap was driven, if known. */
  drivenAt?: string | null
  /** The `.sprintlap` bytes, base64. */
  payloadBase64: string
}

/** A lap the signed-in driver has shared. No payload — this is the library listing. */
export interface SharedLapSummary {
  id: string
  shareCode: string
  game: string
  trackCourse: string
  carModel: string
  lapNumber: number
  lapTimeSeconds: number
  /** Revoked codes stay listed so the owner can see what they have withdrawn. */
  revoked: boolean
  createdAt: string
}

/** A lap fetched with a code: who drove it, and the payload. */
export interface SharedLapDto {
  shareCode: string
  /** The owner's display name, never their email. */
  sharedBy: string
  game: string
  trackCourse: string
  carModel: string
  lapNumber: number
  lapTimeSeconds: number
  drivenAt?: string | null
  payloadBase64: string
}
