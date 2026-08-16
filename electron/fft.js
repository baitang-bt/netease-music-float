/**
 * Computes magnitudes for the first half of a real FFT (radix-2).
 * @param {Float32Array|number[]} samples Time-domain samples (length power of 2).
 * @returns {Float32Array} Magnitudes for bins 0..n/2-1.
 */
function computeSpectrumMagnitudes(samples) {
  const n = samples.length;
  if (n < 2 || (n & (n - 1)) !== 0) {
    throw new Error("FFT input length must be a power of 2");
  }

  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    // Hann window reduces spectral leakage for short PCM chunks.
    const window = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
    real[i] = samples[i] * window;
  }

  fftInPlace(real, imag);

  const half = n / 2;
  const magnitudes = new Float32Array(half);
  for (let i = 0; i < half; i += 1) {
    magnitudes[i] = Math.hypot(real[i], imag[i]) / half;
  }
  return magnitudes;
}

/**
 * Averages FFT magnitudes into raw band levels (before display gain).
 * @param {Float32Array} magnitudes
 * @param {number} bandCount
 * @returns {number[]}
 */
function magnitudesToBands(magnitudes, bandCount) {
  const bands = new Array(bandCount).fill(0);
  if (!magnitudes.length || bandCount < 1) {
    return bands;
  }

  for (let band = 0; band < bandCount; band += 1) {
    const start = Math.floor((band / bandCount) * magnitudes.length);
    const end = Math.floor(((band + 1) / bandCount) * magnitudes.length);
    let sum = 0;
    const count = Math.max(1, end - start);
    for (let i = start; i < end; i += 1) {
      sum += magnitudes[i];
    }
    bands[band] = sum / count;
  }
  return bands;
}

/**
 * Creates an AGC normalizer so quiet and loud tracks both fill the visualizer.
 * @param {{ targetPeak?: number, minFloor?: number }} [options]
 * @returns {(rawBands: number[]) => number[]}
 */
function createBandNormalizer(options = {}) {
  const targetPeak = options.targetPeak ?? 0.88;
  const minFloor = options.minFloor ?? 0.018;
  let peakEnvelope = minFloor;

  /**
   * Scales raw bands into 0..1 using a slow-attack / slower-release peak tracker.
   * @param {number[]} rawBands
   */
  return function normalizeBands(rawBands) {
    if (!Array.isArray(rawBands) || !rawBands.length) {
      return [];
    }

    let framePeak = 0;
    for (let i = 0; i < rawBands.length; i += 1) {
      if (rawBands[i] > framePeak) {
        framePeak = rawBands[i];
      }
    }

    if (framePeak > peakEnvelope) {
      // Rise quickly when the track gets louder.
      peakEnvelope = peakEnvelope * 0.35 + framePeak * 0.65;
    } else {
      // Fall fast enough that quieter passages don't look stuck high.
      peakEnvelope = peakEnvelope * 0.92 + framePeak * 0.08;
    }
    peakEnvelope = Math.max(peakEnvelope, minFloor);

    const gain = targetPeak / peakEnvelope;
    const out = new Array(rawBands.length);
    for (let i = 0; i < rawBands.length; i += 1) {
      const boosted = rawBands[i] * gain;
      // Mild compression keeps peaks readable without flattening dynamics.
      out[i] = Math.min(1, Math.pow(Math.max(0, boosted), 0.72));
    }
    return out;
  };
}

/**
 * In-place Cooley–Tukey radix-2 FFT on separate real/imag arrays.
 * @param {Float32Array} real
 * @param {Float32Array} imag
 */
function fftInPlace(real, imag) {
  const n = real.length;
  let j = 0;
  for (let i = 1; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      const tr = real[i];
      real[i] = real[j];
      real[j] = tr;
      const ti = imag[i];
      imag[i] = imag[j];
      imag[j] = ti;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      for (let k = 0; k < len / 2; k += 1) {
        const uRe = real[i + k];
        const uIm = imag[i + k];
        const vRe = real[i + k + len / 2] * wRe - imag[i + k + len / 2] * wIm;
        const vIm = real[i + k + len / 2] * wIm + imag[i + k + len / 2] * wRe;
        real[i + k] = uRe + vRe;
        imag[i + k] = uIm + vIm;
        real[i + k + len / 2] = uRe - vRe;
        imag[i + k + len / 2] = uIm - vIm;
        const nextWRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nextWRe;
      }
    }
  }
}

module.exports = {
  computeSpectrumMagnitudes,
  magnitudesToBands,
  createBandNormalizer,
  fftInPlace
};
