import extractors from './extractors';
import transformers from './transformers';

const DEBUG_EXTRACTOR = process.env['DEBUG_EXTRACTOR'];
const DEBUG_TRANSFORMER = process.env['DEBUG_TRANSFORMER'];
let isDebugMode = DEBUG_EXTRACTOR || DEBUG_TRANSFORMER;

const run = async () => {
  // Corriendo en modo debug
  if (isDebugMode) {
    console.log(`Running in debug mode...`);

    // Debug extractor
    if (DEBUG_EXTRACTOR) {
      // Encuentro el extractor
      const toDebug = extractors.find(
        (e) => e.config.source === DEBUG_EXTRACTOR
      );

      if (!toDebug) {
        console.error(`Extractor ${DEBUG_EXTRACTOR} not found`);
      } else {
        await toDebug.debug();
      }
    }

    // Debug transformer
    if (DEBUG_TRANSFORMER) {
      // Encuentro el transformer
      const toDebug = transformers.find((t) => t.getId() === DEBUG_TRANSFORMER);

      if (!toDebug) {
        console.error(`Transformer ${DEBUG_TRANSFORMER} not found`);
      } else {
        await toDebug.debug();
      }
    }
  }
  // Corriendo en modo producción
  else {
    // Ejecuto los extractores
    for (const extractor of extractors) {
      await extractor.extract();
    }

    // Ejecuto los transformers
    for (const transformer of transformers) {
      await transformer.run();
    }
  }

  process.exit(0);
};

run();
