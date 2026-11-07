declare module 'pdf-parse/lib/pdf-parse.js' {
  const pdfParse: (data: Buffer, opts?: { max?: number }) => Promise<{ text: string; numpages: number; info?: unknown }>;
  export default pdfParse;
}
declare module 'pdf-parse' {
  const pdfParse: (data: Buffer, opts?: { max?: number }) => Promise<{ text: string; numpages: number; info?: unknown }>;
  export default pdfParse;
}
