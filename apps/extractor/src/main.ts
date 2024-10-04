import extractors from './extractors';

const EXTRACTOR_TO_TEST = process.env['TEST'];

const run = async () => {
  if (EXTRACTOR_TO_TEST) {
    const extractor = extractors.find(
      (e) => e.config.source === EXTRACTOR_TO_TEST
    );
    if (extractor) {
      console.log(`Testing extractor ${EXTRACTOR_TO_TEST}...`);
      await extractor.test();
      return;
    }
    console.error(`Extractor ${EXTRACTOR_TO_TEST} not found`);
    return;
  } else {
    for (const extractor of extractors) {
      await extractor.extract();
    }
  }
};

run();
