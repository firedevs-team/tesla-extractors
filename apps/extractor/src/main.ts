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
      const extractor = extractors.find(
        (e) => e.config.source === DEBUG_EXTRACTOR
      );

      if (!extractor) {
        console.error(`Extractor ${DEBUG_EXTRACTOR} not found`);
      } else {
        await extractor.debug();
      }
    }

    // Debug transformer
    if (DEBUG_TRANSFORMER) {
      throw new Error('Not implemented yet');
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
};

run();
