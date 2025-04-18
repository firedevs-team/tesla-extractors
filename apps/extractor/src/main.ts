import extractors from './extractors';
import generators from './generators';

const DEBUG_EXTRACTOR = process.env['DEBUG_EXTRACTOR'];
const DEBUG_GENERATOR = process.env['DEBUG_GENERATOR'];
let isDebugMode = DEBUG_EXTRACTOR || DEBUG_GENERATOR;

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

    // Debug generator
    if (DEBUG_GENERATOR) {
      // Encuentro el generator
      const toDebug = generators.find((t) => t.getId() === DEBUG_GENERATOR);

      if (!toDebug) {
        console.error(`Generator ${DEBUG_GENERATOR} not found`);
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

    // Ejecuto los generadores
    for (const generator of generators) {
      await generator.run();
    }
  }

  process.exit(0);
};

run();
