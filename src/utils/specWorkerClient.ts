import {
  DEFAULT_NOISE_CONFIG,
  type NoiseFilterConfig,
  type SingleSpecParseOutput,
  type WorkerProgress,
} from '../types/spec';

let requestCounter = 0;

export function parsePdfInWorker(
  buffer: ArrayBuffer,
  fileName: string,
  onProgress: (progress: WorkerProgress) => void,
  noiseConfig: NoiseFilterConfig = DEFAULT_NOISE_CONFIG
): { promise: Promise<SingleSpecParseOutput>; cancel: () => void } {
  const worker = new Worker(new URL('../workers/pdf-parser.worker.ts', import.meta.url), {
    type: 'module',
  });
  const requestId = `req_${++requestCounter}`;
  let settled = false;

  const promise = new Promise<SingleSpecParseOutput>((resolve, reject) => {
    worker.onmessage = (event) => {
      const msg = event.data;
      if (!msg || msg.requestId !== requestId) return;

      if (msg.type === 'progress') {
        onProgress(msg.payload as WorkerProgress);
      } else if (msg.type === 'complete') {
        settled = true;
        worker.terminate();
        resolve(msg.payload as SingleSpecParseOutput);
      } else if (msg.type === 'error') {
        settled = true;
        worker.terminate();
        reject(new Error(String(msg.payload)));
      }
    };

    worker.onerror = (err) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      reject(new Error(err.message || 'Web Worker execution error.'));
    };

    // Clone buffer before transferring so caller retains original bytes (e.g. pdf-lib slicing)
    const transferableCopy = buffer.slice(0);
    worker.postMessage(
      {
        type: 'parse-pdf',
        requestId,
        buffer: transferableCopy,
        fileName,
        noiseConfig,
      },
      [transferableCopy]
    );
  });

  return {
    promise,
    cancel: () => {
      if (!settled) {
        settled = true;
        worker.terminate();
      }
    },
  };
}
