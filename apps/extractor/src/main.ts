// import extractors from './extractors';

// const run = async () => {
//   for (const extractor of extractors) {
//     await extractor.run();
//   }
// };

// run();

import extractors from './extractors/indexV2';

const run = async () => {
  for (const extractor of extractors) {
    await extractor.reindex();
  }
};

run();
