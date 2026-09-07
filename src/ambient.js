// Quiet, procedural room beds. Created only after a user gesture; no downloads
// or speech. One graph is owned by the active room and torn down on a change.
export class RoomAmbience {
  constructor(ctx, destination, id) {
    this.nodes = []; this.sources = [];
    if (id === 'minimal') return;
    const gain = this.node(ctx.createGain()); gain.gain.value = 0.055; gain.connect(destination);
    const tone = (frequency, volume) => {
      const oscillator = this.node(ctx.createOscillator()), level = this.node(ctx.createGain());
      oscillator.type = 'sine'; oscillator.frequency.value = frequency; level.gain.value = volume;
      oscillator.connect(level).connect(gain); oscillator.start(); this.sources.push(oscillator);
      return level.gain;
    };
    if (id === 'corner' || id === 'orbital') {
      const notes = id === 'corner' ? [130.81, 164.81, 196, 246.94] : [55, 82.41, 110.2];
      notes.forEach((frequency, i) => {
        const amplitude = tone(frequency, id === 'corner' ? 0.11 : 0.09);
        const lfo = this.node(ctx.createOscillator()), depth = this.node(ctx.createGain());
        lfo.frequency.value = 0.07 + i * 0.019; depth.gain.value = 0.04;
        lfo.connect(depth).connect(amplitude); lfo.start(); this.sources.push(lfo);
      });
    } else {
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate), data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const source = this.node(ctx.createBufferSource()), filter = this.node(ctx.createBiquadFilter());
      source.buffer = buffer; source.loop = true; filter.type = 'lowpass'; filter.frequency.value = id === 'tokyo' ? 2600 : 460; filter.Q.value = 0.4;
      source.connect(filter).connect(gain); source.start(); this.sources.push(source);
      if (id === 'desert') {
        const wind = this.node(ctx.createOscillator()), depth = this.node(ctx.createGain());
        wind.frequency.value = 0.13; depth.gain.value = 180; wind.connect(depth).connect(filter.frequency); wind.start(); this.sources.push(wind);
      }
    }
  }
  node(node) { this.nodes.push(node); return node; }
  dispose() { this.sources.forEach(source => source.stop()); this.nodes.forEach(node => node.disconnect()); this.sources = []; this.nodes = []; }
}
