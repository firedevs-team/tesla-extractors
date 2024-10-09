import extractors from './extractors';

const EXTRACTOR_TO_DEBUG = process.env['DEBUG'];

const run = async () => {
  if (EXTRACTOR_TO_DEBUG) {
    const extractor = extractors.find(
      (e) => e.config.source === EXTRACTOR_TO_DEBUG
    );
    if (extractor) {
      console.log(`Running in debug mode...`);
      await extractor.debug();
      return;
    }
    console.error(`Extractor ${EXTRACTOR_TO_DEBUG} not found`);
    return;
  } else {
    for (const extractor of extractors) {
      await extractor.extract();
    }
  }
};

run();
