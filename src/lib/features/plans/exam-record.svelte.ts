import { browser } from "$app/environment";
import { parseExamImport, type ExamImport } from "./exam-import";

const KEY = "kcal-exam-mark-list";

/** Local only. This full attempt history is deliberately separate from cloud plan snapshots. */
class ExamRecord {
  data = $state<ExamImport | null>(null);
  error = $state("");
  constructor() {
    if (!browser) return;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.data = parseExamImport(JSON.parse(raw));
    } catch {
      this.error =
        "The saved mark list could not be read. Import it again to replace it.";
    }
  }
  save(data: ExamImport): boolean {
    try {
      const clean = parseExamImport(data);
      localStorage.setItem(KEY, JSON.stringify(clean));
      this.data = clean;
      this.error = "";
      return true;
    } catch {
      this.error =
        "This browser could not save the mark list. Download the export to keep a copy.";
      return false;
    }
  }
  clear() {
    try {
      localStorage.removeItem(KEY);
      this.data = null;
      this.error = "";
      return true;
    } catch {
      this.error = "This browser could not remove the saved mark list.";
      return false;
    }
  }
}

export const examRecord = new ExamRecord();
