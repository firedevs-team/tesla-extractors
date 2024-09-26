import extractors from './extractors';

const run = async () => {
  for (const extractor of extractors) {
    await extractor.extract();
  }
};

run();
