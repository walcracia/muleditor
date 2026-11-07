import type { DocumentAnalysis, DocumentFormat } from "../types";
import { getFormatAdapter } from "./formatAdapters";

export function analyzeDocument(format: DocumentFormat, content: string): DocumentAnalysis {
  return getFormatAdapter(format).analyze(content);
}
