// Send the newest aim immediately. The worker cancels obsolete simulations at
// physics batch boundaries; ids keep delayed results off the current guide.
export class AimPrediction {
  constructor(createWorker, readTable) {
    this.createWorker = createWorker;
    this.readTable = readTable;
    this.sequence = 0;
  }
  warm() {
    if (this.worker || this.failed) return;
    try {
      const worker = this.worker = this.createWorker();
      worker.onmessage = ({ data }) => {
        if (this.worker !== worker || data.id !== this.current?.id) return;
        if (data.error) { this.fail(); return; }
        this.result = data;
      };
      worker.onerror = () => { if (this.worker === worker) this.fail(); };
    } catch { this.fail(); }
  }
  update(shot) {
    const key = JSON.stringify(shot);
    if (this.current?.key === key) return this.result;
    this.warm();
    this.current = { key, id: ++this.sequence };
    this.result = null;
    if (this.failed) return null;
    try {
      const fresh = !this.table;
      this.table ||= this.readTable();
      this.worker.postMessage({ aimPreview: true, id: this.current.id, shot, ...(fresh && { table: this.table }) });
    } catch { this.fail(); }
    return null;
  }
  fail() {
    this.worker?.terminate(); this.worker = null;
    this.result = null; this.failed = true;
  }
  clear() {
    if (this.current) {
      this.worker?.postMessage({ cancelAim: true });
      this.failed = false;
    }
    this.current = null; this.table = null; this.result = null;
  }
  dispose() {
    this.worker?.terminate(); this.worker = null;
    this.clear(); this.failed = false;
  }
}
