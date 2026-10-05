export const DOCUMENT_LIMIT: number;
export function documentType(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'application/pdf';
export function safeFilename(value: unknown): string;
