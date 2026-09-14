// A posted task lets new aim messages run without nested timer clamping adding
// several milliseconds to every physics batch.
function taskPause() {
  const channel = new MessageChannel();
  let resume;
  channel.port1.onmessage = () => { const done = resume; resume = null; done(); };
  return () => new Promise(resolve => { resume = resolve; channel.port2.postMessage(null); });
}

// Cooperatively run exact physics with a bounded amount of obsolete work.
export class AimWorkerRunner {
  constructor(simulate, publish, { now = () => performance.now(), pause } = {}) {
    this.simulate = simulate; this.publish = publish; this.now = now; this.pause = pause || taskPause();
  }
  request(data) {
    if (data.table) this.table = data.table;
    this.latest = { ...data, table: this.table };
    if (!this.running) this.run();
  }
  cancel() { this.latest = null; this.table = null; }
  async run() {
    this.running = true;
    try {
      while (this.latest) {
        const request = this.latest;
        let simulation;
        try {
          simulation = this.simulate(request);
          let deadline = this.now() + 6;
          while (this.latest === request) {
            const next = simulation.next();
            if (next.done) {
              this.publish({ id: request.id, ...next.value });
              this.latest = null;
              break;
            }
            if (this.now() >= deadline) {
              await this.pause();
              deadline = this.now() + 6;
            }
          }
        } catch (error) {
          if (this.latest === request) { this.publish({ id: request.id, error: error.message }); this.latest = null; }
        } finally { simulation?.return(); }
      }
    } finally { this.running = false; }
  }
}
