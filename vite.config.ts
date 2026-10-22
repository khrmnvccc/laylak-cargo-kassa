import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

// Free on-device receipt reading (tesseract.js): its worker, engine and language files are served
// from our own site under /ocr, so no outside CDN is needed and the photos never leave the phone.
const OCR_FILES: Record<string, string> = {
  'worker.min.js': 'node_modules/tesseract.js/dist/worker.min.js',
  'tesseract-core-lstm.wasm.js': 'node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js': 'node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-relaxedsimd-lstm.wasm.js': 'node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js',
  'lang/eng.traineddata.gz': 'node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz',
  'lang/rus.traineddata.gz': 'node_modules/@tesseract.js-data/rus/4.0.0_best_int/rus.traineddata.gz',
};

function ocrFiles(): Plugin {
  return {
    name: 'ocr-files',
    configureServer(server) {
      server.middlewares.use('/ocr', (req, res, next) => {
        const src = OCR_FILES[(req.url || '').replace(/^\//, '').split('?')[0]];
        if (!src) return next();
        res.setHeader('Content-Type', src.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
        fs.createReadStream(path.resolve(__dirname, src)).pipe(res);
      });
    },
    writeBundle(options) {
      const out = path.resolve(options.dir || 'dist', 'ocr');
      for (const [name, src] of Object.entries(OCR_FILES)) {
        fs.mkdirSync(path.dirname(path.join(out, name)), {recursive: true});
        fs.copyFileSync(path.resolve(__dirname, src), path.join(out, name));
      }
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), ocrFiles()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
